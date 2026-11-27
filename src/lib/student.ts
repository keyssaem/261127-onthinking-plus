import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db, isPermissionError } from './firebase'
import { catOf, type CatName, type Student } from './types'

const MODE_KEY = 'onthink.mode' // 'class' | 'guest'
function setMode(mode: 'class' | 'guest' | null) {
  try {
    if (mode) localStorage.setItem(MODE_KEY, mode)
    else localStorage.removeItem(MODE_KEY)
  } catch {
    /* 저장소 차단 환경 무시 */
  }
}
function getMode() {
  try {
    return localStorage.getItem(MODE_KEY)
  } catch {
    return null
  }
}

/**
 * 한 페이지 안에서 로그인 사용자가 바뀌면 Firestore 연결이 이전 인증으로 읽기를 보내는 문제가 있어
 * (실측: 다른 사용자로 바꾼 뒤 정답 열람이 거부됨) 사용자 교체는 항상 '로그아웃 → 페이지 새로고침' 으로 한다.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '') // GitHub Pages 하위 경로 (로컬은 빈 문자열)

/** 앱 안 경로 (예: /learn) — 주소창 경로에서 배포 하위 경로를 뺀 것 */
export const appPath = () => window.location.pathname.slice(BASE.length) || '/'

export async function signOutAndReload(to: string) {
  if (auth) await signOut(auth)
  window.location.assign(BASE + to)
}

/** 익명 로그인 보장 (이미 익명이면 그대로 사용) */
async function ensureAnon(): Promise<User> {
  if (!auth) throw new Error('Firebase 설정이 필요합니다')
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    // 교사 계정 등 → 새 페이지에서 다시 시작
    await signOutAndReload(appPath() + window.location.search)
    throw new Error('다시 시작하는 중…')
  }
  if (auth.currentUser) return auth.currentUser
  try {
    return (await signInAnonymously(auth)).user
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (code.includes('admin-restricted') || code.includes('operation-not-allowed'))
      throw new Error('아직 학생 입장이 열려 있지 않아요. 선생님께 알려 주세요.')
    throw new Error(`로그인 실패: ${code}`)
  }
}

export type ClassInfo = { classId: string; name: string }

/** 1단계: 학급코드 확인 → 학급 이름 */
export async function lookupClass(joinCode: string): Promise<ClassInfo> {
  if (!db) throw new Error('Firebase 설정이 필요합니다')
  await ensureAnon()
  const code = joinCode.trim().toUpperCase()
  const snap = await getDoc(doc(db, 'joinCodes', code)).catch(() => null)
  if (!snap?.exists()) throw new Error('학급코드를 다시 확인해 주세요')
  const classId = snap.data().classId as string
  const cls = await getDoc(doc(db, 'classes', classId))
  return { classId, name: (cls.data()?.name as string) ?? '' }
}

/** 같은 번호로 이미 들어온 친구가 있는지 (닉네임·고양이 반환) */
export async function existingStudent(classId: string, number: number): Promise<{ nickname: string; cat: CatName } | null> {
  if (!db) return null
  const s = await getDoc(doc(db, 'classes', classId, 'students', String(number))).catch(() => null)
  if (!s?.exists()) return null
  return { nickname: (s.data().nickname as string) ?? '', cat: catOf(s.data().cat, number) }
}

/** 2단계: 번호·닉네임으로 학급에 들어가기 (교사 사전 등록 없음) */
export async function joinClass(classId: string, number: number, nickname: string, cat: CatName) {
  if (!db) throw new Error('Firebase 설정이 필요합니다')
  const user = await ensureAnon()
  const sid = String(number)
  const batch = writeBatch(db)
  batch.set(doc(db, 'members', user.uid), { classId, studentId: sid, joinedAt: serverTimestamp() })
  batch.set(
    doc(db, 'classes', classId, 'students', sid),
    { number, nickname: nickname.trim(), cat, level: 2, lastJoinedAt: serverTimestamp() },
    { merge: true },
  )
  try {
    await batch.commit()
  } catch (e) {
    if (isPermissionError(e)) throw new Error('입장하지 못했어요. 번호(1~99)와 닉네임(12자 이내)을 확인해 주세요.')
    throw e
  }
  setMode('class')
}

/**
 * 비회원 혼자 연습: 학급 기록과 섞이지 않게 새 익명 계정으로 시작.
 * 이미 다른 계정으로 로그인돼 있으면 로그아웃 후 /learn 을 새로 열고, 거기서 useStudent 가 익명 로그인한다.
 * 반환값 false = 페이지를 새로 여는 중(호출한 쪽은 이동하지 말 것)
 */
export async function startGuest(): Promise<boolean> {
  if (!auth) throw new Error('Firebase 설정이 필요합니다')
  const alreadyGuest = getMode() === 'guest' && auth.currentUser?.isAnonymous
  setMode('guest')
  if (alreadyGuest) return true
  if (auth.currentUser) {
    await signOutAndReload('/learn')
    return false
  }
  await ensureAnon()
  return true
}

/** 나가기: 로그아웃 후 첫 화면을 새로 연다 (같은 기기를 다음 학생이 쓸 수 있게) */
export async function leaveStudent() {
  setMode(null)
  await signOutAndReload('/')
}

/** 현재 기기의 학생 (학급 학생 또는 비회원), 없으면 null */
export function useStudent() {
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false)
      return
    }
    return onAuthStateChanged(auth, async (user) => {
      // 혼자 연습으로 새로 연 페이지: 여기서 익명 로그인 (다음 상태 변화에서 학생이 채워짐)
      if (!user && getMode() === 'guest') {
        signInAnonymously(auth!).catch(() => {
          setStudent(null)
          setLoading(false)
        })
        return
      }
      if (!user || !user.isAnonymous) {
        setStudent(null)
        setLoading(false)
        return
      }
      try {
        const m = getMode() === 'guest' ? null : await getDoc(doc(db!, 'members', user.uid))
        if (m?.exists()) {
          const { classId, studentId } = m.data() as { classId: string; studentId: string }
          const s = await getDoc(doc(db!, 'classes', classId, 'students', studentId))
          const d = s.data() ?? {}
          setStudent({
            id: studentId,
            class_id: classId,
            number: Number(d.number ?? studentId),
            nickname: (d.nickname as string) ?? '',
            level: Number(d.level ?? 2),
            guest: false,
            cat: catOf(d.cat, Number(d.number ?? studentId)),
          })
        } else if (getMode() === 'guest') {
          setStudent({ id: user.uid, class_id: null, number: 0, nickname: '연습생', level: 2, guest: true, cat: 'cheese' })
        } else {
          setStudent(null)
        }
      } catch {
        setStudent(null)
      }
      setLoading(false)
    })
  }, [])

  return { student, loading }
}
