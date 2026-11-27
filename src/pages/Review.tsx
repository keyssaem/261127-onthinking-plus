import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { onAuthStateChanged, type User } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import Shell, { Spinner } from '../components/Shell'
import { PixelCat } from '../components/pixel'
import { auth, db } from '../lib/firebase'
import { signOutAndReload } from '../lib/student'
import { STAGE_LABEL, type Item, type Word } from '../lib/types'
import { Login } from './Teacher'

/**
 * 정답 검수 (관리자 전용 — admins/{uid}, 지정: npm run make:admin -- 이메일)
 *  - 확장2(통하는 말 고르기)·이해2(뜻 연결하기)는 교재의 동그라미·선긋기라 PDF에서 정답을 뽑지 못함 → 여기서 입력
 *  - 자동 추출된 문항도 띄어쓰기·보기를 교정하고 '검수 완료' 표시
 *  - 저장 = answers/{id} 정답 + items/{id} (answer_ready, verified, 교정한 문구)
 */

const STAGES = ['확장2', '이해2', '확장1', '적용1', '적용2'] as const
type Stage = (typeof STAGES)[number]
type Filter = 'todo' | 'unverified' | 'all'

type RItem = Item & { verified?: boolean }

/** 자동 추출 때 걸린 낱말 (data/l2/review.md) */
const FLAGS: Record<string, string> = {
  'L2-111': '확장1 예문이 제대로 나뉘지 않았을 수 있어요.',
  'L2-137': "적용2 원문 오타 의심: '긍적' → '긍정'?",
  'L2-198': '이해2 왼쪽 문장 일부가 비어 있어요. 교재를 보고 채워 주세요.',
  'L2-218': '이해2 왼쪽 문장 일부가 비어 있어요. 교재를 보고 채워 주세요.',
  'L2-230': '확장1 문항이 없어요.',
  'L2-312': '확장1 정답이 보기에 없어요 (논설·해석?). 교재 확인.',
  'L2-315': '확장1 정답이 보기에 없어요 (상향·호전?). 교재 확인.',
  'L2-317': '확장1 정답이 보기에 없어요 (실상·현주소?). 교재 확인.',
}

const BLANK = /\(\s*\)/
const CIRCLED = '①②③④⑤⑥⑦⑧⑨'

/** 문항 → 빈칸 줄 목록 (줄마다 보기 하나 고르기) */
function blanksOf(item: RItem): { context: string; rows: string[]; options: string[] } {
  const p = item.prompt as Record<string, unknown>
  switch (item.type) {
    case 'mcq':
      return { context: '', rows: [`${(p.group as string[]).join(' · ')}  ⇒ 통하는 말`], options: item.options ?? [] }
    case 'match':
      return { context: '', rows: p.left as string[], options: p.right as string[] }
    case 'synonym_fill':
      return { context: '', rows: p.sentences as string[], options: item.options ?? [] }
    case 'scene_fill': {
      const rows: string[] = []
      for (const s of p.sentences as string[]) {
        const parts = s.split(BLANK)
        for (let i = 0; i < parts.length - 1; i++) rows.push(parts.map((x, j) => x + (j < parts.length - 1 ? (j === i ? '(  ★  )' : '(  )') : '')).join(''))
      }
      return { context: '', rows, options: item.options ?? [] }
    }
    case 'paragraph_fill': {
      let n = 0
      const text = (p.text as string).replace(/\(\s*\)/g, () => `( ${CIRCLED[n++] ?? '?'} )`)
      return { context: text, rows: Array.from({ length: n }, (_, i) => `빈칸 ${CIRCLED[i]}`), options: item.options ?? [] }
    }
    default:
      return { context: '', rows: [], options: [] }
  }
}

export default function Review() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [admin, setAdmin] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, async (u) => {
      if (u?.isAnonymous) return void signOutAndReload('/review')
      setUser(u)
      setAdmin(u ? (await getDoc(doc(db!, 'admins', u.uid)).catch(() => null))?.exists() ?? false : undefined)
    })
  }, [])

  if (!auth || !db) return <Shell><p>Firebase 설정이 필요합니다.</p></Shell>
  if (user === undefined || (user && admin === undefined)) return <Spinner />
  return (
    <Shell
      wide
      right={
        <Link to="/teacher" className="pixel-chip py-1 hover:bg-[#fff8d6]">
          ← 선생님 화면
        </Link>
      }
    >
      <h1 className="pixel-title mb-6 text-center font-pixel text-4xl">정답 검수</h1>
      {!user ? (
        <Login />
      ) : !admin ? (
        <div className="pixel-panel mx-auto max-w-lg space-y-3 p-6 font-pixel text-sm leading-relaxed">
          <p className="text-lg">🔑 관리자만 들어올 수 있어요</p>
          <p>문항과 정답은 모든 학급이 함께 쓰므로, 지정된 관리자만 고칠 수 있어요.</p>
          <p>
            프로젝트 폴더에서 아래 명령을 실행한 뒤 새로고침하세요.
            <br />
            <code className="mt-2 block rounded-lg border-2 border-ink bg-white p-2">
              npm run make:admin -- {user.email}
            </code>
          </p>
        </div>
      ) : (
        <ReviewDesk user={user} />
      )}
    </Shell>
  )
}

