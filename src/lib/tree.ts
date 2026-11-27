import { useEffect, useState } from 'react'
import { collection, doc, increment, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 학급 나무: 이번 주에 반 전체가 맞힌 문제 수만큼 자란다 (경쟁 없이 다 같이)
 *  classes/{c}/tree/{주}__{번호}  : 학생이 정답마다 +1 (한 문서에 몰리지 않게 학생별로 나눔)
 *  classes/{c}/tree/{주}__games   : 단체 게임 정답 수 (교사 화면이 더함)
 *  classes/{c}.treeGoal           : 주간 목표 (기본 200)
 */

export const DEFAULT_GOAL = 200

/** 이번 주 월요일 기준 키, 예: w20261123 */
export function weekKey(d = new Date()) {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return `w${m.getFullYear()}${String(m.getMonth() + 1).padStart(2, '0')}${String(m.getDate()).padStart(2, '0')}`
}

/** 정답 하나 → 나무 +1 (실패해도 학습에는 영향 없음) */
export function growTree(classId: string, sid: string, by = 1) {
  if (!db) return
  const week = weekKey()
  setDoc(doc(db, 'classes', classId, 'tree', `${week}__${sid}`), { sid, week, count: increment(by) }, { merge: true }).catch(
    () => {},
  )
}

export function useTree(classId: string | null) {
  const [count, setCount] = useState<number | null>(null)
  const [goal, setGoal] = useState(DEFAULT_GOAL)
  useEffect(() => {
    if (!classId || !db) return
    const week = weekKey()
    const off1 = onSnapshot(
      query(collection(db, 'classes', classId, 'tree'), where('week', '==', week)),
      (s) => setCount(s.docs.reduce((n, d) => n + ((d.data().count as number) ?? 0), 0)),
      () => setCount(0),
    )
    const off2 = onSnapshot(doc(db, 'classes', classId), (s) => setGoal((s.data()?.treeGoal as number) || DEFAULT_GOAL))
    return () => {
      off1()
      off2()
    }
  }, [classId])
  return { count, goal }
}

/** 0 씨앗 · 1 새싹 · 2 묘목 · 3 어린 나무 · 4 큰 나무 · 5 열매 나무 */
export function treeStage(count: number, goal: number) {
  const r = count / goal
  return r >= 1 ? 5 : r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : r >= 0.08 ? 1 : 0
}
export const STAGE_NAME = ['씨앗', '새싹', '묘목', '어린 나무', '큰 나무', '열매 나무']
