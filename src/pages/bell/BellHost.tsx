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
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import Shell, { Spinner } from '../../components/Shell'
import { PixelCat, Star, catForNumber } from '../../components/pixel'
import { joinUrl, useQr } from '../../components/JoinQr'
import Rope from '../../components/Rope'
import { auth, db } from '../../lib/firebase'
import { growTree } from '../../lib/tree'
import type { WordIndexEntry } from '../../lib/types'
import {
  MODES,
  OPTION_STYLE,
  TEAM,
  chosung,
  correctFor,
  normalizeWord,
  useCountdown,
  useGame,
  useQuestion,
  type BellGame,
  type BellPlayer,
  type GameMode,
} from '../../lib/bell'

/** 단체 게임 진행 화면 (교사 · 칠판/TV에 띄우기) */
export default function BellHost() {
  const { classId = '' } = useParams()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [cls, setCls] = useState<{ name: string; joinCode: string; liveGame: string | null } | null | undefined>(undefined)
  // 끝난 게임도 결과 화면을 계속 보여 주려고 마지막 게임 id 를 기억 (끝나면 학급의 liveGame 은 비워짐)
  const [shown, setShown] = useState<string | null>(null)

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), [])
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
  useEffect(() => {
    if (cls?.liveGame) setShown(cls.liveGame)
  }, [cls?.liveGame])

  if (user === undefined) return <Spinner />
  if (!user || user.isAnonymous) return <Navigate to="/teacher" replace />
  if (cls === undefined) return <Spinner />
  if (!cls) return <Shell><p className="pixel-panel p-6 font-pixel">이 학급의 선생님만 게임을 열 수 있어요.</p></Shell>

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

const shuffle = <T,>(a: T[]) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/** 문제 고르기: 골든벨 문항(뜻→낱말) 또는 장면 문장 빈칸(검수 완료 먼저) */
async function pickQuestions(mode: GameMode, vol: number, count: number) {
  if (mode !== 'sentence') {
    const snap = await getDocs(query(collection(db!, 'items'), where('stage', '==', '골든벨')))
    return shuffle(snap.docs.filter((d) => d.data().vol === vol).map((d) => d.id)).slice(0, count)
  }
  const [idx, snap] = await Promise.all([
    getDoc(doc(db!, 'meta', 'wordIndexL2')),
    getDocs(query(collection(db!, 'items'), where('stage', '==', '적용1'))),
  ])
  const volOf = new Map(((idx.data()?.words ?? []) as WordIndexEntry[]).map((w) => [w.id, w.book_vol]))
  const ready = snap.docs.filter((d) => d.data().answer_ready && volOf.get(d.data().word_id) === vol)
  const verified = shuffle(ready.filter((d) => d.data().verified))
  const rest = shuffle(ready.filter((d) => !d.data().verified))
  return [...verified, ...rest].slice(0, count).map((d) => {
    const n = (d.data().options as string[]).length
    return `${d.id}#${Math.floor(Math.random() * n)}`
  })
}

