import { Fragment, useMemo, useRef, useState } from 'react'
import { recordAttempt, revealAnswer } from '../lib/learning'
import { Hearts, Mascot } from './pixel'
import type { Item, Student } from '../lib/types'

/**
 * 빈칸 채우기형 문항 공통 화면 — 정답은 서버(submit_attempt)에서만 채점
 *   synonym_fill   : 예문마다 '비슷한 말' 빈칸 1개
 *   scene_fill     : 장면 문장 속 (   ) 빈칸
 *   paragraph_fill : 글 속 (   ) 빈칸
 *   mcq            : 낱말 묶음과 통하는 말 1개 고르기
 *   match          : 왼쪽 문장마다 알맞은 뜻 고르기
 * 응답 형식: 빈칸 순서대로 보기 번호 배열  예) [2, 0, 1]
 * 기회 2번 → 두 번 틀리면 정답 공개
 */

const BLANK = /\(\s*\)/

type Segment = string | { blank: number }
type Line = { segments: Segment[]; caption?: string }

function toLines(item: Item, headword: string): { lines: Line[]; blankCount: number; options: string[] } {
  const p = item.prompt as Record<string, unknown>
  let n = 0
  const splitBlanks = (text: string): Segment[] => {
    const parts = text.split(BLANK)
    const segs: Segment[] = []
    parts.forEach((part, i) => {
      if (part) segs.push(part)
      if (i < parts.length - 1) segs.push({ blank: n++ })
    })
    return segs
  }

  switch (item.type) {
    case 'synonym_fill': {
      const lines = (p.sentences as string[]).map((s) => ({
        segments: [s, ' → ', { blank: n++ }] as Segment[],
      }))
      return { lines, blankCount: n, options: item.options ?? [] }
    }
    case 'scene_fill':
      return {
        lines: (p.sentences as string[]).map((s) => ({ segments: splitBlanks(s) })),
        blankCount: n,
        options: item.options ?? [],
      }
    case 'paragraph_fill':
      return { lines: [{ segments: splitBlanks(p.text as string) }], blankCount: n, options: item.options ?? [] }
    case 'mcq':
      return {
        lines: [{ caption: (p.group as string[]).join(' · '), segments: ['통하는 말: ', { blank: n++ }] }],
        blankCount: n,
        options: item.options ?? [],
      }
    case 'match':
      return {
        lines: (p.left as string[]).map((s) => ({ segments: [s, ' → ', { blank: n++ }] as Segment[] })),
        blankCount: n,
        options: p.right as string[],
      }
    default:
      return { lines: [{ segments: [`(${headword}) 지원하지 않는 문항`] }], blankCount: 0, options: [] }
  }
}

const TITLE: Record<string, string> = {
  synonym_fill: '밑줄 친 낱말과 뜻이 비슷한 말을 골라요.',
  scene_fill: '장면에 어울리는 말을 빈칸에 넣어요.',
  paragraph_fill: '글에 어울리는 말을 빈칸에 넣어요.',
  mcq: '낱말들과 뜻이 통하는 말을 골라요.',
  match: '문장 속 낱말의 뜻을 골라요.',
}

type Phase = 'answering' | 'retry' | 'correct' | 'revealed'

