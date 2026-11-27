import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { Link } from 'react-router-dom'
import Shell, { Spinner } from '../components/Shell'
import { PixelCat } from '../components/pixel'
import JoinQr from '../components/JoinQr'
import { signOutAndReload } from '../lib/student'
import { deleteClass } from '../lib/classAdmin'
import Dashboard from './teacher/Dashboard'
import Submissions from './teacher/Submissions'
import {
  useProgress,
  useStudents,
  useSubmissions,
  useTodayAttempts,
  useWordNames,
  type StudentRow,
} from './teacher/classData'
import { auth, db } from '../lib/firebase'

/**
 * 교사 화면
 *  1) 구글 로그인  2) 교사 정보 등록  3) 학급 만들기  4) 학급별 실시간 현황 · 한 문장 검토 · 입장 명단
 */

type Teacher = { name: string; school: string | null }
type ClassRow = { id: string; name: string; joinCode: string }

const inputCls = 'pixel-input'
const btnCls = 'pixel-btn primary px-5 py-3 font-pixel'

export default function Teacher() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (u) => {
      // 학생(익명) 로그인이 남아 있으면 새 페이지에서 다시 시작 (사용자 교체는 항상 새로고침)
      if (u?.isAnonymous) return void signOutAndReload('/teacher')
      setUser(u)
    })
  }, [])

  if (!auth || !db) return <Shell><p>Firebase 설정이 필요합니다.</p></Shell>
  if (user === undefined) return <Spinner />
  return (
    <Shell
      wide
      right={
        user && (
          <button className="pixel-chip py-1 hover:bg-[#fff8d6]" onClick={() => signOutAndReload('/')}>
            {user.email} · 로그아웃
          </button>
        )
      }
    >
      {user ? <TeacherHome user={user} /> : <Login />}
    </Shell>
  )
}