/* ---------------- 1. 설정 ---------------- */
function Setup({ classId, className }: { classId: string; className: string }) {
  const [mode, setMode] = useState<GameMode>('bell')
  const [vol, setVol] = useState(1)
  const [count, setCount] = useState(15)
  const [limitSec, setLimitSec] = useState(20)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function open() {
    setBusy(true)
    setErr('')
    try {
      const questions = await pickQuestions(mode, vol, count)
      if (!questions.length) throw new Error('문항이 없어요. (골든벨 문항: npm run make:bell)')
      const ref = doc(collection(db!, 'classes', classId, 'games'))
      const b = writeBatch(db!)
      b.set(ref, {
        mode,
        vol,
        status: 'lobby',
        qIndex: -1,
        questions,
        limitSec,
        reveal: null,
        hint: '',
        rope: 0,
        teamScore: [0, 0],
        winner: null,
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
  const m = MODES[mode]

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="pixel-title text-center font-pixel text-5xl">🎮 단체 게임</h1>
      <p className="pixel-title sm mt-3 text-center font-pixel">{className}</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {(Object.keys(MODES) as GameMode[]).map((k) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`pixel-panel plain p-4 text-left ${mode === k ? 'ring-8 ring-star' : 'opacity-80 hover:opacity-100'}`}
          >
            <p className="font-pixel text-2xl">
              {MODES[k].emoji} {MODES[k].name}
            </p>
            <p className="mt-1 font-pixel text-sm text-ink-soft">{MODES[k].desc}</p>
          </button>
        ))}
      </div>

      <section className="pixel-panel mt-6 space-y-6 p-6 font-pixel">
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
          {m.rules.map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
        {err && <p className="text-sm text-bad">{err}</p>}
        <button onClick={open} disabled={busy} className="pixel-btn go w-full py-4 text-2xl">
          {busy ? '여는 중…' : `${m.emoji} ${m.name} 대기실 열기 ▶`}
        </button>
      </section>
    </div>
  )
}

/* ---------------- 2. 진행 ---------------- */
type Ans = { response: number | string; at: number }
type HostProps = { classId: string; game: BellGame; players: BellPlayer[]; answers: Record<string, Ans> }
const gameRef = (classId: string, gameId: string) => doc(db!, 'classes', classId, 'games', gameId)
const playerRef = (classId: string, gameId: string, id: string) => doc(db!, 'classes', classId, 'games', gameId, 'players', id)
const eliminates = (m: GameMode) => m === 'bell' || m === 'sentence'

async function endGame(classId: string, game: BellGame) {
  const b = writeBatch(db!)
  b.update(gameRef(classId, game.id), {
    status: 'ended',
    endedAt: serverTimestamp(),
    ...(game.mode === 'tug' ? { winner: game.rope > 0 ? 1 : game.rope < 0 ? 0 : null } : {}),
  })
  b.update(doc(db!, 'classes', classId), { liveGame: deleteField() })
  await b.commit()
}

/** 문제 열기 (초성 스피드는 초성 힌트를 함께 씀) */
async function openQuestion(classId: string, game: BellGame, i: number) {
  let hint = ''
  if (game.mode === 'chosung') hint = chosung((await correctFor(game.questions[i]))?.text ?? '')
  await updateDoc(gameRef(classId, game.id), { status: 'question', qIndex: i, startedAt: serverTimestamp(), reveal: null, hint })
}

/** 줄다리기 팀 나누기: 그동안 정답률 높은 순으로 ㄹ자(0,1,1,0,…) 배정 */
async function assignTeams(classId: string, game: BellGame, players: BellPlayer[]) {
  const prog = await getDocs(collection(db!, 'classes', classId, 'progress'))
  const acc = new Map<string, [number, number]>()
  prog.forEach((d) => {
    const p = d.data()
    const a = acc.get(p.studentId) ?? [0, 0]
    acc.set(p.studentId, [a[0] + (p.correct ?? 0), a[1] + (p.correct ?? 0) + (p.wrong ?? 0)])
  })
  const rate = (id: string) => {
    const a = acc.get(id)
    return a && a[1] ? a[0] / a[1] : 0.5
  }
  const order = shuffle(players).sort((a, b) => rate(b.id) - rate(a.id))
  const b = writeBatch(db!)
  order.forEach((p, i) => b.update(playerRef(classId, game.id, p.id), { team: [0, 1, 1, 0][i % 4] }))
  await b.commit()
}

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
  // 문제 번호와 함께 저장: 다음 문제로 넘어간 직후 이전 문제 답이 섞여 자동 공개되는 것 방지
  const [answersOf, setAnswersOf] = useState<{ q: number; map: Record<string, Ans> }>({ q: -1, map: {} })

  useEffect(
    () =>
      onSnapshot(collection(db!, 'classes', classId, 'games', gameId, 'players'), (s) =>
        setPlayers(
          s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BellPlayer, 'id'>) })).sort((a, b) => a.number - b.number),
        ),
      ),
    [classId, gameId],
  )

  const qIndex = game?.qIndex ?? -1
  useEffect(() => {
    if (qIndex < 0) return setAnswersOf({ q: -1, map: {} })
    return onSnapshot(
      query(collection(db!, 'classes', classId, 'games', gameId, 'answers'), where('qIndex', '==', qIndex)),
      (s) => {
        const m: Record<string, Ans> = {}
        s.forEach((d) => {
          const a = d.data({ serverTimestamps: 'estimate' })
          m[a.studentId] = { response: a.response, at: a.at instanceof Timestamp ? a.at.toMillis() : Date.now() }
        })
        setAnswersOf({ q: qIndex, map: m })
      },
    )
  }, [classId, gameId, qIndex])

  // 줄다리기: 중간에 들어온 친구는 인원이 적은 팀으로
  useEffect(() => {
    if (!game || game.mode !== 'tug' || game.status === 'lobby' || game.status === 'ended') return
    const free = players.filter((p) => p.team === undefined)
    if (!free.length) return
    const size = [0, 1].map((t) => players.filter((p) => p.team === t).length)
    const b = writeBatch(db!)
    free.forEach((p) => {
      const t = size[0] <= size[1] ? 0 : 1
      size[t]++
      b.update(playerRef(classId, game.id, p.id), { team: t })
    })
    b.commit().catch(() => {})
  }, [game, players, classId])

  const answers = answersOf.q === qIndex ? answersOf.map : {}

  if (game === undefined) return <Spinner />
  if (game === null)
    return (
      <p className="pixel-panel p-6 font-pixel">
        게임을 찾을 수 없어요.{' '}
        <button className="underline" onClick={onNew}>
          새로 열기
        </button>
      </p>
    )

  const props = { classId, game, players, answers }
  return (
    <>
      {game.status === 'lobby' && <Lobby {...props} cls={cls} />}
      {(game.status === 'question' || game.status === 'reveal') && <Question {...props} />}
      {game.status === 'ended' && <Result {...props} onNew={onNew} />}
    </>
  )
}

