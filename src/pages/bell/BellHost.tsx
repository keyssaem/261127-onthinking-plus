import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { onAuthStateChanged, type User } from 'firebase/auth'
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import Shell, { Spinner } from '../../components/Shell'
import { PixelCat, Star, catForNumber } from '../../components/pixel'
import { joinUrl, useQr } from '../../components/JoinQr'
import { auth, db } from '../../lib/firebase'
import {
  OPTION_STYLE,
  useBellItem,
  useCountdown,
  useGame,
  type BellGame,
  type BellPlayer,
} from '../../lib/bell'

/** 골든벨 진행 화면 (교사 · 칠판/TV에 띄우기) */
export default function BellHost() {
  const { classId = '' } = useParams()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [cls, setCls] = useState<{ name: string; joinCode: string; liveGame: string | null } | null | undefined>(undefined)
  // 끝난 게임도 결과 화면을 계속 보여 주려고 마지막 게임 id 를 기억 (끝나면 학급의 liveGame 은 비워짐)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (cls?.liveGame) setShown(cls.liveGame)
  }, [cls?.liveGame])

  useEffect(() => auth ? onAuthStateChanged(auth, setUser) : undefined, [])
  useEffect(() => {
    if (!user || user.isAnonymous) return
    return onSnapshot(
      doc(db!, 'classes', classId),
      (s) => {
        const d = s.data()
        setCls(d && d.teacherUid === user.uid ? { name: d.name, joinCode: d.joinCode, liveGame: d.liveGame ?? null } : null)
      },
      () => setCls(null),
    )
  }, [user, classId])

  if (user === undefined) return <Spinner />
  if (!user || user.isAnonymous) return <Navigate to="/teacher" replace />
  if (cls === undefined) return <Spinner />
  if (!cls) return <Shell><p className="pixel-panel p-6 font-pixel">이 학급의 선생님만 골든벨을 열 수 있어요.</p></Shell>

  return (
    <Shell
      wide
      right={
        <Link to="/teacher" className="pixel-chip py-1 hover:bg-[#fff8d6]">
          ← 선생님 화면
        </Link>
      }
    >
      {shown ? (
        <Live classId={classId} cls={cls} gameId={shown} onNew={() => setShown(null)} />
      ) : (
        <Setup classId={classId} className={cls.name} />
      )}
    </Shell>
  )
}