/** 교사는 구글 로그인만 사용 */
export function Login() {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function google() {
    if (!auth) return
    setBusy(true)
    setMsg('')
    try {
      if (auth.currentUser?.isAnonymous) await signOut(auth) // 학생 세션 정리
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (e) {
      const code = (e as { code?: string }).code ?? String(e)
      setMsg(
        code.includes('operation-not-allowed')
          ? 'Firebase에서 Google 로그인이 아직 켜져 있지 않아요. (docs/FIREBASE_설정.md 참고)'
          : code.includes('popup-closed') ? '로그인 창이 닫혔어요. 다시 눌러 주세요.' : code,
      )
    }
    setBusy(false)
  }

  return (
    <div className="pixel-panel mx-auto max-w-sm space-y-4 p-6 text-center">
      <div className="flex justify-center"><PixelCat color="cream" size={5} className="bob" /></div>
      <h1 className="font-pixel text-2xl">선생님 로그인</h1>
      <p className="font-pixel text-sm text-ink-soft">학교·개인 구글 계정으로 로그인해요.</p>
      <button
        onClick={google}
        disabled={busy}
        className="pixel-btn w-full gap-3 py-3 font-pixel text-lg"
      >
        <span className="text-xl font-bold text-sky-600">G</span>
        {busy ? '로그인 중…' : 'Google로 로그인'}
      </button>
      {msg && <p className="rounded-xl border-2 border-ink bg-[#fff4c2] p-3 text-sm">{msg}</p>}
    </div>
  )
}

function TeacherHome({ user }: { user: User }) {
  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [selected, setSelected] = useState<ClassRow | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const load = useCallback(async () => {
    const t = await getDoc(doc(db!, 'teachers', user.uid))
    getDoc(doc(db!, 'admins', user.uid)).then((a) => setIsAdmin(a.exists())).catch(() => {})
    setTeacher(t.exists() ? (t.data() as Teacher) : null)
    if (t.exists()) {
      // 복합 색인이 필요 없도록 정렬은 화면에서
      const c = await getDocs(query(collection(db!, 'classes'), where('teacherUid', '==', user.uid)))
      setClasses(
        c.docs
          .sort((a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0))
          .map((d) => ({ id: d.id, name: d.data().name, joinCode: d.data().joinCode })),
      )
    }
  }, [user.uid])

  useEffect(() => {
    load()
  }, [load])

  if (teacher === undefined) return <Spinner />
  if (!teacher) return <TeacherProfile user={user} onSaved={load} />

  return (
    <div className="space-y-6">
      <section className="pixel-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-pixel text-xl">
            {teacher.name} 선생님{teacher.school ? ` · ${teacher.school}` : ''}
          </h2>
          {isAdmin && (
            <Link to="/review" className="pixel-btn sky px-4 py-2 font-pixel text-sm">
              🔑 정답 검수
            </Link>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`pixel-btn px-4 py-2 font-pixel ${selected?.id === c.id ? 'primary' : ''}`}
            >
              {c.name}
              <span className="ml-1.5 text-xs opacity-60">{c.joinCode}</span>
            </button>
          ))}
          <NewClass
            uid={user.uid}
            onCreated={(c) => {
              setClasses((cs) => [...cs, c])
              setSelected(c)
            }}
          />
        </div>
      </section>
      {selected && (
        <ClassPanel
          key={selected.id}
          cls={selected}
          onRenamed={(name) => {
            setClasses((cs) => cs.map((c) => (c.id === selected.id ? { ...c, name } : c)))
            setSelected({ ...selected, name })
          }}
          onDeleted={() => {
            setClasses((cs) => cs.filter((c) => c.id !== selected.id))
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}

function TeacherProfile({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [name, setName] = useState(user.displayName ?? '')
  const [school, setSchool] = useState('')
  const [err, setErr] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      await setDoc(doc(db!, 'teachers', user.uid), {
        name: name.trim(),
        school: school.trim() || null,
        email: user.email,
        createdAt: serverTimestamp(),
      })
      onSaved()
    } catch (e2) {
      setErr(String(e2))
    }
  }
  return (
    <form onSubmit={save} className="pixel-panel mx-auto max-w-sm space-y-4 p-6">
      <h2 className="font-pixel text-xl">선생님 정보</h2>
      <input className={inputCls} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className={inputCls} placeholder="학교 (선택)" value={school} onChange={(e) => setSchool(e.target.value)} />
      {err && <p className="font-pixel text-sm text-bad">{err}</p>}
      <button className={`${btnCls} w-full`}>저장</button>
    </form>
  )
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 헷갈리는 0/O, 1/I 제외
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

function NewClass({ uid, onCreated }: { uid: string; onCreated: (c: ClassRow) => void }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setErr('')
    for (let tries = 0; tries < 5; tries++) {
      const joinCode = makeCode()
      if ((await getDoc(doc(db!, 'joinCodes', joinCode))).exists()) continue
      const classRef = doc(collection(db!, 'classes'))
      const batch = writeBatch(db!)
      batch.set(classRef, { teacherUid: uid, name: name.trim(), level: 2, joinCode, createdAt: serverTimestamp() })
      batch.set(doc(db!, 'joinCodes', joinCode), { classId: classRef.id })
      try {
        await batch.commit()
        onCreated({ id: classRef.id, name: name.trim(), joinCode })
        setName('')
      } catch (e2) {
        setErr(String(e2))
      }
      return
    }
    setErr('학급코드 생성에 실패했어요. 다시 시도해 주세요.')
  }
  return (
    <form onSubmit={create} className="flex flex-wrap items-center gap-2">
      <input
        className="pixel-input w-28 rounded-full py-2 font-pixel"
        placeholder="예: 6-6"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="pixel-btn go px-4 py-2 font-pixel">+ 학급</button>
      {err && <span className="font-pixel text-sm text-bad">{err}</span>}
    </form>
  )
}

type Tab = 'live' | 'sentences' | 'roster'

/** 학급 패널: 학급코드 + [실시간 현황 · 한 문장 검토 · 입장·명단] */
function ClassPanel({
  cls,
  onRenamed,
  onDeleted,
}: {
  cls: ClassRow
  onRenamed: (name: string) => void
  onDeleted: () => void
}) {
  const [tab, setTab] = useState<Tab>('live')
  const students = useStudents(cls.id)
  const progress = useProgress(cls.id)
  const today = useTodayAttempts(cls.id)
  const submissions = useSubmissions(cls.id)
  const words = useWordNames()
  const fresh = submissions?.filter((s) => s.status === '제출').length ?? 0

  const tabs: [Tab, string][] = [
    ['live', '📊 실시간 현황'],
    ['sentences', `✉️ 한 문장 검토${fresh ? ` (${fresh})` : ''}`],
    ['roster', `🎒 입장·명단 (${students.length})`],
  ]

  return (
    <section className="pixel-panel p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-pixel text-2xl">{cls.name}</h3>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-pixel text-sm text-ink-soft">학급코드</div>
            <div className="pixel-title font-pixel text-5xl tracking-widest">{cls.joinCode}</div>
            <div className="mt-1 font-pixel text-xs text-ink-soft">QR을 누르면 크게 보여요</div>
          </div>
          <JoinQr joinCode={cls.joinCode} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-b-[3px] border-ink pb-4">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`pixel-btn px-4 py-2 font-pixel ${tab === k ? 'primary' : ''}`}>
            {label}
          </button>
        ))}
        <Link to={`/bell/host/${cls.id}`} className="pixel-btn go ml-auto px-5 py-2 font-pixel">
          🎮 단체 게임
        </Link>
      </div>

      <div className="mt-5">
        {tab === 'live' && (
          <Dashboard classId={cls.id} className={cls.name} students={students} progress={progress} today={today} words={words} />
        )}
        {tab === 'sentences' && <Submissions classId={cls.id} rows={submissions} words={words} cats={Object.fromEntries(students.map((s) => [s.id, s.cat]))} />}
        {tab === 'roster' && (
          <>
            <Roster cls={cls} students={students} />
            <ClassAdmin cls={cls} studentCount={students.length} onRenamed={onRenamed} onDeleted={onDeleted} />
          </>
        )}
      </div>
    </section>
  )
}

