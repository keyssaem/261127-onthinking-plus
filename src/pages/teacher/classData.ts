import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { catOf, type CatName, type WordIndexEntry } from '../../lib/types'

/** 교사 대시보드용 실시간 데이터 (학급 하나) */

export type StudentRow = { id: string; number: number; nickname: string; cat: CatName }
export type ProgressRow = {
  studentId: string
  wordId: string
  correct: number
  wrong: number
  stage: string | null
  lastSeen: number // ms
}
export type AttemptRow = {
  id: string
  studentId: string
  wordId: string
  itemId: string
  stage: string
  tryNo: number
  isCorrect: boolean | null
  at: number // ms
}
export type SubmissionRow = {
  id: string
  studentId: string
  nickname: string
  wordId: string
  text: string
  status: '제출' | '확인' | '다시'
  feedback: string
  at: number
}

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : 0)

/** '익힘' 기준은 학생 화면(WordList)과 같다: 정답 3번 이상 */
export const isMastered = (p: ProgressRow) => p.correct >= 3

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function useStudents(classId: string) {
  const [rows, setRows] = useState<StudentRow[]>([])
  useEffect(
    () =>
      onSnapshot(collection(db!, 'classes', classId, 'students'), (snap) =>
        setRows(
          snap.docs
            .map((d) => ({
              id: d.id,
              number: d.data().number as number,
              nickname: d.data().nickname as string,
              cat: catOf(d.data().cat, d.data().number as number),
            }))
            .sort((a, b) => a.number - b.number),
        ),
      ),
    [classId],
  )
  return rows
}

export function useProgress(classId: string) {
  const [rows, setRows] = useState<ProgressRow[] | null>(null)
  useEffect(
    () =>
      onSnapshot(collection(db!, 'classes', classId, 'progress'), (snap) =>
        setRows(
          snap.docs.map((d) => {
            const p = d.data()
            return {
              studentId: p.studentId,
              wordId: p.wordId,
              correct: p.correct ?? 0,
              wrong: p.wrong ?? 0,
              stage: p.stage ?? null,
              lastSeen: ms(p.last_seen),
            }
          }),
        ),
      ),
    [classId],
  )
  return rows
}

/** 오늘 0시 이후 응답 (같은 필드 하나로만 거르고 정렬 → 복합 색인 불필요) */
export function useTodayAttempts(classId: string) {
  const [rows, setRows] = useState<AttemptRow[] | null>(null)
  useEffect(() => {
    const q = query(
      collection(db!, 'classes', classId, 'attempts'),
      where('createdAt', '>=', Timestamp.fromDate(startOfToday())),
      orderBy('createdAt', 'desc'),
      limit(3000),
    )
    return onSnapshot(q, (snap) =>
      setRows(
        snap.docs.map((d) => {
          const a = d.data()
          return {
            id: d.id,
            studentId: a.studentId,
            wordId: a.wordId,
            itemId: a.itemId,
            stage: a.stage,
            tryNo: a.tryNo,
            isCorrect: a.isCorrect ?? null,
            at: ms(a.createdAt),
          }
        }),
      ),
    )
  }, [classId])
  return rows
}

export function useSubmissions(classId: string) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null)
  useEffect(() => {
    const q = query(collection(db!, 'classes', classId, 'submissions'), orderBy('createdAt', 'desc'), limit(300))
    return onSnapshot(q, (snap) =>
      setRows(
        snap.docs.map((d) => {
          const s = d.data()
          return {
            id: d.id,
            studentId: s.studentId,
            nickname: s.nickname ?? '',
            wordId: s.wordId,
            text: s.text ?? '',
            status: s.status ?? '제출',
            feedback: s.feedback ?? '',
            at: ms(s.createdAt),
          }
        }),
      ),
    )
  }, [classId])
  return rows
}

/** 낱말 id → 표제어 (meta 문서 1회 읽기) */
export function useWordNames() {
  const [map, setMap] = useState<Record<string, string>>({})
  useEffect(() => {
    getDoc(doc(db!, 'meta', 'wordIndexL2')).then((snap) => {
      const m: Record<string, string> = {}
      for (const w of (snap.data()?.words as WordIndexEntry[]) ?? []) m[w.id] = w.headword
      setMap(m)
    })
  }, [])
  return map
}

/** 30초마다 갱신되는 현재 시각 (‘지금 공부 중’, ‘n분 전’ 표시용) */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function ago(t: number, now: number) {
  if (!t) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null)

/** 학생별 요약 */
export type StudentSummary = StudentRow & {
  touched: number
  mastered: number
  correct: number
  wrong: number
  todayCount: number
  todayFirst: number // 오늘 첫 시도 수 (채점 문항)
  todayFirstOk: number
  lastAt: number
}

export function useSummaries(
  students: StudentRow[],
  progress: ProgressRow[] | null,
  today: AttemptRow[] | null,
): StudentSummary[] {
  return useMemo(() => {
    const by = new Map<string, StudentSummary>()
    for (const s of students)
      by.set(s.id, {
        ...s, touched: 0, mastered: 0, correct: 0, wrong: 0, todayCount: 0, todayFirst: 0, todayFirstOk: 0, lastAt: 0,
      })
    for (const p of progress ?? []) {
      const s = by.get(p.studentId)
      if (!s) continue
      s.touched++
      if (isMastered(p)) s.mastered++
      s.correct += p.correct
      s.wrong += p.wrong
      s.lastAt = Math.max(s.lastAt, p.lastSeen)
    }
    for (const a of today ?? []) {
      const s = by.get(a.studentId)
      if (!s) continue
      s.todayCount++
      s.lastAt = Math.max(s.lastAt, a.at)
      if (a.tryNo === 1 && a.isCorrect !== null) {
        s.todayFirst++
        if (a.isCorrect) s.todayFirstOk++
      }
    }
    return [...by.values()]
  }, [students, progress, today])
}
