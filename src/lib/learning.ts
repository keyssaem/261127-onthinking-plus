import {
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  type DocumentReference,
} from 'firebase/firestore'
import { auth, db, isPermissionError } from './firebase'
import type { Item, Student } from './types'

/** 학생 기록 저장 위치: 학급 학생 → classes/{학급}, 비회원 → guests/{uid} */
export function studentBase(student: Student): [string, string] {
  return student.guest || !student.class_id ? ['guests', student.id] : ['classes', student.class_id]
}

/**
 * 응답 기록 + 채점
 * 학생 기기는 정답을 모른다. isCorrect=true 로 저장을 시도해 보고,
 * 보안 규칙이 거부하면(=오답) isCorrect=false 로 다시 저장한다. 규칙이 정답과 대조하므로 위조 불가.
 * 반환: true(정답) / false(오답) / null(채점 대상 아님)
 */
export async function recordAttempt(
  student: Student,
  item: Item,
  response: unknown,
  tryNo: 1 | 2 = 1,
  timeMs?: number,
): Promise<boolean | null> {
  if (!db || !auth?.currentUser) throw new Error('로그인이 필요합니다')
  const uid = auth.currentUser.uid
  const base = studentBase(student)
  const attempts = collection(db, ...base, 'attempts')
  const ref: DocumentReference =
    tryNo === 2 ? doc(attempts, `${uid}__${item.id}__2`) : doc(attempts) // 2차 시도는 정답 열람 근거라 고정 id
  const data = {
    uid,
    studentId: student.id,
    itemId: item.id,
    wordId: item.word_id,
    stage: item.stage,
    type: item.type,
    mode: student.guest ? 'guest' : 'solo',
    tryNo,
    response,
    timeMs: timeMs ?? null,
    createdAt: serverTimestamp(),
  }

  let isCorrect: boolean | null
  if (!item.answer_ready) {
    await setDoc(ref, { ...data, isCorrect: null })
    isCorrect = null
  } else {
    try {
      await setDoc(ref, { ...data, isCorrect: true })
      isCorrect = true
    } catch (e) {
      if (!isPermissionError(e)) throw e
      await setDoc(ref, { ...data, isCorrect: false })
      isCorrect = false
    }
  }

  // 낱말별 진도
  const known = item.type === 'card' ? response === '알아요' : undefined
  await setDoc(
    doc(db, ...base, 'progress', `${student.id}__${item.word_id}`),
    {
      studentId: student.id,
      wordId: item.word_id,
      stage: item.stage,
      correct: increment(isCorrect === true ? 1 : 0),
      wrong: increment(isCorrect === false ? 1 : 0),
      last_seen: serverTimestamp(),
      ...(known === undefined ? {} : { known_flag: known }),
    },
    { merge: true },
  )
  return isCorrect
}

/** 두 번째 시도까지 기록한 뒤에만 열람 가능 (보안 규칙) */
export async function revealAnswer(itemId: string): Promise<number[] | null> {
  if (!db) return null
  const snap = await getDoc(doc(db, 'answers', itemId))
  return snap.exists() ? (snap.data().answer as number[]) : null
}

/** 한 문장 쓰기: 학급 학생은 선생님께 제출, 비회원은 내 기록에만 저장 */
export async function submitSentence(student: Student, item: Item, text: string) {
  if (!db || !auth?.currentUser) throw new Error('로그인이 필요합니다')
  await setDoc(doc(collection(db, ...studentBase(student), 'submissions')), {
    uid: auth.currentUser.uid,
    studentId: student.id,
    nickname: student.nickname,
    itemId: item.id,
    wordId: item.word_id,
    text,
    status: '제출',
    createdAt: serverTimestamp(),
  })
  await recordAttempt(student, item, { text })
}