function Lobby({ classId, game, players, cls }: HostProps & { cls: { name: string; joinCode: string } }) {
  const qr = useQr(joinUrl(cls.joinCode))
  const [busy, setBusy] = useState(false)
  const m = MODES[game.mode]
  async function start() {
    setBusy(true)
    if (game.mode === 'tug') await assignTeams(classId, game, players)
    await openQuestion(classId, game, 0)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section className="pixel-panel flex flex-col items-center gap-3 p-6 text-center">
        <h1 className="pixel-title font-pixel text-4xl">
          {m.emoji} {m.name}
        </h1>
        <p className="font-pixel">
          {game.vol}권 · {game.questions.length}문제 · {game.limitSec}초
        </p>
        {qr && <img src={qr} alt="입장 QR" className="w-64 rounded-xl border-[3px] border-ink [image-rendering:pixelated]" />}
        <p className="font-pixel text-sm text-ink-soft">카메라로 찍거나 학급코드 입력</p>
        <p className="pixel-title font-pixel text-5xl tracking-widest">{cls.joinCode}</p>
        <p className="font-pixel text-xs text-ink-soft">이미 들어와 있는 학생은 낱말 목록의 참가 버튼을 눌러요</p>
      </section>
      <section className="pixel-panel flex flex-col p-6">
        <div className="flex items-center justify-between font-pixel">
          <h2 className="text-2xl">참가한 친구 {players.length}명</h2>
          <button onClick={() => endGame(classId, game)} className="pixel-btn px-3 py-1 text-xs">
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
        {game.mode === 'tug' && <p className="mt-2 font-pixel text-sm text-ink-soft">START 를 누르면 정답률에 맞춰 두 팀을 고르게 나눠요.</p>}
        <button onClick={start} disabled={!players.length || busy} className="pixel-btn go mt-4 py-5 font-pixel text-3xl">
          START ▶
        </button>
      </section>
    </div>
  )
}

