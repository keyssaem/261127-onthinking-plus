import { useState } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { PixelCat, catForNumber } from '../../components/pixel'
import { db } from '../../lib/firebase'
import { ago, useNow, type SubmissionRow } from './classData'

type View = 'new' | 'all'

/** 한 문장 쓰기 검토: 👍 잘했어요 / ✏️ 다시 써 볼까? + 한마디 */
export default function Submissions({
  classId,
  rows,
  words,
}: {
  classId: string
  rows: SubmissionRow[] | null
  words: Record<string, string>
}) {
  const now = useNow()
  const [view, setView] = useState<View>('new')
  if (!rows) return <p className="font-pixel text-ink-soft">불러오는 중…</p>
  const fresh = rows.filter((r) => r.status === '제출')
  const shown = view === 'new' ? fresh : rows

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button onClick={() => setView('new')} className={`pixel-btn px-4 py-2 font-pixel text-sm ${view === 'new' ? 'primary' : ''}`}>
          새로 온 문장 {fresh.length}
        </button>
        <button onClick={() => setView('all')} className={`pixel-btn px-4 py-2 font-pixel text-sm ${view === 'all' ? 'primary' : ''}`}>
          모두 {rows.length}
        </button>
      </div>
      {shown.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((s) => (
            <Card key={s.id} s={s} classId={classId} headword={words[s.wordId] ?? s.wordId} now={now} />
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center font-pixel text-sm text-ink-soft">
          {view === 'new' ? '새로 온 문장이 없어요. 모두 확인했어요! ✨' : '아직 제출된 문장이 없어요.'}
        </p>
      )}
    </div>
  )
}

function Card({ s, classId, headword, now }: { s: SubmissionRow; classId: string; headword: string; now: number }) {
  const [feedback, setFeedback] = useState(s.feedback)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const num = Number(s.studentId)

  async function review(status: '확인' | '다시') {
    setBusy(true)
    setErr('')
    try {
      await updateDoc(doc(db!, 'classes', classId, 'submissions', s.id), {
        status,
        feedback: feedback.trim(),
        reviewedAt: serverTimestamp(),
      })
    } catch (e) {
      setErr(String(e))
    }
    setBusy(false)
  }

  const badge =
    s.status === '확인' ? (
      <span className="pixel-chip bg-ok-bg text-xs">👍 확인</span>
    ) : s.status === '다시' ? (
      <span className="pixel-chip bg-bad-bg text-xs">✏️ 다시</span>
    ) : (
      <span className="pixel-chip bg-[#fff4c2] text-xs">NEW</span>
    )

  return (
    <li className="pixel-panel plain p-4">
      <div className="flex items-center gap-2 font-pixel text-sm">
        <PixelCat color={catForNumber(num || 0)} size={2} />
        <b>
          {s.studentId}. {s.nickname}
        </b>
        <span className="text-ink-soft">· ‘{headword}’</span>
        <span className="ml-auto flex items-center gap-2">
          {badge}
          <span className="text-xs text-ink-soft">{ago(s.at, now)}</span>
        </span>
      </div>
      <p className="mt-3 rounded-xl border-2 border-ink bg-white p-3 text-lg leading-relaxed">
        <Highlight text={s.text} word={headword} />
      </p>
      <input
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        maxLength={80}
        placeholder="한마디 (선택) 예: 낱말을 정확하게 썼어요!"
        className="pixel-input mt-3 py-2 font-pixel text-sm"
      />
      <div className="mt-3 flex gap-2">
        <button disabled={busy} onClick={() => review('확인')} className="pixel-btn go flex-1 py-2 font-pixel text-sm">
          👍 잘했어요
        </button>
        <button disabled={busy} onClick={() => review('다시')} className="pixel-btn flex-1 py-2 font-pixel text-sm">
          ✏️ 다시 써 볼까?
        </button>
      </div>
      {err && <p className="mt-2 font-pixel text-xs text-bad">{err}</p>}
    </li>
  )
}

/** 문장 속 낱말(‘하다’ 뗀 줄기) 강조 */
function Highlight({ text, word }: { text: string; word: string }) {
  const stem = word.replace(/하다$/, '')
  const i = stem ? text.indexOf(stem) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-star/60 px-0.5">{text.slice(i, i + stem.length)}</mark>
      {text.slice(i + stem.length)}
    </>
  )
}