function ReviewDesk({ user }: { user: User }) {
  const [stage, setStage] = useState<Stage>('확장2')
  const [filter, setFilter] = useState<Filter>('todo')
  const [items, setItems] = useState<RItem[] | null>(null)
  const [names, setNames] = useState<Record<string, { headword: string; vol: number | null }>>({})
  const [queue, setQueue] = useState<string[]>([])
  const [pos, setPos] = useState(0)

  useEffect(() => {
    getDoc(doc(db!, 'meta', 'wordIndexL2')).then((s) => {
      const m: typeof names = {}
      for (const w of (s.data()?.words ?? []) as { id: string; headword: string; book_vol: number | null }[])
        m[w.id] = { headword: w.headword, vol: w.book_vol }
      setNames(m)
    })
  }, [])

  useEffect(() => {
    setItems(null)
    getDocs(query(collection(db!, 'items'), where('stage', '==', stage))).then((s) =>
      setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as RItem).sort((a, b) => a.id.localeCompare(b.id))),
    )
  }, [stage])

  // 대기열은 단계·필터를 바꿀 때만 다시 만든다 (저장할 때마다 목록이 움직이지 않게)
  useEffect(() => {
    if (!items) return
    setQueue(
      items
        .filter((it) => (filter === 'todo' ? !it.answer_ready : filter === 'unverified' ? !it.verified : true))
        .map((it) => it.id),
    )
    setPos(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items === null, stage, filter])

  const byId = useMemo(() => new Map((items ?? []).map((it) => [it.id, it])), [items])
  const ready = items?.filter((it) => it.answer_ready).length ?? 0
  const verified = items?.filter((it) => it.verified).length ?? 0
  const total = items?.length ?? 0
  const current = byId.get(queue[pos] ?? '')

  const onSaved = (it: RItem) => {
    setItems((xs) => xs!.map((x) => (x.id === it.id ? it : x)))
    setPos((p) => p + 1)
  }

  return (
    <div className="space-y-5">
      {/* 단계 · 진행 */}
      <section className="pixel-panel p-5">
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button key={s} onClick={() => setStage(s)} className={`pixel-btn px-4 py-2 font-pixel text-sm ${stage === s ? 'primary' : ''}`}>
              {s} {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 font-pixel text-sm sm:grid-cols-2">
          <Bar label="정답 입력" value={ready} max={total} color="bg-xp" />
          <Bar label="검수 완료" value={verified} max={total} color="bg-star" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 font-pixel text-sm">
          {(
            [
              ['todo', '정답 없는 문항'],
              ['unverified', '검수 안 한 문항'],
              ['all', '전체'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`pixel-btn px-3 py-1 text-xs ${filter === k ? 'sky' : ''}`}>
              {label}
            </button>
          ))}
          <span className="ml-auto text-ink-soft">
            {queue.length ? `${Math.min(pos + 1, queue.length)} / ${queue.length}` : ''}
          </span>
        </div>
      </section>

      {!items ? (
        <p className="pixel-title sm text-center font-pixel">문항 불러오는 중…</p>
      ) : current ? (
        <Editor
          key={current.id}
          item={current}
          headword={names[current.word_id]?.headword ?? current.word_id}
          vol={names[current.word_id]?.vol ?? null}
          user={user}
          onSaved={onSaved}
          onPrev={pos > 0 ? () => setPos(pos - 1) : undefined}
          onSkip={() => setPos(pos + 1)}
        />
      ) : (
        <div className="pixel-panel flex flex-col items-center gap-3 p-8 text-center font-pixel">
          <PixelCat color="cheese" size={5} className="bob" />
          <p className="text-xl">이 목록은 끝! 🎉</p>
          <p className="text-sm text-ink-soft">다른 단계나 ‘전체’를 골라 보세요.</p>
        </div>
      )}
    </div>
  )
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const p = max ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="text-ink-soft">
          {value} / {max} ({p}%)
        </span>
      </div>
      <div className="mt-1 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-white">
        <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

function Editor({
  item,
  headword,
  vol,
  user,
  onSaved,
  onPrev,
  onSkip,
}: {
  item: RItem
  headword: string
  vol: number | null
  user: User
  onSaved: (it: RItem) => void
  onPrev?: () => void
  onSkip: () => void
}) {
  const [draft, setDraft] = useState<RItem>(item) // 문구 교정본
  const [editing, setEditing] = useState(false)
  const { context, rows, options } = useMemo(() => blanksOf(draft), [draft])
  const [picks, setPicks] = useState<(number | null)[]>([])
  const [active, setActive] = useState(0)
  const [word, setWord] = useState<(Word & { source_page?: number }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 기존 정답 · 낱말 뜻(참고) 불러오기
  useEffect(() => {
    const n = blanksOf(item).rows.length
    setPicks(Array(n).fill(null))
    if (item.answer_ready)
      getDoc(doc(db!, 'answers', item.id)).then((s) => {
        const a = s.data()?.answer as number[] | undefined
        if (a) setPicks(Array.from({ length: n }, (_, i) => (a[i] ?? null)))
      })
    getDoc(doc(db!, 'words', item.word_id)).then((s) => setWord(s.exists() ? ({ id: s.id, ...s.data() } as never) : null))
  }, [item])

  // 문구를 고쳐 빈칸 수가 바뀌면 고른 답 길이 맞추기
  useEffect(() => {
    setPicks((p) => (p.length === rows.length ? p : Array.from({ length: rows.length }, (_, i) => p[i] ?? null)))
  }, [rows.length])

  const complete = picks.length > 0 && picks.every((x) => x !== null)

  const choose = useCallback(
    (opt: number) => {
      setPicks((p) => {
        const next = [...p]
        next[active] = opt
        const empty = next.findIndex((x, i) => x === null && i > active)
        setActive(empty >= 0 ? empty : Math.min(active + 1, next.length - 1))
        return next
      })
    },
    [active],
  )

  const save = useCallback(async () => {
    if (!complete || busy) return
    setBusy(true)
    setErr('')
    try {
      const b = writeBatch(db!)
      b.set(doc(db!, 'answers', item.id), { answer: picks, word_id: item.word_id })
      b.update(doc(db!, 'items', item.id), {
        prompt: draft.prompt,
        options: draft.options ?? null,
        answer_ready: true,
        verified: true,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.email,
      })
      await b.commit()
      onSaved({ ...draft, answer_ready: true, verified: true })
    } catch (e) {
      setErr(String(e))
      setBusy(false)
    }
  }, [complete, busy, item, picks, draft, user.email, onSaved])

  // 키보드: 1~9 보기 고르기 · Enter 저장 후 다음 · ←/→ 이전/건너뛰기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement).closest('input,textarea')) return
      const k = Number(e.key)
      if (k >= 1 && k <= options.length) choose(k - 1)
      else if (e.key === 'Enter') save()
      else if (e.key === 'ArrowRight') onSkip()
      else if (e.key === 'ArrowLeft') onPrev?.()
      else if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, rows.length - 1))
      else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, options.length, rows.length, choose, save, onSkip, onPrev])

  const flag = FLAGS[item.word_id]

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <section className="pixel-panel p-5">
        <div className="flex flex-wrap items-center gap-2 font-pixel">
          <span className="text-2xl">{headword}</span>
          <span className="pixel-chip text-xs">{item.id}</span>
          {item.verified ? (
            <span className="pixel-chip bg-ok-bg text-xs">✔ 검수 완료</span>
          ) : item.answer_ready ? (
            <span className="pixel-chip bg-[#fff4c2] text-xs">자동 정답 · 미검수</span>
          ) : (
            <span className="pixel-chip bg-bad-bg text-xs">정답 없음</span>
          )}
          <button onClick={() => setEditing((v) => !v)} className={`pixel-btn ml-auto px-3 py-1 text-xs ${editing ? 'primary' : ''}`}>
            ✏️ 문구 고치기
          </button>
        </div>
        {flag && <p className="mt-3 rounded-xl border-2 border-ink bg-[#fff4c2] p-2 font-pixel text-xs">⚠ {flag}</p>}

        {editing ? (
          <PromptEditor draft={draft} setDraft={setDraft} />
        ) : (
          <>
            {context && <p className="mt-4 rounded-xl border-2 border-ink bg-white p-3 leading-relaxed">{context}</p>}
            <ol className="mt-4 space-y-2">
              {rows.map((r, i) => (
                <li key={i}>
                  <button
                    onClick={() => setActive(i)}
                    className={`flex w-full items-center gap-3 rounded-xl border-[3px] p-2 text-left ${active === i ? 'border-ink bg-[#fff8d6] ring-4 ring-star' : 'border-ink/30 bg-white'}`}
                  >
                    <span className="min-w-0 flex-1">{r}</span>
                    <span className={`shrink-0 rounded-full border-2 px-3 py-0.5 font-pixel text-sm ${picks[i] != null ? 'border-ok bg-ok-bg text-ok' : 'border-dashed border-ink-soft text-ink-soft'}`}>
                      {picks[i] != null ? `${picks[i]! + 1}. ${options[picks[i]!]}` : '？'}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className={`mt-4 grid gap-2 ${item.type === 'match' ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {options.map((o, i) => (
                <button key={i} onClick={() => choose(i)} className="pixel-btn justify-start px-3 py-2 text-left font-pixel text-sm">
                  <span className="mr-2 text-ink-soft">{i + 1}</span>
                  {o}
                </button>
              ))}
            </div>
          </>
        )}

        {err && <p className="mt-3 font-pixel text-xs text-bad">{err}</p>}
        <div className="mt-5 flex gap-2">
          <button onClick={onPrev} disabled={!onPrev} className="pixel-btn px-4 py-3 font-pixel">
            ◀
          </button>
          <button onClick={save} disabled={!complete || busy} className="pixel-btn go flex-1 py-3 font-pixel text-lg">
            {busy ? '저장 중…' : '✔ 저장하고 다음'}
          </button>
          <button onClick={onSkip} className="pixel-btn px-4 py-3 font-pixel">
            건너뛰기 ▶
          </button>
        </div>
        <p className="mt-2 font-pixel text-xs text-ink-soft">
          키보드: 숫자 1~{options.length || 4} 보기 고르기 · ↑↓ 빈칸 이동 · Enter 저장하고 다음 · ← 이전 · → 건너뛰기
        </p>
      </section>

      {/* 참고: 낱말 뜻 · 교재 쪽수 */}
      <aside className="pixel-panel plain h-fit p-4 font-pixel text-sm">
        <p className="text-ink-soft">
          교재 {vol ?? '?'}권{word?.source_page ? ` · PDF ${word.source_page}쪽` : ''}
        </p>
        <p className="mt-1 text-xl">
          {headword}
          {word?.hanja && <span className="ml-1 text-sm text-ink-soft">{word.hanja}</span>}
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed">
          {word?.senses?.map((s, i) => <li key={i}>{s.definition}</li>)}
        </ol>
        {!!word?.related?.length && <p className="mt-2 text-xs text-ink-soft">관련어: {word.related.join(', ')}</p>}
      </aside>
    </div>
  )
}

/** 문구 교정: prompt 안의 문자열·문자열 배열 + 보기 */
function PromptEditor({ draft, setDraft }: { draft: RItem; setDraft: (d: RItem) => void }) {
  const p = draft.prompt as Record<string, unknown>
  const LABEL: Record<string, string> = {
    group: '낱말 묶음', left: '왼쪽 문장', right: '오른쪽 뜻(보기)', sentences: '문장', text: '글', blanks: '빈칸 원문 답(참고)',
  }
  const setField = (k: string, v: unknown) => setDraft({ ...draft, prompt: { ...p, [k]: v } })
  return (
    <div className="mt-4 space-y-4">
      <p className="font-pixel text-xs text-ink-soft">
        띄어쓰기·오타를 고쳐요. 빈칸은 <b>( )</b> 모양을 그대로 두세요. 보기 순서를 바꾸면 정답 번호도 다시 골라야 해요.
      </p>
      {Object.entries(p).map(([k, v]) =>
        typeof v === 'string' ? (
          <label key={k} className="block font-pixel text-xs">
            {LABEL[k] ?? k}
            <textarea className="pixel-input mt-1 text-base" rows={4} value={v} onChange={(e) => setField(k, e.target.value)} />
          </label>
        ) : Array.isArray(v) && v.every((x) => typeof x === 'string') ? (
          <div key={k} className="font-pixel text-xs">
            {LABEL[k] ?? k}
            {(v as string[]).map((s, i) => (
              <input
                key={i}
                className="pixel-input mt-1 py-1.5 text-base"
                value={s}
                onChange={(e) => setField(k, (v as string[]).map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          </div>
        ) : null,
      )}
      {draft.options && (
        <div className="font-pixel text-xs">
          보기
          {draft.options.map((o, i) => (
            <input
              key={i}
              className="pixel-input mt-1 py-1.5 text-base"
              value={o}
              onChange={(e) => setDraft({ ...draft, options: draft.options!.map((x, j) => (j === i ? e.target.value : x)) })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