/** 입장 안내 + 스스로 들어온 학생 명단 */
function Roster({ cls, students }: { cls: ClassRow; students: StudentRow[] }) {
  async function remove(s: StudentRow) {
    if (!confirm(`${s.number}번 ${s.nickname} 학생을 명단에서 지울까요? (학습 기록은 남아요)`)) return
    await deleteDoc(doc(db!, 'classes', cls.id, 'students', s.id))
  }

  return (
    <div>
      <div className="rounded-2xl border-[3px] border-ink bg-[#fff4c2] p-4 font-pixel text-sm leading-relaxed">
        <b>학생 입장 방법</b> — 학생 등록은 필요 없어요!
        <br />📷 위의 <b>QR을 카메라로 찍으면</b> 코드가 채워진 채 바로 열려요. 또는
        <br />① 첫 화면 → <b>학급코드로 입장</b> ② 코드 <b>{cls.joinCode}</b> 입력 ③ 자기 번호와 닉네임 입력
        <br />
        <span className="text-ink-soft">같은 번호로 다시 들어오면 같은 학생으로 이어서 기록돼요.</span>
      </div>

      <div className="mt-6">
        <h4 className="mb-3 font-pixel">들어온 학생 {students.length}명</h4>
        {students.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {students.map((s) => (
              <li key={s.id} className="pixel-panel plain flex items-center gap-2 p-2">
                <PixelCat color={s.cat} size={2} />
                <span className="min-w-0 flex-1 truncate font-pixel text-sm">
                  {s.number}. {s.nickname}
                </span>
                <button onClick={() => remove(s)} className="font-pixel text-xs text-ink-soft hover:text-bad" title="명단에서 지우기">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-pixel text-sm text-ink-soft">아직 아무도 들어오지 않았어요. 학급코드를 칠판에 써 주세요!</p>
        )}
      </div>
    </div>
  )
}

/** 학급 관리: 이름 바꾸기 · 학급 삭제 (이름을 똑같이 입력해야 삭제) */
function ClassAdmin({
  cls,
  studentCount,
  onRenamed,
  onDeleted,
}: {
  cls: ClassRow
  studentCount: number
  onRenamed: (name: string) => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(cls.name)
  const [confirmText, setConfirmText] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')

  async function rename(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n || n === cls.name) return
    await updateDoc(doc(db!, 'classes', cls.id), { name: n })
    onRenamed(n)
  }

  async function remove() {
    setBusy(true)
    setErr('')
    try {
      await deleteClass(cls.id, cls.joinCode, setProgress)
      onDeleted()
    } catch (e) {
      setErr(`삭제 중 문제가 생겼어요. 다시 눌러 주세요. (${String(e)})`)
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 border-t-[3px] border-dashed border-ink/30 pt-6 font-pixel">
      <h4 className="mb-3">⚙️ 학급 관리</h4>
      <form onSubmit={rename} className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} className="pixel-input w-40 py-2" />
        <button disabled={!name.trim() || name.trim() === cls.name} className="pixel-btn px-4 py-2 text-sm">
          이름 바꾸기
        </button>
      </form>

      {!open ? (
        <button onClick={() => setOpen(true)} className="pixel-btn mt-4 px-4 py-2 text-sm text-bad">
          🗑 이 학급 삭제…
        </button>
      ) : (
        <div className="mt-4 rounded-2xl border-[3px] border-bad bg-bad-bg p-4 text-sm leading-relaxed">
          <p className="text-base text-bad">⚠ ‘{cls.name}’ ({cls.joinCode}) 학급을 완전히 지울까요?</p>
          <p className="mt-2">
            학생 {studentCount}명의 명단, 풀이 기록, 진도, 한 문장, 게임 기록, 학급 나무가 모두 사라지고{' '}
            <b>되돌릴 수 없어요.</b> 학급코드 {cls.joinCode} 로도 더 이상 들어올 수 없어요.
          </p>
          <label className="mt-3 block">
            확인을 위해 학급 이름 <b>{cls.name}</b> 을(를) 그대로 입력하세요
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="pixel-input mt-1 py-2"
              autoComplete="off"
            />
          </label>
          {err && <p className="mt-2 text-bad">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={remove}
              disabled={busy || confirmText.trim() !== cls.name}
              className="pixel-btn px-4 py-2 text-bad disabled:opacity-40"
            >
              {busy ? `지우는 중… (${progress})` : '완전히 삭제'}
            </button>
            <button onClick={() => (setOpen(false), setConfirmText(''))} disabled={busy} className="pixel-btn px-4 py-2">
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
