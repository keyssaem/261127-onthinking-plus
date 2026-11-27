import { canSpeak, speak } from '../lib/speak'
import type { Word } from '../lib/types'

type Props = {
  word: Word
  onAnswer?: (known: boolean) => void
  busy?: boolean
}

/** 이해1: 낱말의 사전적 의미 (한자 · 뜻 · 예문 · 관련 낱말) + 알아요/몰라요 */
export default function WordCard({ word, onAnswer, busy }: Props) {
  const readAll = () =>
    speak(`${word.headword}. ${word.senses.map((s) => `${s.definition} ${s.examples.join('. ')}`).join('. ')}`)

  return (
    <div className="pixel-panel p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-pixel text-5xl">
            {word.headword}
            {word.homograph_no ? <sup className="ml-1 text-lg text-ink-soft">{word.homograph_no}</sup> : null}
          </div>
          {word.hanja && <div className="mt-2 text-3xl text-ink-soft">{word.hanja}</div>}
        </div>
        {canSpeak && (
          <button onClick={readAll} className="pixel-btn sky px-3 py-2 font-pixel text-sm" title="읽어주기">
            🔊 읽어주기
          </button>
        )}
      </div>

      {!!word.hanja_gloss?.length && (
        <div className="mt-4 flex flex-wrap gap-2">
          {word.hanja_gloss.map((g) => (
            <span key={g} className="pixel-chip bg-[#fff4c2] text-base">
              {g}
            </span>
          ))}
        </div>
      )}

      <ol className="mt-5 space-y-3">
        {word.senses.map((s, i) => (
          <li key={i} className="rounded-2xl border-[3px] border-ink bg-white p-4">
            <p className="text-lg font-semibold">
              {word.senses.length > 1 && <b className="mr-1 font-pixel text-coral">{i + 1}.</b>}
              {s.definition}
            </p>
            {s.examples.map((ex) => (
              <p key={ex} className="mt-1 text-ink-soft">
                ‣ {ex}
              </p>
            ))}
          </li>
        ))}
      </ol>

      {!!word.related.length && (
        <div className="mt-4">
          <div className="mb-2 font-pixel text-sm text-ink-soft">함께 알아 두면 좋은 낱말</div>
          <div className="flex flex-wrap gap-2">
            {word.related.map((r) => (
              <span key={r} className="pixel-chip text-sm">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {onAnswer && (
        <div className="mt-6 grid grid-cols-2 gap-4">
          <button disabled={busy} onClick={() => onAnswer(true)} className="pixel-btn go py-4 font-pixel text-2xl">
            알아요 🙂
          </button>
          <button disabled={busy} onClick={() => onAnswer(false)} className="pixel-btn sky py-4 font-pixel text-2xl">
            몰라요 🤔
          </button>
        </div>
      )}
    </div>
  )
}