function Question({ classId, game, players, answers }: HostProps) {
  const key = game.questions[game.qIndex]
  const q = useQuestion(key)
  const [correct, setCorrect] = useState<{ index: number; text: string } | null>(null)
  const revealing = useRef(false)
  const isQuestion = game.status === 'question'
  const left = useCountdown(game.startedAt, game.limitSec, isQuestion)
  const elim = eliminates(game.mode)

  useEffect(() => {
    setCorrect(null)
    revealing.current = false
    correctFor(key).then(setCorrect)
  }, [key])

  const inPlay = elim ? players.filter((p) => p.alive) : players
  const answered = inPlay.filter((p) => answers[p.id] !== undefined).length
  const allIn = inPlay.length > 0 && answered === inPlay.length

  async function reveal() {
    if (revealing.current || !correct) return
    revealing.current = true
    const isRight = (p: BellPlayer) => {
      const a = answers[p.id]
      if (!a) return false
      return game.mode === 'chosung'
        ? normalizeWord(String(a.response)) === normalizeWord(correct.text)
        : a.response === correct.index
    }
    const counts = [0, 0, 0, 0]
    for (const a of Object.values(answers)) if (typeof a.response === 'number' && a.response >= 0 && a.response <= 3) counts[a.response]++
    const right = players.filter(isRight)
    const b = writeBatch(db!)
    const upd = (p: BellPlayer, v: { score?: number; alive?: boolean }) => b.update(playerRef(classId, game.id, p.id), v)
    const reveal: Record<string, unknown> = { answer: game.mode === 'chosung' ? null : correct.index, answerText: correct.text, counts, out: 0, saved: false }
    const gameUpd: { [k: string]: unknown } = { status: 'reveal' }

    if (elim) {
      const alive = players.filter((p) => p.alive)
      const survivors = alive.filter(isRight)
      const saved = alive.length > 0 && survivors.length === 0 // 모두 틀리면 아무도 탈락하지 않음
      const out = saved ? [] : alive.filter((p) => !isRight(p))
      for (const p of players) {
        if (isRight(p)) upd(p, { score: p.score + 1 })
        else if (out.includes(p)) upd(p, { alive: false })
      }
      Object.assign(reveal, { out: out.length, saved })
    } else if (game.mode === 'tug') {
      const tr: [number, number] = [0, 0]
      const size: [number, number] = [0, 0]
      for (const p of players) {
        if (p.team === undefined) continue
        size[p.team]++
        if (isRight(p)) {
          tr[p.team]++
          upd(p, { score: p.score + 1 })
        }
      }
      const frac = (t: 0 | 1) => (size[t] ? tr[t] / size[t] : 0)
      const rope = Math.max(-100, Math.min(100, game.rope + Math.round((frac(1) - frac(0)) * 25)))
      Object.assign(reveal, { teamRight: tr })
      Object.assign(gameUpd, { rope, teamScore: [game.teamScore[0] + tr[0], game.teamScore[1] + tr[1]] })
    } else {
      // 초성 스피드: 맞히면 50점 + 빠를수록 최대 50점
      let fastest: BellPlayer | null = null
      for (const p of right) {
        const t = answers[p.id].at - game.startedAt
        const bonus = Math.round(50 * Math.max(0, 1 - t / (game.limitSec * 1000)))
        upd(p, { score: p.score + 50 + bonus })
        if (!fastest || answers[p.id].at < answers[fastest.id].at) fastest = p
      }
      Object.assign(reveal, { fastest: fastest ? `${fastest.number}. ${fastest.nickname}` : null })
    }
    gameUpd.reveal = reveal
    b.update(gameRef(classId, game.id), gameUpd as Record<string, never>)
    await b.commit()
    if (right.length) growTree(classId, 'games', right.length) // 학급 나무도 함께 자람
  }

  // 시간이 끝나거나 모두 답하면 자동 공개
  useEffect(() => {
    if (isQuestion && correct && (left <= 0 || allIn)) reveal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuestion, left <= 0, allIn, correct])

  const tugDone = game.mode === 'tug' && Math.abs(game.rope) >= 100
  const last = game.qIndex >= game.questions.length - 1 || tugDone
  const next = () => (last ? endGame(classId, game) : openQuestion(classId, game, game.qIndex + 1))
  const revive = async () => {
    const b = writeBatch(db!)
    for (const p of players.filter((x) => !x.alive)) b.update(playerRef(classId, game.id, p.id), { alive: true })
    await b.commit()
  }
  const rv = game.reveal
  const total = rv ? rv.counts.reduce((a, b) => a + b, 0) : 0
  const m = MODES[game.mode]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 font-pixel">
        <span className="pixel-chip text-base">
          {m.emoji} {m.name} · {game.vol}권 · 문제 {game.qIndex + 1}/{game.questions.length}
        </span>
        {elim && <span className="pixel-chip text-base">🙋 살아남은 친구 {inPlay.length}명</span>}
        {isQuestion && (
          <span className="pixel-chip text-base">
            ✉️ 답 {answered}/{inPlay.length}
          </span>
        )}
        <button onClick={() => confirm('게임을 끝낼까요?') && endGame(classId, game)} className="pixel-btn ml-auto px-3 py-1 text-xs">
          끝내기
        </button>
      </div>

      {game.mode === 'tug' && (
        <div className="pixel-panel plain mt-4 p-4">
          <Rope rope={game.rope} teamScore={game.teamScore} big />
        </div>
      )}

      {isQuestion && (
        <div className="mt-4 h-6 overflow-hidden rounded-full border-[3px] border-ink bg-white">
          <div className={`h-full transition-[width] duration-200 ${left < 5 ? 'bg-heart' : 'bg-xp'}`} style={{ width: `${(left / game.limitSec) * 100}%` }} />
        </div>
      )}

      <section className="pixel-panel mt-4 p-6 text-center sm:p-10">
        {!q ? (
          <p className="font-pixel">문제 불러오는 중…</p>
        ) : q.sentence ? (
          <>
            <p className="font-pixel text-sm text-ink-soft">★ 자리에 알맞은 낱말은?</p>
            <p className="mt-3 text-3xl leading-snug font-bold sm:text-4xl">{q.sentence}</p>
          </>
        ) : (
          <>
            <p className="font-pixel text-sm text-ink-soft">{game.mode === 'chosung' ? '초성과 뜻을 보고 낱말을 써요' : '이 뜻을 가진 낱말은?'}</p>
            {game.mode === 'chosung' && <p className="pixel-title mt-3 font-pixel text-7xl tracking-[0.3em]">{game.hint}</p>}
            <p className="mt-3 text-3xl leading-snug font-bold sm:text-4xl">{q.definition}</p>
            {q.example && <p className="mt-4 font-pixel text-xl text-ink-soft">예) {q.example}</p>}
          </>
        )}
        {isQuestion && <p className="pixel-title mt-4 font-pixel text-5xl">{Math.ceil(left)}</p>}
        {rv && game.mode === 'chosung' && (
          <p className="pop mt-6 font-pixel text-5xl">
            정답: <span className="text-ok">{rv.answerText}</span>
          </p>
        )}
      </section>

      {q && game.mode !== 'chosung' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {q.options.map((o, i) => {
            const isAns = rv && rv.answer === i
            return (
              <div
                key={i}
                className={`relative flex items-center gap-4 overflow-hidden rounded-2xl border-[3px] border-ink p-4 font-pixel text-3xl ${OPTION_STYLE[i].bg} ${rv && !isAns ? 'opacity-35' : ''} ${isAns ? 'pop ring-8 ring-star' : ''}`}
              >
                {rv && <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${total ? (rv.counts[i] / total) * 100 : 0}%` }} />}
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-white text-2xl">
                  {OPTION_STYLE[i].label}
                </span>
                <span className="relative flex-1">{o}</span>
                {rv && <span className="relative text-xl">{rv.counts[i]}명</span>}
                {isAns && <span className="relative">⭕</span>}
              </div>
            )
          })}
        </div>
      )}

      {rv && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="pixel-panel plain flex-1 p-4 font-pixel text-xl">
            {elim
              ? rv.saved
                ? '😮 모두 틀려서 이번엔 아무도 탈락하지 않아요!'
                : rv.out
                  ? `이번에 ${rv.out}명 탈락 · 남은 친구 ${inPlay.length}명`
                  : '🎉 모두 살아남았어요!'
              : game.mode === 'tug'
                ? `${TEAM[0].name} ${rv.teamRight?.[0] ?? 0}명 · ${TEAM[1].name} ${rv.teamRight?.[1] ?? 0}명 정답!${tugDone ? ' 줄이 끝까지 왔어요!' : ''}`
                : rv.fastest
                  ? `⚡ 가장 빨리 맞힌 친구: ${rv.fastest}`
                  : '이번엔 맞힌 친구가 없어요. 다음 문제 도전!'}
          </p>
          {elim && players.some((p) => !p.alive) && (
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
          <button onClick={reveal} disabled={!correct} className="pixel-btn primary px-6 py-3 font-pixel">
            정답 공개 ▶
          </button>
        </div>
      )}

      <PlayerStrip game={game} players={players} answers={isQuestion ? answers : null} />
    </div>
  )
}

/** 아래 줄: 친구들 (탈락은 흐리게, 답한 친구는 ✓, 줄다리기는 팀 색) */
function PlayerStrip({ game, players, answers }: { game: BellGame; players: BellPlayer[]; answers: Record<string, Ans> | null }) {
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {players.map((p) => (
        <li
          key={p.id}
          className={`flex items-center gap-1 rounded-full border-2 border-ink px-2 py-0.5 font-pixel text-xs ${game.mode === 'tug' && p.team !== undefined ? TEAM[p.team].bg : 'bg-white'} ${eliminates(game.mode) && !p.alive ? 'opacity-40' : ''}`}
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
  const m = MODES[game.mode]
  const top = useMemo(() => [...players].sort((a, b) => b.score - a.score).slice(0, 3).filter((p) => p.score > 0), [players])
  const winners = players.filter((p) => p.alive)
  const unit = game.mode === 'chosung' ? '점' : '문제'

  return (
    <div className="text-center">
      <h1 className="pixel-title font-pixel text-5xl">
        {m.emoji} {m.name} 끝!
      </h1>
      <p className="pixel-title sm mt-3 font-pixel">
        {game.vol}권 · {game.questions.length}문제
      </p>

      {eliminates(game.mode) && (
        <section className="pixel-panel mt-8 p-6">
          <h2 className="font-pixel text-2xl">🔔 끝까지 살아남은 친구 {winners.length}명</h2>
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
      )}

      {game.mode === 'tug' && (
        <section className="pixel-panel mt-8 p-6">
          <h2 className="pop font-pixel text-4xl">
            {game.winner === null ? '🤝 무승부!' : `${TEAM[game.winner].emoji} ${TEAM[game.winner].name} 승리!`}
          </h2>
          <div className="mt-4">
            <Rope rope={game.rope} teamScore={game.teamScore} big />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[0, 1].map((t) => (
              <div key={t} className={`rounded-2xl border-[3px] border-ink p-4 ${TEAM[t].bg}`}>
                <p className="font-pixel text-xl">{TEAM[t].name}</p>
                <ul className="mt-3 flex flex-wrap justify-center gap-3">
                  {players
                    .filter((p) => p.team === t)
                    .map((p) => (
                      <li key={p.id} className="flex flex-col items-center font-pixel text-xs">
                        <PixelCat color={catForNumber(p.number)} size={2} />
                        {p.nickname}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 font-pixel text-sm text-ink-soft">이긴 팀도 진 팀도 모두 수고했어요! 맞힌 만큼 학급 나무가 자랐어요 🌳</p>
        </section>
      )}

      {game.mode !== 'tug' && top.length > 0 && (
        <section className="pixel-panel plain mx-auto mt-6 max-w-md p-5 font-pixel">
          <h3 className="text-lg">⭐ {game.mode === 'chosung' ? '스피드 왕' : '가장 많이 맞힌 친구'}</h3>
          <ol className="mt-3 space-y-1">
            {top.map((p, i) => (
              <li key={p.id} className={i === 0 ? 'text-xl' : ''}>
                {['🥇', '🥈', '🥉'][i]} {p.nickname} — {p.score}
                {unit}
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
