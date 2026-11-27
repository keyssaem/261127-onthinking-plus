import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import Shell, { PlayerBadge, Spinner } from '../../components/Shell'
import { Mascot, PixelCat, Star, catForNumber } from '../../components/pixel'
import { db } from '../../lib/firebase'
import { useStudent } from '../../lib/student'
import {
  OPTION_STYLE,
  useBellItem,
  useCountdown,
  useGame,
  useLiveGameId,
  type BellGame,
  type BellPlayer,
} from '../../lib/bell'
import type { Student } from '../../lib/types'

/** 골든벨 참가 화면 (학생 기기) */
export default function BellPlay() {
  const { student, loading } = useStudent()
  const liveId = useLiveGameId(student?.class_id ?? null)
  // 끝난 뒤에도 결과를 보여 주려고 마지막 게임 id 기억
  const [gameId, setGameId] = useState<string | null>(null)
  useEffect(() => {
    if (liveId) setGameId(liveId)
  }, [liveId])

  if (loading) return <Spinner />
  if (!student) return <Navigate to="/join" replace />
  if (student.guest || !student.class_id) return <Navigate to="/learn" replace />

  return (
    <Shell right={<PlayerBadge>{`${student.number}번 ${student.nickname}`}</PlayerBadge>}>
      {liveId === undefined ? (
        <p className="pixel-title sm text-center font-pixel">불러오는 중…</p>
      ) : gameId ? (
        <Game student={student} classId={student.class_id} gameId={gameId} />
      ) : (
        <div className="flex flex-col items-center gap-6 pt-6 text-center">
          <PixelCat color="gray" size={5} className="bob" />
          <p className="pixel-title font-pixel text-2xl">지금 열린 골든벨이 없어요</p>
          <Link to="/learn" className="pixel-btn px-6 py-3 font-pixel">
            ◀ 낱말 목록
          </Link>
        </div>
      )}
    </Shell>
  )
}