export default function BlankQuestion({
  item,
  headword,
  student,
  onDone,
}: {
  item: Item
  headword: string
  student: Student
  onDone: (correct: boolean) => void
}) {
  const { lines, blankCount, options } = useMemo(() => toLines(item, headword), [item, headword])
  const [picks, setPicks] = useState<(number | null)[]>(() => Array(blankCount).fill(null))
  const [active, setActive] = useState(0)
  const [phase, setPhase] = useState<Phase>('answering')
  const [answer, setAnswer] = useState<number[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [startedAt] = useState(() => Date.now())
  const attemptNo = useRef<1 | 2>(1)

  const locked = phase === 'correct' || phase === 'revealed'
  const complete = picks.every((x) => x !== null)

  function choose(opt: number) {
    if (locked) return
    const next = [...picks]
    next[active] = opt
    setPicks(next)
    const empty = next.findIndex((x) => x === null)
    if (empty >= 0) setActive(empty)
    // 'retry' 안내는 다음 제출까지 유지 (사라지면 버튼 위치가 바뀌어 잘못 누르기 쉬움)
  }

  async function submit() {
    if (!complete) return
    setBusy(true)
    setError('')
    try {
      const ok = await recordAttempt(student, item, picks, attemptNo.current, Date.now() - startedAt)
      if (ok === true) {
        setPhase('correct')
      } else if (attemptNo.current === 1) {
        attemptNo.current = 2
        setPhase('retry')
      } else {
        setAnswer(await revealAnswer(item.id))
        setPhase('revealed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  function blankView(i: number) {
    const v = picks[i]
    const right = answer?.[i]
    let cls = 'border-dashed border-ink-soft bg-white text-ink-soft'
    if (v !== null) cls = 'border-solid border-ink bg-[#fff4c2] text-ink'
    if (phase === 'correct') cls = 'border-solid border-ok bg-ok-bg text-ok pop'
    if (phase === 'revealed')
      cls = v === right ? 'border-solid border-ok bg-ok-bg text-ok' : 'border-solid border-bad bg-bad-bg text-bad'
    if (!locked && active === i) cls += ' ring-4 ring-star'
    return (
      <button
        key={`b${i}`}
        type="button"
        onClick={() => !locked && setActive(i)}
        className={`mx-1 inline-flex min-w-20 items-center justify-center rounded-full border-[3px] px-3 py-0.5 align-middle font-pixel ${cls}`}
      >
        {v !== null ? options[v] : '？'}
        {phase === 'revealed' && right !== undefined && v !== right && (
          <span className="ml-2 text-ok">→ {options[right]}</span>
        )}
      </button>
    )
  }

  const highlight = (text: string) => {
    if (item.type !== 'synonym_fill' && item.type !== 'match') return text
    const stem = headword.replace(/하다$/, '')
    const parts = text.split(stem)
    return parts.map((part, i) => (
      <Fragment key={i}>
        {part}
        {i < parts.length - 1 && (
          <u className="font-bold decoration-coral decoration-[3px] underline-offset-4">{stem}</u>
        )}
      </Fragment>
    ))
  }

  // 남은 기회: 처음 2 → 한 번 틀리면 1 → 공개 시 0
  const heartsLeft = phase === 'revealed' ? 0 : phase === 'retry' || attemptNo.current === 2 ? 1 : 2
  const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']

  const feedback =
    phase === 'retry'
      ? { cat: 'gray' as const, msg: '아쉬워! 한 번 더 생각해 볼까? 🤔', cls: 'text-ink' }
      : phase === 'correct'
        ? { cat: 'cheese' as const, msg: '정답이야! 대단해! 🎉', cls: 'text-ok' }
        : phase === 'revealed'
          ? { cat: 'black' as const, msg: '정답을 확인하고 문장을 다시 읽어 보자.', cls: 'text-bad' }
          : null

  return (
    <div>
      <div className="pixel-panel p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-pixel text-base">{TITLE[item.type]}</p>
          <Hearts total={2} left={heartsLeft} size={3} />
        </div>

        <div className="space-y-3 text-lg leading-loose">
          {lines.map((line, li) => (
            <div
              key={li}
              className={item.type === 'paragraph_fill' ? 'px-1' : 'rounded-2xl border-[3px] border-ink bg-white px-4 py-3'}
            >
              {line.caption && <div className="mb-2 font-pixel text-2xl">{line.caption}</div>}
              {lines.length > 1 && item.type !== 'scene_fill' && (
                <b className="mr-1 font-pixel text-coral">{li + 1}.</b>
              )}
              {line.segments.map((seg, si) =>
                typeof seg === 'string' ? <Fragment key={si}>{highlight(seg)}</Fragment> : blankView(seg.blank),
              )}
            </div>
          ))}
        </div>

        {!locked && (
          <div className={`mt-6 grid gap-3 ${item.type === 'match' ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {options.map((o, i) => (
              <button
                key={`${o}-${i}`}
                type="button"
                onClick={() => choose(i)}
                className="pixel-btn justify-start px-4 py-3 text-left font-pixel text-lg"
              >
                <span className="text-coral">{LETTERS[i]}.</span> {o}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-4 rounded-xl border-2 border-bad bg-bad-bg p-3 text-sm text-bad">{error}</p>}

        <div className="mt-6">
          {locked ? (
            <button onClick={() => onDone(phase === 'correct')} className="pixel-btn go w-full py-4 font-pixel text-2xl">
              NEXT ▶
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!complete || busy}
              className="pixel-btn primary w-full py-4 font-pixel text-2xl"
            >
              {busy ? '채점 중…' : '확인하기'}
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <Mascot color={feedback.cat} size={4} className="mt-6">
          <span className={feedback.cls}>{feedback.msg}</span>
        </Mascot>
      )}
    </div>
  )
}