/* ---------------- 1. 설정 ---------------- */
function Setup({ classId, className }: { classId: string; className: string }) {
  const [vol, setVol] = useState(1)
  const [count, setCount] = useState(15)
  const [limitSec, setLimitSec] = useState(20)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function open() {
    setBusy(true)
    setErr('')
    try {
      const snap = await getDocs(query(collection(db!, 'items'), where('stage', '==', '골든벨')))
      const pool = snap.docs.filter((d) => d.data().vol === vol).map((d) => d.id)
      if (!pool.length) throw new Error('골든벨 문항이 없어요. (npm run make:bell)')
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      const ref = doc(collection(db!, 'classes', classId, 'games'))
      const b = writeBatch(db!)
      b.set(ref, {
        vol,
        status: 'lobby',
        qIndex: -1,
        questions: pool.slice(0, count),
        limitSec,
        reveal: null,
        createdAt: serverTimestamp(),
      })
      b.update(doc(db!, 'classes', classId), { liveGame: ref.id })
      await b.commit()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const Pick = ({ value, cur, set, label }: { value: number; cur: number; set: (n: number) => void; label: string }) => (
    <button onClick={() => set(value)} className={`pixel-btn px-5 py-2 font-pixel ${cur === value ? 'primary' : ''}`}>
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="pixel-title text-center font-pixel text-5xl">🔔 골든벨</h1>
      <p className="pixel-title sm mt-3 text-center font-pixel">{className} · 뜻을 보고 알맞은 낱말 고르기</p>
      <section className="pixel-panel mt-8 space-y-6 p-6 font-pixel">
        <div>
          <p className="mb-2">어느 권?</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((v) => (
              <Pick key={v} value={v} cur={vol} set={setVol} label={`${v}권`} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2">문제 수</p>
          <div className="flex flex-wrap gap-2">
            {[10, 15, 20, 30].map((v) => (
              <Pick key={v} value={v} cur={count} set={setCount} label={`${v}문제`} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2">문제마다 시간</p>
          <div className="flex flex-wrap gap-2">
            {[10, 15, 20, 30].map((v) => (
              <Pick key={v} value={v} cur={limitSec} set={setLimitSec} label={`${v}초`} />
            ))}
          </div>
        </div>
        <ul className="rounded-xl border-2 border-ink bg-[#fff4c2] p-3 text-sm leading-relaxed">
          <li>· 틀리면 탈락하지만 <b>응원단</b>으로 계속 풀 수 있어요.</li>
          <li>· 남은 친구가 <b>모두 틀리면 아무도 탈락하지 않아요.</b></li>
          <li>· 진행 중 언제든 <b>🔁 패자부활</b>로 모두 살릴 수 있어요.</li>
        </ul>
        {err && <p className="text-sm text-bad">{err}</p>}
        <button onClick={open} disabled={busy} className="pixel-btn go w-full py-4 text-2xl">
          {busy ? '여는 중…' : '대기실 열기 ▶'}
        </button>
      </section>
    </div>
  )
}

/* ---------------- 2. 진행 ---------------- */
function Live({
  classId,
  cls,
  gameId,
  onNew,
}: {
  classId: string
  cls: { name: string; joinCode: string }
  gameId: string
  onNew: () => void
}) {
  const game = useGame(classId, gameId)
  const [players, setPlayers] = useState<BellPlayer[]>([])
  const [answers, setAnswers] = useState<Record<string, number>>({}) // 번호 → 고른 보기 (현재 문제)

  useEffect(
    () =>
      onSnapshot(collection(db!, 'classes', classId, 'games', gameId, 'players'), (s) =>
        setPlayers(
          s.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<BellPlayer, 'id'>) }))
            .sort((a, b) => a.number - b.number),
        ),
      ),
    [classId, gameId],
  )

  const qIndex = game?.qIndex ?? -1
  useEffect(() => {
    if (qIndex < 0) return setAnswers({})
    return onSnapshot(
      query(collection(db!, 'classes', classId, 'games', gameId, 'answers'), where('qIndex', '==', qIndex)),
      (s) => {
        const m: Record<string, number> = {}
        s.forEach((d) => (m[d.data().studentId] = d.data().response))
        setAnswers(m)
      },
    )
  }, [classId, gameId, qIndex])

  if (game === undefined) return <Spinner />
  if (game === null) return <p className="pixel-panel p-6 font-pixel">게임을 찾을 수 없어요. <button className="underline" onClick={onNew}>새로 열기</button></p>

  const props = { classId, game, players, answers }
  return (
    <>
      {game.status === 'lobby' && <Lobby {...props} cls={cls} />}
      {(game.status === 'question' || game.status === 'reveal') && <Question {...props} />}
      {game.status === 'ended' && <Result {...props} onNew={onNew} />}
    </>
  )
}

type HostProps = { classId: string; game: BellGame; players: BellPlayer[]; answers: Record<string, number> }
const gameRef = (classId: string, gameId: string) => doc(db!, 'classes', classId, 'games', gameId)

async function endGame(classId: string, gameId: string) {
  const b = writeBatch(db!)
  b.update(gameRef(classId, gameId), { status: 'ended', endedAt: serverTimestamp() })
  b.update(doc(db!, 'classes', classId), { liveGame: deleteField() })
  await b.commit()
}

function Lobby({ classId, game, players, cls }: HostProps & { cls: { name: string; joinCode: string } }) {
  const qr = useQr(joinUrl(cls.joinCode))
  const start = () =>
    updateDoc(gameRef(classId, game.id), { status: 'question', qIndex: 0, startedAt: serverTimestamp(), reveal: null })

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section className="pixel-panel flex flex-col items-center gap-3 p-6 text-center">
        <h1 className="pixel-title font-pixel text-4xl">🔔 골든벨</h1>
        <p className="font-pixel">{game.vol}권 · {game.questions.length}문제 · {game.limitSec}초</p>
        {qr && <img src={qr} alt="입장 QR" className="w-64 rounded-xl border-[3px] border-ink [image-rendering:pixelated]" />}
        <p className="font-pixel text-sm text-ink-soft">카메라로 찍거나 학급코드 입력</p>
        <p className="pixel-title font-pixel text-5xl tracking-widest">{cls.joinCode}</p>
        <p className="font-pixel text-xs text-ink-soft">이미 들어와 있는 학생은 낱말 목록의 🔔 버튼으로 참가해요</p>
      </section>
      <section className="pixel-panel flex flex-col p-6">
        <div className="flex items-center justify-between font-pixel">
          <h2 className="text-2xl">참가한 친구 {players.length}명</h2>
          <button onClick={() => endGame(classId, game.id)} className="pixel-btn px-3 py-1 text-xs">
            닫기
          </button>
        </div>
        <ul className="mt-4 grid flex-1 grid-cols-3 content-start gap-3 sm:grid-cols-5">
          {players.map((p) => (
            <li key={p.id} className="pop flex flex-col items-center gap-1 font-pixel text-sm">
              <PixelCat color={catForNumber(p.number)} size={3} className="bob" />
              <span className="max-w-full truncate">
                {p.number}. {p.nickname}
              </span>
            </li>
          ))}
          {!players.length && <li className="col-span-full py-10 text-center font-pixel text-ink-soft">친구들을 기다리는 중…</li>}
        </ul>
        <button onClick={start} disabled={!players.length} className="pixel-btn go mt-6 py-5 font-pixel text-3xl">
          START ▶
        </button>
      </section>
    </div>
  )
}

function Question({ classId, game, players, answers }: HostProps) {
  const itemId = game.questions[game.qIndex]
  const item = useBellItem(itemId)
  const [answer, setAnswer] = useState<number | null>(null)
  const revealing = useRef(false)
  const isQuestion = game.status === 'question'
  const left = useCountdown(game.startedAt, game.limitSec, isQuestion)

  useEffect(() => {
    setAnswer(null)
    revealing.current = false
    getDoc(doc(db!, 'answers', itemId)).then((s) => setAnswer((s.data()?.answer as number[] | undefined)?.[0] ?? null))
  }, [itemId])

  const alive = players.filter((p) => p.alive)
  const aliveAnswered = alive.filter((p) => answers[p.id] !== undefined).length
  const allIn = alive.length > 0 && aliveAnswered === alive.length

  async function reveal() {
    if (revealing.current || answer === null) return
    revealing.current = true
    const counts = [0, 0, 0, 0]
    for (const r of Object.values(answers)) if (r >= 0 && r <= 3) counts[r]++
    const right = (p: BellPlayer) => answers[p.id] === answer
    const survivors = alive.filter(right)
    const saved = alive.length > 0 && survivors.length === 0 // 모두 틀리면 아무도 탈락하지 않음
    const out = saved ? [] : alive.filter((p) => !right(p))
    const b = writeBatch(db!)
    for (const p of players) {
      const upd: { score?: number; alive?: boolean } = {}
      if (right(p)) upd.score = p.score + 1
      if (out.includes(p)) upd.alive = false
      if (Object.keys(upd).length) b.update(doc(db!, 'classes', classId, 'games', game.id, 'players', p.id), upd)
    }
    b.update(gameRef(classId, game.id), { status: 'reveal', reveal: { answer, counts, out: out.length, saved } })
    await b.commit()
  }

  // 시간이 끝나거나 남은 친구가 모두 답하면 자동 공개
  useEffect(() => {
    if (isQuestion && answer !== null && (left <= 0 || allIn)) reveal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuestion, left <= 0, allIn, answer])

  const last = game.qIndex >= game.questions.length - 1
  const next = () =>
    last
      ? endGame(classId, game.id)
      : updateDoc(gameRef(classId, game.id), { status: 'question', qIndex: game.qIndex + 1, startedAt: serverTimestamp(), reveal: null })
  const revive = async () => {
    const b = writeBatch(db!)
    for (const p of players.filter((x) => !x.alive)) b.update(doc(db!, 'classes', classId, 'games', game.id, 'players', p.id), { alive: true })
    await b.commit()
  }
  const rv = game.reveal
  const total = rv ? rv.counts.reduce((a, b) => a + b, 0) : 0

  return (
    <div>
      {/* 상단 정보 */}
      <div className="flex flex-wrap items-center gap-3 font-pixel">
        <span className="pixel-chip text-base">
          {game.vol}권 · 문제 {game.qIndex + 1}/{game.questions.length}
        </span>
        <span className="pixel-chip text-base">🙋 살아남은 친구 {alive.length}명</span>
        {isQuestion && (
          <span className="pixel-chip text-base">
            ✉️ 답 {aliveAnswered}/{alive.length}
          </span>
        )}
        <button onClick={() => confirm('골든벨을 끝낼까요?') && endGame(classId, game.id)} className="pixel-btn ml-auto px-3 py-1 text-xs">
          끝내기
        </button>
      </div>

      {/* 타이머 */}
      {isQuestion && (
        <div className="mt-4 h-6 overflow-hidden rounded-full border-[3px] border-ink bg-white">
          <div
            className={`h-full transition-[width] duration-200 ${left < 5 ? 'bg-heart' : 'bg-xp'}`}
            style={{ width: `${(left / game.limitSec) * 100}%` }}
          />
        </div>
      )}

      {/* 문제 */}
      <section className="pixel-panel mt-4 p-6 text-center sm:p-10">
        {!item ? (
          <p className="font-pixel">문제 불러오는 중…</p>
        ) : (
          <>
            <p className="font-pixel text-sm text-ink-soft">이 뜻을 가진 낱말은?</p>
            <p className="mt-3 text-3xl leading-snug font-bold sm:text-4xl">{item.prompt.definition}</p>
            {item.prompt.example && (
              <p className="mt-4 font-pixel text-xl text-ink-soft">예) {item.prompt.example}</p>
            )}
            {isQuestion && <p className="pixel-title mt-4 font-pixel text-5xl">{Math.ceil(left)}</p>}
          </>
        )}
      </section>

      {/* 보기 */}
      {item && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {item.options.map((o, i) => {
            const correct = rv && rv.answer === i
            const dim = rv && !correct
            return (
              <div
                key={i}
                className={`relative flex items-center gap-4 overflow-hidden rounded-2xl border-[3px] border-ink p-4 font-pixel text-3xl ${OPTION_STYLE[i].bg} ${dim ? 'opacity-35' : ''} ${correct ? 'pop ring-8 ring-star' : ''}`}
              >
                {rv && (
                  <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${total ? (rv.counts[i] / total) * 100 : 0}%` }} />
                )}
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-white text-2xl">
                  {OPTION_STYLE[i].label}
                </span>
                <span className="relative flex-1">{o}</span>
                {rv && <span className="relative text-xl">{rv.counts[i]}명</span>}
                {correct && <span className="relative">⭕</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* 공개 후 */}
      {rv && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="pixel-panel plain flex-1 p-4 font-pixel text-xl">
            {rv.saved ? '😮 모두 틀려서 이번엔 아무도 탈락하지 않아요!' : rv.out ? `이번에 ${rv.out}명 탈락 · 남은 친구 ${alive.length}명` : '🎉 모두 살아남았어요!'}
          </p>
          {players.some((p) => !p.alive) && (
            <button onClick={revive} className="pixel-btn sky px-5 py-4 font-pixel text-lg">
              🔁 패자부활
            </button>
          )}
          <button onClick={next} className="pixel-btn go px-8 py-4 font-pixel text-2xl">
            {last ? '결과 보기 ▶' : '다음 문제 ▶'}
          </button>
        </div>
      )}
      {isQuestion && (
        <div className="mt-6 text-right">
          <button onClick={reveal} disabled={answer === null} className="pixel-btn primary px-6 py-3 font-pixel">
            정답 공개 ▶
          </button>
        </div>
      )}

      <AliveStrip players={players} answers={isQuestion ? answers : null} />
    </div>
  )
}

/** 아래 줄: 친구들 고양이 (탈락은 흐리게, 답한 친구는 ✓) */
function AliveStrip({ players, answers }: { players: BellPlayer[]; answers: Record<string, number> | null }) {
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {players.map((p) => (
        <li
          key={p.id}
          className={`flex items-center gap-1 rounded-full border-2 border-ink bg-white px-2 py-0.5 font-pixel text-xs ${p.alive ? '' : 'opacity-40'}`}
          title={p.nickname}
        >
          <PixelCat color={catForNumber(p.number)} size={1} />
          {p.number}
          {answers && answers[p.id] !== undefined && <span className="text-ok">✓</span>}
        </li>
      ))}
    </ul>
  )
}

function Result({ game, players, onNew }: HostProps & { onNew: () => void }) {
  const winners = players.filter((p) => p.alive)
  const top = useMemo(() => [...players].sort((a, b) => b.score - a.score).slice(0, 3).filter((p) => p.score > 0), [players])
  return (
    <div className="text-center">
      <h1 className="pixel-title font-pixel text-5xl">🔔 골든벨!</h1>
      <p className="pixel-title sm mt-3 font-pixel">{game.vol}권 · {game.questions.length}문제 끝</p>

      <section className="pixel-panel mt-8 p-6">
        <h2 className="font-pixel text-2xl">끝까지 살아남은 친구 {winners.length}명</h2>
        <ul className="mt-6 flex flex-wrap justify-center gap-6">
          {winners.map((p) => (
            <li key={p.id} className="pop flex flex-col items-center gap-2 font-pixel">
              <Star size={4} />
              <PixelCat color={catForNumber(p.number)} size={5} className="bob" />
              <span className="text-lg">
                {p.number}. {p.nickname}
              </span>
            </li>
          ))}
          {!winners.length && <li className="font-pixel text-ink-soft">다음엔 꼭 골든벨을 울려 봐요!</li>}
        </ul>
      </section>

      {top.length > 0 && (
        <section className="pixel-panel plain mx-auto mt-6 max-w-md p-5 font-pixel">
          <h3 className="text-lg">⭐ 가장 많이 맞힌 친구</h3>
          <ol className="mt-3 space-y-1">
            {top.map((p, i) => (
              <li key={p.id}>
                {i + 1}. {p.nickname} — {p.score}문제
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="mt-8 flex justify-center gap-3">
        <Link to="/teacher" className="pixel-btn px-6 py-3 font-pixel">
          선생님 화면
        </Link>
        <button onClick={onNew} className="pixel-btn go px-6 py-3 font-pixel">
          한 판 더 ▶
        </button>
      </div>
    </div>
  )
}