function Game({ student, classId, gameId }: { student: Student; classId: string; gameId: string }) {
  const game = useGame(classId, gameId)
  const [me, setMe] = useState<BellPlayer | null | undefined>(undefined)
  const [err, setErr] = useState('')
  const playerRef = doc(db!, 'classes', classId, 'games', gameId, 'players', student.id)

  useEffect(
    () =>
      onSnapshot(playerRef, (s) =>
        setMe(s.exists() ? ({ id: s.id, ...(s.data() as Omit<BellPlayer, 'id'>) }) : null),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classId, gameId, student.id],
  )

  // 처음 열면 참가 (대기실이면 도전자, 진행 중이면 응원단)
  useEffect(() => {
    if (me !== null || !game || game.status === 'ended') return
    setDoc(playerRef, {
      number: student.number,
      nickname: student.nickname,
      alive: game.status === 'lobby',
      score: 0,
      joinedAt: serverTimestamp(),
    }).catch((e) => setErr(String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, game?.status])

  if (game === undefined || me === undefined) return <p className="pixel-title sm text-center font-pixel">불러오는 중…</p>
  if (!game) return <p className="pixel-panel p-6 font-pixel">게임이 없어요.</p>

  if (game.status === 'lobby')
    return (
      <div className="flex flex-col items-center gap-6 pt-4 text-center">
        <h1 className="pixel-title font-pixel text-5xl">🔔 골든벨</h1>
        <p className="pixel-title sm font-pixel">{game.vol}권 · {game.questions.length}문제</p>
        <PixelCat color={catForNumber(student.number)} size={6} className="bob" />
        <Mascot color="cream" size={3} className="w-full text-left">
          {me ? '참가 완료! 선생님이 시작할 때까지 기다려요. 화면을 끄지 마세요.' : '참가하는 중…'}
          {err && <span className="block text-bad">{err}</span>}
        </Mascot>
      </div>
    )

  if (game.status === 'ended') return <Ended game={game} me={me} />
  return <Round key={game.qIndex} game={game} me={me} classId={classId} student={student} />
}

function Round({ game, me, classId, student }: { game: BellGame; me: BellPlayer | null; classId: string; student: Student }) {
  const item = useBellItem(game.questions[game.qIndex])
  const isQuestion = game.status === 'question'
  const left = useCountdown(game.startedAt, game.limitSec, isQuestion)
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const answerRef = doc(db!, 'classes', classId, 'games', game.id, 'answers', `${student.id}__${game.qIndex}`)

  // 새로고침해도 이미 낸 답 보이기
  useEffect(() => {
    getDoc(answerRef)
      .then((s) => s.exists() && setPicked(s.data().response as number))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function choose(i: number) {
    if (picked !== null || busy || !isQuestion || left <= 0) return
    setBusy(true)
    setErr('')
    try {
      await setDoc(answerRef, { studentId: student.id, qIndex: game.qIndex, response: i, at: serverTimestamp() })
      setPicked(i)
    } catch {
      setErr('시간이 끝났거나 답을 보낼 수 없어요.')
    }
    setBusy(false)
  }

  const rv = game.reveal
  const right = rv && picked === rv.answer
  const alive = me?.alive ?? false

  return (
    <div>
      <div className="mb-3 flex items-center justify-between font-pixel text-sm">
        <span className="pixel-chip">
          문제 {game.qIndex + 1}/{game.questions.length}
        </span>
        <span className={`pixel-chip ${alive ? 'bg-ok-bg' : 'bg-[#eee]'}`}>{alive ? '🙋 도전 중' : '📣 응원단'}</span>
      </div>

      {isQuestion && (
        <div className="mb-3 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-white">
          <div className={`h-full ${left < 5 ? 'bg-heart' : 'bg-xp'}`} style={{ width: `${(left / game.limitSec) * 100}%` }} />
        </div>
      )}

      <section className="pixel-panel p-5 text-center">
        {item ? (
          <>
            <p className="font-pixel text-xs text-ink-soft">이 뜻을 가진 낱말은?</p>
            <p className="mt-2 text-xl leading-snug font-bold">{item.prompt.definition}</p>
            {item.prompt.example && <p className="mt-2 font-pixel text-ink-soft">예) {item.prompt.example}</p>}
          </>
        ) : (
          <p className="font-pixel">문제 불러오는 중…</p>
        )}
      </section>

      {item && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {item.options.map((o, i) => {
            const mine = picked === i
            const correct = rv?.answer === i
            const dim = (picked !== null && !mine && !rv) || (rv && !correct && !mine)
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={picked !== null || !isQuestion || left <= 0}
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-[3px] border-ink p-3 font-pixel text-2xl shadow-[0_5px_0_0_var(--color-ink)] active:translate-y-1 active:shadow-none disabled:cursor-default ${OPTION_STYLE[i].bg} ${dim ? 'opacity-35' : ''} ${mine ? 'ring-8 ring-ink/70' : ''} ${correct ? 'pop ring-8 ring-star' : ''}`}
              >
                <span className="text-sm">{OPTION_STYLE[i].label}</span>
                {o}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-5">
        {err && <p className="mb-3 font-pixel text-sm text-bad">{err}</p>}
        {isQuestion ? (
          <Mascot color={catForNumber(student.number)} size={3}>
            {picked !== null ? '답을 보냈어! 정답 공개를 기다려요 ✉️' : left > 0 ? `${Math.ceil(left)}초 남았어!` : '시간 끝!'}
          </Mascot>
        ) : rv ? (
          <Mascot color={catForNumber(student.number)} size={3}>
            {right ? (
              <b className="text-ok">⭕ 정답! </b>
            ) : (
              <b className="text-bad">{picked === null ? '⏰ 시간이 지났어요. ' : '❌ 아쉬워요. '}</b>
            )}
            {rv.saved
              ? '모두 틀려서 이번엔 아무도 탈락하지 않아요!'
              : alive
                ? '살아남았어요! 다음 문제도 힘내요 💪'
                : '탈락했지만 응원단으로 계속 풀 수 있어요. 패자부활을 기다려요!'}
          </Mascot>
        ) : null}
      </div>
    </div>
  )
}

function Ended({ game, me }: { game: BellGame; me: BellPlayer | null }) {
  const won = !!me?.alive
  return (
    <div className="flex flex-col items-center gap-5 pt-4 text-center">
      {won && (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Star key={i} size={5} />
          ))}
        </div>
      )}
      <h1 className="pixel-title font-pixel text-5xl leading-tight">{won ? '🔔 골든벨!' : '골든벨 끝'}</h1>
      <p className="pixel-title sm font-pixel text-lg">
        {game.vol}권 {game.questions.length}문제 중 <b>{me?.score ?? 0}문제</b> 맞혔어요
      </p>
      <Mascot color="cream" size={4} className="w-full max-w-md text-left">
        {won ? '끝까지 살아남았어! 정말 대단해 🌟' : '틀린 낱말은 낱말 목록에서 다시 공부해 보자. 다음엔 골든벨을 울릴 수 있어!'}
      </Mascot>
      <Link to="/learn" className="pixel-btn go px-8 py-4 font-pixel text-xl">
        낱말 목록으로 ▶
      </Link>
    </div>
  )
}
