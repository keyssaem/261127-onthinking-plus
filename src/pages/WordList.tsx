import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query as fsQuery, where } from 'firebase/firestore'
import Shell, { PlayerBadge, Spinner } from '../components/Shell'
import { Heart, Mascot, PixelCat, Star, XpBar } from '../components/pixel'
import { auth, db } from '../lib/firebase'
import { studentBase } from '../lib/learning'
import { leaveStudent, useStudent } from '../lib/student'
import { useLiveGameId } from '../lib/bell'
import { useTree } from '../lib/tree'
import ClassTree from '../components/ClassTree'
import type { WordIndexEntry, WordProgress } from '../lib/types'

type Filter = 'all' | 'todo' | 'doing' | 'done'

function statusOf(p?: WordProgress): Exclude<Filter, 'all'> {
  if (!p) return 'todo'
  return p.correct >= 3 ? 'done' : 'doing'
}

const CARD_BG = {
  todo: 'bg-white',
  doing: 'bg-[#fff4c2]',
  done: 'bg-ok-bg',
}

export default function WordList() {
  const { student, loading } = useStudent()
  const [words, setWords] = useState<WordIndexEntry[] | null>(null)
  const [progress, setProgress] = useState<Record<string, WordProgress>>({})
  const [vol, setVol] = useState(1)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!db || !student) return
    getDoc(doc(db, 'meta', 'wordIndexL2')).then((snap) =>
      setWords(((snap.data()?.words as WordIndexEntry[]) ?? []).sort((a, b) => a.seq - b.seq)),
    )
    getDocs(
      fsQuery(collection(db, ...studentBase(student), 'progress'), where('studentId', '==', student.id)),
    ).then((snap) => {
      const map: Record<string, WordProgress> = {}
      snap.forEach((d) => {
        const p = d.data()
        map[p.wordId] = {
          word_id: p.wordId,
          known_flag: p.known_flag ?? null,
          correct: p.correct ?? 0,
          wrong: p.wrong ?? 0,
          last_seen: null,
        }
      })
      setProgress(map)
    })
  }, [student])

  const shown = useMemo(() => {
    if (!words) return []
    const q = query.trim()
    return words.filter(
      (w) =>
        (q ? w.headword.includes(q) : w.book_vol === vol) &&
        (filter === 'all' || statusOf(progress[w.id]) === filter),
    )
  }, [words, vol, filter, query, progress])

  if (loading) return <Spinner />
  if (!student) return <Navigate to="/join" replace />

  const total = words?.length ?? 293
  const done = Object.values(progress).filter((p) => statusOf(p) === 'done').length
  const touched = Object.keys(progress).length
  const cat = student.cat

  return (
    <Shell
      wide
      right={
        <PlayerBadge
          onClick={async () => {
            await leaveStudent()

          }}
        >
          {student.guest ? '🐾 혼자 연습 중' : `${student.number}번 ${student.nickname}`} · 나가기
        </PlayerBadge>
      }
    >
      {/* 플레이어 상태판 */}
      <section className="pixel-panel flex flex-wrap items-center gap-5 p-5">
        <PixelCat color={cat} size={4} className="bob" />
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-xl">{student.guest ? '혼자 연습 모험' : `${student.nickname}의 모험`}</div>
          <div className="mt-2 flex items-center gap-3 font-pixel text-sm">
            <span className="flex items-center gap-1">
              <Heart size={2} /> 공부 {touched}
            </span>
            <span className="flex items-center gap-1">
              <Star size={2} /> 익힘 {done}
            </span>
            <span className="text-ink-soft">/ {total}</span>
          </div>
          <XpBar value={done} max={total} className="mt-3 max-w-md" />
        </div>
      </section>

      {!student.guest && student.class_id && <BellBanner classId={student.class_id} />}
      {!student.guest && student.class_id && <StudentTree classId={student.class_id} />}
      {!student.guest && student.class_id && <TeacherReplies classId={student.class_id} words={words} />}

      {/* 권 · 필터 · 검색 */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {[1, 2, 3].map((v) => (
          <button
            key={v}
            onClick={() => {
              setVol(v)
              setQuery('')
            }}
            className={`pixel-btn px-5 py-2 font-pixel ${vol === v && !query ? 'primary' : ''}`}
          >
            {v}권
          </button>
        ))}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="pixel-btn px-4 py-2 font-pixel text-sm"
        >
          <option value="all">전체</option>
          <option value="todo">아직 안 한 낱말</option>
          <option value="doing">공부 중</option>
          <option value="done">익힌 낱말</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 낱말 찾기"
          className="pixel-input min-w-0 flex-1 rounded-full py-2 font-pixel text-sm"
        />
      </div>

      {!words ? (
        <p className="pixel-title sm mt-10 text-center font-pixel">낱말 불러오는 중…</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((w) => {
            const st = statusOf(progress[w.id])
            return (
              <li key={w.id}>
                <Link
                  to={`/learn/${w.id}`}
                  className={`pixel-panel plain block p-4 transition-transform hover:-translate-y-1 ${CARD_BG[st]}`}
                >
                  <div className="flex items-center justify-between font-pixel text-xs text-ink-soft">
                    <span>No.{w.seq}</span>
                    {st === 'done' ? <Star size={2} /> : st === 'doing' ? <Heart size={2} /> : null}
                  </div>
                  <div className="mt-1 font-pixel text-2xl">{w.headword}</div>
                  <div className="text-sm text-ink-soft">{w.hanja}</div>
                </Link>
              </li>
            )
          })}
          {!shown.length && (
            <li className="col-span-full">
              <p className="pixel-panel plain p-6 text-center font-pixel">해당하는 낱말이 없어요.</p>
            </li>
          )}
        </ul>
      )}
    </Shell>
  )
}

