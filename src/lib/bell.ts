import { useEffect, useState } from 'react'
import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 권별 골든벨 (학급 단체 게임)
 *  classes/{c}.liveGame = 진행 중인 게임 id
 *  classes/{c}/games/{g}           : 교사가 진행 (status·문제 번호·시작 시각·공개 결과)
 *  classes/{c}/games/{g}/players/{번호} : 학생이 참가 (alive·score 는 교사 화면이 갱신)
 *  classes/{c}/games/{g}/answers/{번호}__{문제} : 학생 답 (한 번, 제한 시간 안, 채점은 교사 화면)
 */

export type BellStatus = 'lobby' | 'question' | 'reveal' | 'ended'
export type BellReveal = { answer: number; counts: number[]; out: number; saved: boolean }
export type BellGame = {
  id: string
  vol: number
  status: BellStatus
  qIndex: number
  questions: string[]
  limitSec: number
  startedAt: number // ms
  reveal: BellReveal | null
}
export type BellPlayer = { id: string; number: number; nickname: string; alive: boolean; score: number }
export type BellItem = { id: string; word_id: string; prompt: { definition: string; example: string }; options: string[] }

export const OPTION_STYLE = [
  { bg: 'bg-coral', label: '1' },
  { bg: 'bg-sky', label: '2' },
  { bg: 'bg-xp', label: '3' },
  { bg: 'bg-star', label: '4' },
]

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : 0)

export function useGame(classId: string, gameId: string | null) {
  const [game, setGame] = useState<BellGame | null | undefined>(undefined)
  useEffect(() => {
    if (!gameId) return setGame(null)
    return onSnapshot(doc(db!, 'classes', classId, 'games', gameId), (s) => {
      // 방금 쓴 serverTimestamp 도 바로 쓰도록 추정값 사용
      const g = s.data({ serverTimestamps: 'estimate' })
      setGame(
        g
          ? {
              id: s.id,
              vol: g.vol,
              status: g.status,
              qIndex: g.qIndex ?? -1,
              questions: g.questions ?? [],
              limitSec: g.limitSec ?? 20,
              startedAt: ms(g.startedAt),
              reveal: g.reveal ?? null,
            }
          : null,
      )
    })
  }, [classId, gameId])
  return game
}

/** 학급의 진행 중 게임 id (없으면 null, 불러오는 중 undefined) */
export function useLiveGameId(classId: string | null) {
  const [id, setId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!classId) return setId(null)
    return onSnapshot(
      doc(db!, 'classes', classId),
      (s) => setId((s.data()?.liveGame as string) ?? null),
      () => setId(null),
    )
  }, [classId])
  return id
}

const itemCache = new Map<string, BellItem>()
export function useBellItem(itemId: string | undefined) {
  const [item, setItem] = useState<BellItem | null>(null)
  useEffect(() => {
    if (!itemId) return setItem(null)
    const hit = itemCache.get(itemId)
    if (hit) return setItem(hit)
    setItem(null)
    getDoc(doc(db!, 'items', itemId)).then((s) => {
      if (!s.exists()) return
      const it = { id: s.id, ...s.data() } as BellItem
      itemCache.set(itemId, it)
      setItem(it)
    })
  }, [itemId])
  return item
}

/** 남은 초 (0.25초마다 갱신) */
export function useCountdown(startedAt: number, limitSec: number, running: boolean) {
  const calc = () => Math.max(0, limitSec - (Date.now() - startedAt) / 1000)
  const [left, setLeft] = useState(calc)
  useEffect(() => {
    setLeft(calc())
    if (!running) return
    const t = setInterval(() => setLeft(calc()), 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, limitSec, running])
  return left
}
