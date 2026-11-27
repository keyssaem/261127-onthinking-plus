import { useState } from 'react'
import { submitSentence } from '../lib/learning'
import { Mascot } from './pixel'
import type { Item, Student } from '../lib/types'

/** 활용: 한 문장 쓰기 → 선생님 검토 대기열(submissions)로 제출 */
export default function SentenceWrite({
  item,
  headword,
  student,
  onDone,
}: {
  item: Item
  headword: string
  student: Student
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const stem = headword.replace(/하다$/, '')
  const usesWord = text.includes(stem)
  const trimmed = text.trim()

  async function submit() {
    if (!trimmed) return
    setBusy(true)
    setError('')
    try {
      await submitSentence(student, item, trimmed)
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <div>
      <div className="pixel-panel p-5 sm:p-6">
        <p className="mb-4 font-pixel text-base">
          ‘<b className="text-coral">{headword}</b>’을(를) 넣어 나만의 문장을 써 봐요.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sent}
          rows={3}
          maxLength={200}
          placeholder={`예) ${headword}…`}
          className="pixel-input text-lg disabled:bg-ok-bg"
        />
        <div className="mt-2 flex justify-between font-pixel text-xs">
          <span className={trimmed && !usesWord ? 'text-bad' : 'text-ink-soft'}>
            {trimmed && !usesWord ? `‘${stem}’이(가) 문장에 들어 있나요?` : ' '}
          </span>
          <span className="text-ink-soft">{text.length}/200</span>
        </div>
        {error && <p className="mt-3 rounded-xl border-2 border-bad bg-bad-bg p-3 text-sm text-bad">{error}</p>}
        {sent ? (
          <button onClick={onDone} className="pixel-btn go mt-5 w-full py-4 font-pixel text-2xl">
            NEXT ▶
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!trimmed || busy}
            className="pixel-btn primary mt-5 w-full py-4 font-pixel text-2xl"
          >
            {busy ? '저장 중…' : student.guest ? '💾 내 연습장에 저장' : '✉️ 선생님께 보내기'}
          </button>
        )}
      </div>
      {sent && (
        <Mascot color="cream" size={4} className="mt-6">
          {student.guest ? '내 연습장에 저장했어! 멋진 문장이야 💾' : '선생님께 보냈어! 멋진 문장이야 ✉️'}
        </Mascot>
      )}
    </div>
  )
}
