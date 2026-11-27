import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import Shell, { PlayerBadge, Spinner } from '../../components/Shell'
import { Mascot, PixelCat, Star, catForNumber } from '../../components/pixel'
import Rope from '../../components/Rope'
import { db } from '../../lib/firebase'
import { useStudent } from '../../lib/student'
import {
  MODES,
  OPTION_STYLE,
  TEAM,
  normalizeWord,
  useCountdown,
  useGame,
  useLiveGameId,
  useQuestion,
  type BellGame,
  type BellPlayer,
} from '../../lib/bell'
import type { Student } from '../../lib/types'

/** 단체 게임 참가 화면 (학생 기기) */
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
        <Game key={gameId} student={student} classId={student.class_id} gameId={gameId} />
      ) : (
        <div className="flex flex-col items-center gap-6 pt-6 text-center">
          <PixelCat color="gray" size={5} className="bob" />
          <p className="pixel-title font-pixel text-2xl">지금 열린 게임이 없어요</p>
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
    () => onSnapshot(playerRef, (s) => setMe(s.exists() ? { id: s.id, ...(s.data() as Omit<BellPlayer, 'id'>) } : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classId, gameId, student.id],
  )

  // 처음 열면 참가 (대기실이면 도전자, 진행 중이면 응원단 — 줄다리기는 선생님 화면이 팀 배정)
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
  const m = MODES[game.mode]

  if (game.status === 'lobby')
    return (
      <div className="flex flex-col items-center gap-6 pt-4 text-center">
        <h1 className="pixel-title font-pixel text-5xl">
          {m.emoji} {m.name}
        </h1>
        <p className="pixel-title sm font-pixel">
          {game.vol}권 · {game.questions.length}문제
        </p>
        <PixelCat color={catForNumber(student.number)} size={6} className="bob" />
        <Mascot color="cream" size={3} className="w-full text-left">
          {me ? '참가 완료! 선생님이 시작할 때까지 기다려요. 화면을 끄지 마세요.' : '참가하는 중…'}
          {game.mode === 'tug' && me && <span className="block text-sm text-ink-soft">시작하면 팀이 정해져요.</span>}
          {err && <span className="block text-bad">{err}</span>}
        </Mascot>
      </div>
    )

  if (game.status === 'ended') return <Ended game={game} me={me} />
  return <Round key={game.qIndex} game={game} me={me} classId={classId} student={student} />
}