type Reply = { id: string; wordId: string; text: string; status: string; feedback: string; at: number }

/** 선생님이 확인한 한 문장 (최근 3개) */
function TeacherReplies({ classId, words }: { classId: string; words: WordIndexEntry[] | null }) {
  const [replies, setReplies] = useState<Reply[]>([])
  useEffect(() => {
    const uid = auth?.currentUser?.uid
    if (!db || !uid) return
    getDocs(fsQuery(collection(db, 'classes', classId, 'submissions'), where('uid', '==', uid)))
      .then((snap) =>
        setReplies(
          snap.docs
            .map((d) => {
              const s = d.data()
              return {
                id: d.id,
                wordId: s.wordId,
                text: s.text ?? '',
                status: s.status ?? '제출',
                feedback: s.feedback ?? '',
                at: s.reviewedAt?.toMillis?.() ?? 0,
              }
            })
            .filter((r) => r.status !== '제출')
            .sort((a, b) => b.at - a.at)
            .slice(0, 3),
        ),
      )
      .catch(() => setReplies([]))
  }, [classId])

  if (!replies.length) return null
  const name = (id: string) => words?.find((w) => w.id === id)?.headword ?? ''
  return (
    <section className="mt-6 space-y-3">
      {replies.map((r) => (
        <Mascot key={r.id} color="cream" size={3}>
          <span className="text-xs text-ink-soft">선생님 답장 · ‘{name(r.wordId)}’</span>
          <br />“{r.text}”
          <br />
          <b className={r.status === '확인' ? 'text-ok' : 'text-coral'}>
            {r.status === '확인' ? '👍 잘했어요!' : '✏️ 다시 써 볼까?'}
          </b>
          {r.feedback && <> {r.feedback}</>}
          {r.status === '다시' && (
            <>
              {' '}
              <Link to={`/learn/${r.wordId}?stage=활용`} className="underline">
                다시 쓰러 가기 ▶
              </Link>
            </>
          )}
        </Mascot>
      ))}
    </section>
  )
}

/** 선생님이 단체 게임을 열면 나타나는 참가 버튼 */
function BellBanner({ classId }: { classId: string }) {
  const live = useLiveGameId(classId)
  if (!live) return null
  return (
    <Link
      to="/bell"
      className="pixel-btn go bob mt-6 flex w-full items-center justify-center gap-3 py-5 font-pixel text-2xl sm:text-3xl"
    >
      🎮 단체 게임이 열렸어요! 참가하기 ▶
    </Link>
  )
}

function StudentTree({ classId }: { classId: string }) {
  const { count, goal } = useTree(classId)
  if (count === null) return null
  return (
    <div className="mt-6">
      <ClassTree count={count} goal={goal} size={4} />
    </div>
  )
}
