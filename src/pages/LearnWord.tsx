import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import BlankQuestion from '../components/BlankQuestion'
import SentenceWrite from '../components/SentenceWrite'
import Shell, { PlayerBadge, Spinner } from '../components/Shell'
import { Mascot, Star, XpBar, catForNumber } from '../components/pixel'
import WordCard from '../components/WordCard'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { recordAttempt } from '../lib/learning'
import { useStudent } from '../lib/student'
import { STAGE_LABEL, STAGE_ORDER, type Item, type Word } from '../lib/types'

/** 채점 가능한 학습 단계 문항만 출제 (정답 미입력 문항·골든벨 전용 문항은 건너뜀) */
const playable = (it: Item) =>
  (STAGE_ORDER as readonly string[]).includes(it.stage) && (it.type === 'card' || it.type === 'sentence_write' || it.answer_ready)

function neighborId(wordId: string, delta: number) {
  const n = Number(wordId.split('-')[1]) + delta
  return n >= 44 && n <= 336 ? `L2-${String(n).padStart(3, '0')}` : null
}

export default function LearnWord() {
  const { wordId = '' } = useParams()
  const startStage = useSearchParams()[0].get('stage') // 예: ?stage=활용 (선생님 '다시 써 볼까?' 링크)
  const { student, loading } = useStudent()
  const [word, setWord] = useState<Word | null>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [step, setStep] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!db || !student) return
    let alive = true
    Promise.all([
      getDoc(doc(db, 'words', wordId)),
      getDocs(query(collection(db, 'items'), where('word_id', '==', wordId))),
    ]).then(([w, it]) => {
      if (!alive) return
      setWord(w.exists() ? ({ id: w.id, ...w.data() } as Word) : null)
      const list = it.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Item)
        .filter(playable)
        .sort((a, b) => STAGE_ORDER.indexOf(a.stage as never) - STAGE_ORDER.indexOf(b.stage as never))
      setItems(list)
      setStep(Math.max(0, list.findIndex((i) => i.stage === startStage)))
      setResults([])
    })
    return () => {
      alive = false
    }
  }, [wordId, student, startStage])

  if (loading) return <Spinner />
  if (!student) return <Navigate to="/join" replace />
  if (!word || !items) return <Spinner />

  const current = items[step]
  const next = () => setStep((s) => s + 1)
  const scored = results.length
  const correct = results.filter(Boolean).length

  async function answerCard(known: boolean) {
    if (!current || !student) return
    setBusy(true)
    try {
      await recordAttempt(student, current, known ? '알아요' : '몰라요')
    } catch (e) {
      console.error(e)
    }
    setBusy(false)
    next()
  }

  const nextWord = neighborId(word.id, 1)

  return (
    <Shell right={<PlayerBadge>{student.guest ? '🐾 혼자 연습' : `${student.number}번 ${student.nickname}`}</PlayerBadge>}>
      {/* HUD: 목록 · 진행 게이지 */}
      <div className="mb-4 flex items-center gap-3">
        <Link to="/learn" className="pixel-btn px-3 py-1.5 font-pixel text-sm">
          ◀ 목록
        </Link>
        <XpBar value={Math.min(step, items.length)} max={items.length} className="flex-1" />
      </div>

      {current ? (
        <>
          <h1 className="pixel-title mb-1 text-center font-pixel text-3xl">{STAGE_LABEL[current.stage]}</h1>
          <p className="pixel-title sm mb-5 text-center font-pixel text-sm">
            STAGE {step + 1}/{items.length} · No.{word.seq} {word.headword}
          </p>
          {current.type === 'card' ? (
            <WordCard word={word} onAnswer={answerCard} busy={busy} />
          ) : current.type === 'sentence_write' ? (
            <SentenceWrite key={current.id} item={current} headword={word.headword} student={student} onDone={next} />
          ) : (
            <BlankQuestion
              key={current.id}
              item={current}
              headword={word.headword}
              student={student}
              onDone={(ok) => {
                setResults((r) => [...r, ok])
                next()
              }}
            />
          )}
        </>
      ) : (
        <div className="flex flex-col items-center pt-4 text-center">
          <div className="flex gap-2">
            {Array.from({ length: Math.max(scored, 1) }, (_, i) => (
              <Star key={i} size={5} dim={i >= correct} />
            ))}
          </div>
          <h2 className="pixel-title mt-4 font-pixel text-5xl leading-tight">
            STAGE
            <br />
            CLEAR!
          </h2>
          <p className="pixel-title sm mt-3 font-pixel text-lg">‘{word.headword}’ 공부 끝!</p>

          <Mascot color={catForNumber(student.number)} className="mt-8 w-full max-w-md text-left">
            {scored > 0 ? (
              <>
                문제 {scored}개 중 <b className="text-ok">{correct}개</b>를 맞혔어!
                {correct === scored ? ' 완벽해! 🌟' : ' 다시 하면 별을 모두 모을 수 있어.'}
              </>
            ) : (
              '오늘 배운 낱말을 친구에게 설명해 볼까?'
            )}
          </Mascot>

          <div className="mt-6 grid w-full max-w-md gap-4 sm:grid-cols-2">
            <button
              onClick={() => {
                setStep(0)
                setResults([])
              }}
              className="pixel-btn sky py-4 font-pixel text-xl"
            >
              ↺ 다시 하기
            </button>
            {nextWord ? (
              <Link to={`/learn/${nextWord}`} className="pixel-btn go py-4 font-pixel text-xl">
                다음 낱말 ▶
              </Link>
            ) : (
              <Link to="/learn" className="pixel-btn go py-4 font-pixel text-xl">
                목록으로
              </Link>
            )}
          </div>
        </div>
      )}
    </Shell>
  )
}