function Round({ game, me, classId, student }: { game: BellGame; me: BellPlayer | null; classId: string; student: Student }) {
  const q = useQuestion(game.questions[game.qIndex])
  const isQuestion = game.status === 'question'
  const left = useCountdown(game.startedAt, game.limitSec, isQuestion)
  const [picked, setPicked] = useState<number | string | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const answerRef = doc(db!, 'classes', classId, 'games', game.id, 'answers', `${student.id}__${game.qIndex}`)
  const elim = game.mode === 'bell' || game.mode === 'sentence'

  // 새로고침해도 이미 낸 답 보이기
  useEffect(() => {
    getDoc(answerRef)
      .then((s) => s.exists() && setPicked(s.data().response as number | string))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function send(response: number | string) {
    if (picked !== null || busy || !isQuestion || left <= 0) return
    setBusy(true)
    setErr('')
    try {
      await setDoc(answerRef, { studentId: student.id, qIndex: game.qIndex, response, at: serverTimestamp() })
      setPicked(response)
    } catch {
      setErr('시간이 끝났거나 답을 보낼 수 없어요.')
    }
    setBusy(false)
  }
  const onType = (e: FormEvent) => {
    e.preventDefault()
    const t = normalizeWord(typed)
    if (t) send(t.slice(0, 20))
  }

  const rv = game.reveal
  const right =
    rv && picked !== null && (game.mode === 'chosung' ? normalizeWord(String(picked)) === normalizeWord(rv.answerText) : picked === rv.answer)
  const alive = me?.alive ?? false
  const team = me?.team

  return (
    <div>
      <div className="mb-3 flex items-center justify-between font-pixel text-sm">
        <span className="pixel-chip">
          {MODES[game.mode].emoji} 문제 {game.qIndex + 1}/{game.questions.length}
        </span>
        {elim ? (
          <span className={`pixel-chip ${alive ? 'bg-ok-bg' : 'bg-[#eee]'}`}>{alive ? '🙋 도전 중' : '📣 응원단'}</span>
        ) : game.mode === 'tug' ? (
          team !== undefined && <span className={`pixel-chip ${TEAM[team].bg}`}>{TEAM[team].name}</span>
        ) : (
          <span className="pixel-chip">⚡ {me?.score ?? 0}점</span>
        )}
      </div>

      {game.mode === 'tug' && (
        <div className="pixel-panel plain mb-3 p-3">
          <Rope rope={game.rope} teamScore={game.teamScore} />
        </div>
      )}

      {isQuestion && (
        <div className="mb-3 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-white">
          <div className={`h-full ${left < 5 ? 'bg-heart' : 'bg-xp'}`} style={{ width: `${(left / game.limitSec) * 100}%` }} />
        </div>
      )}

      <section className="pixel-panel p-5 text-center">
        {!q ? (
          <p className="font-pixel">문제 불러오는 중…</p>
        ) : q.sentence ? (
          <>
            <p className="font-pixel text-xs text-ink-soft">★ 자리에 알맞은 낱말은?</p>
            <p className="mt-2 text-xl leading-snug font-bold">{q.sentence}</p>
          </>
        ) : (
          <>
            <p className="font-pixel text-xs text-ink-soft">{game.mode === 'chosung' ? '초성과 뜻을 보고 낱말을 써요' : '이 뜻을 가진 낱말은?'}</p>
            {game.mode === 'chosung' && <p className="pixel-title mt-2 font-pixel text-5xl tracking-[0.3em]">{game.hint}</p>}
            <p className="mt-2 text-xl leading-snug font-bold">{q.definition}</p>
            {q.example && <p className="mt-2 font-pixel text-ink-soft">예) {q.example}</p>}
          </>
        )}
      </section>

      {q && game.mode === 'chosung' && (
        <form onSubmit={onType} className="mt-4 flex gap-2">
          <input
            value={picked !== null ? String(picked) : typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={picked !== null || !isQuestion || left <= 0}
            maxLength={20}
            autoFocus
            autoComplete="off"
            placeholder={game.hint ? `${game.hint} …` : '낱말 쓰기'}
            className={`pixel-input flex-1 text-center font-pixel text-3xl ${rv ? (right ? 'bg-ok-bg!' : 'bg-bad-bg!') : ''}`}
          />
          {picked === null && isQuestion && (
            <button disabled={busy || !typed.trim() || left <= 0} className="pixel-btn go px-6 font-pixel text-xl">
              ▶
            </button>
          )}
        </form>
      )}

      {q && game.mode !== 'chosung' && (
        <div className={`mt-4 grid gap-3 ${q.options.length === 3 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {q.options.map((o, i) => {
            const mine = picked === i
            const isAns = rv?.answer === i
            const dim = (picked !== null && !mine && !rv) || (rv && !isAns && !mine)
            return (
              <button
                key={i}
                onClick={() => send(i)}
                disabled={picked !== null || !isQuestion || left <= 0}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-[3px] border-ink p-3 font-pixel text-2xl shadow-[0_5px_0_0_var(--color-ink)] active:translate-y-1 active:shadow-none disabled:cursor-default ${OPTION_STYLE[i].bg} ${dim ? 'opacity-35' : ''} ${mine ? 'ring-8 ring-ink/70' : ''} ${isAns ? 'pop ring-8 ring-star' : ''}`}
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
            {game.mode === 'chosung' && <>정답은 ‘{rv.answerText}’. </>}
            {elim
              ? rv.saved
                ? '모두 틀려서 이번엔 아무도 탈락하지 않아요!'
                : alive
                  ? '살아남았어요! 다음 문제도 힘내요 💪'
                  : '탈락했지만 응원단으로 계속 풀 수 있어요. 패자부활을 기다려요!'
              : game.mode === 'tug'
                ? right
                  ? '우리 팀 쪽으로 줄을 당겼어요! 💪'
                  : '팀 친구들이 힘내고 있어요!'
                : right
                  ? `지금 ${me?.score ?? 0}점!`
                  : '다음 문제에서 만회해요!'}
          </Mascot>
        ) : null}
      </div>
    </div>
  )
}

function Ended({ game, me }: { game: BellGame; me: BellPlayer | null }) {
  const m = MODES[game.mode]
  const elim = game.mode === 'bell' || game.mode === 'sentence'
  const won = elim ? !!me?.alive : game.mode === 'tug' ? me?.team !== undefined && me.team === game.winner : false
  return (
    <div className="flex flex-col items-center gap-5 pt-4 text-center">
      {won && (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Star key={i} size={5} />
          ))}
        </div>
      )}
      <h1 className="pixel-title font-pixel text-5xl leading-tight">
        {game.mode === 'tug'
          ? game.winner === null
            ? '🤝 무승부!'
            : `${TEAM[game.winner].emoji} ${TEAM[game.winner].name} 승리!`
          : won
            ? '🔔 골든벨!'
            : `${m.emoji} ${m.name} 끝`}
      </h1>
      <p className="pixel-title sm font-pixel text-lg">
        {game.mode === 'chosung' ? (
          <>
            내 점수 <b>{me?.score ?? 0}점</b>
          </>
        ) : (
          <>
            {game.questions.length}문제 중 <b>{me?.score ?? 0}문제</b> 맞혔어요
          </>
        )}
      </p>
      <Mascot color="cream" size={4} className="w-full max-w-md text-left">
        {won
          ? game.mode === 'tug'
            ? '우리 팀이 이겼어! 다 같이 힘을 모은 덕분이야 🎉'
            : '끝까지 살아남았어! 정말 대단해 🌟'
          : '맞힌 만큼 우리 반 나무가 자랐어 🌳 틀린 낱말은 낱말 목록에서 다시 공부해 보자!'}
      </Mascot>
      <Link to="/learn" className="pixel-btn go px-8 py-4 font-pixel text-xl">
        낱말 목록으로 ▶
      </Link>
    </div>
  )
}
