import { useEffect, useState } from 'react'
import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 학급 단체 게임 (골든벨 · 문장 골든벨 · 낱말 줄다리기 · 초성 스피드)
 *  classes/{c}.liveGame = 진행 중인 게임 id
 *  classes/{c}/games/{g}                 : 교사가 진행 (mode·status·문제 번호·시작 시각·공개 결과·줄 위치)
 *  classes/{c}/games/{g}/players/{번호}   : 학생이 참가 (alive·score·team 은 교사 화면이 갱신)
 *  classes/{c}/games/{g}/answers/{번호}__{문제} : 학생 답 한 번 (보기 번호 또는 글자), 채점은 교사 화면
 *
 * 문제 키: 'L2-044-골든벨' (뜻 → 낱말 4지선다) / 'L2-044-적용1#1' (장면 문장의 2번째 빈칸, 3지선다)
 */

export type GameMode = 'bell' | 'sentence' | 'tug' | 'chosung'
export type BellStatus = 'lobby' | 'question' | 'reveal' | 'ended'
export type BellReveal = {
  answer: number | null // 보기 번호 (초성 스피드는 null)
  answerText: string
  counts: number[]
  out: number
  saved: boolean
  /** 줄다리기: 이번 문제 팀별 정답 수 */
  teamRight?: [number, number]
  /** 초성 스피드: 이번 문제 맞힌 친구 수 · 가장 빠른 친구 */
  fastest?: string | null
}
export type BellGame = {
  id: string
  mode: GameMode
  vol: number
  status: BellStatus
  qIndex: number
  questions: string[]
  limitSec: number
  startedAt: number // ms
  reveal: BellReveal | null
  hint: string // 초성 스피드 초성
  rope: number // 줄다리기: -100(노랑) ~ +100(파랑)
  teamScore: [number, number]
  winner: number | null // 줄다리기 이긴 팀
}
export type BellPlayer = { id: string; number: number; nickname: string; cat?: string; alive: boolean; score: number; team?: 0 | 1 }

export const MODES: Record<GameMode, { emoji: string; name: string; desc: string; rules: string[] }> = {
  bell: {
    emoji: '🔔',
    name: '골든벨',
    desc: '뜻을 보고 알맞은 낱말 고르기 · 틀리면 탈락',
    rules: ['틀리면 탈락하지만 응원단으로 계속 풀 수 있어요.', '남은 친구가 모두 틀리면 아무도 탈락하지 않아요.', '언제든 🔁 패자부활로 모두 살릴 수 있어요.'],
  },
  sentence: {
    emoji: '📜',
    name: '문장 골든벨',
    desc: '장면 문장의 빈칸에 알맞은 낱말 고르기 · 틀리면 탈락',
    rules: ['교재 ‘장면에 맞는 말’ 문장으로 내요. 검수 완료 문항을 먼저 써요.', '탈락·패자부활 규칙은 골든벨과 같아요.'],
  },
  tug: {
    emoji: '🪢',
    name: '낱말 줄다리기',
    desc: '두 팀으로 나눠 맞힐 때마다 줄을 우리 팀 쪽으로',
    rules: ['그동안의 정답률로 두 팀을 고르게 나눠요.', '팀원 중 맞힌 비율만큼 줄이 당겨져요 (인원이 달라도 공평).', '줄이 끝까지 오거나 문제가 끝나면 승부가 나요. 탈락은 없어요.'],
  },
  chosung: {
    emoji: '⚡',
    name: '초성 스피드',
    desc: '초성과 뜻 힌트를 보고 낱말을 직접 입력',
    rules: ['예: ㄱㄴ + 뜻 → ‘가능’ 을 직접 써요.', '맞히면 50점 + 빨리 낼수록 최대 50점 더.', '탈락은 없어요. 띄어쓰기는 상관없어요.'],
  },
}

export const TEAM = [
  { name: '노랑팀', bg: 'bg-star', text: 'text-[#b8860b]', emoji: '🟨' },
  { name: '파랑팀', bg: 'bg-sky', text: 'text-sky-deep', emoji: '🟦' },
] as const

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
              mode: g.mode ?? 'bell',
              vol: g.vol,
              status: g.status,
              qIndex: g.qIndex ?? -1,
              questions: g.questions ?? [],
              limitSec: g.limitSec ?? 20,
              startedAt: ms(g.startedAt),
              reveal: g.reveal ?? null,
              hint: g.hint ?? '',
              rope: g.rope ?? 0,
              teamScore: g.teamScore ?? [0, 0],
              winner: g.winner ?? null,
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

/* ---------------- 문제 ---------------- */
export function parseKey(key: string) {
  const [itemId, b] = key.split('#')
  return { itemId, blank: b === undefined ? null : Number(b) }
}

type RawItem = { id: string; word_id: string; prompt: Record<string, unknown>; options: string[] }
const itemCache = new Map<string, RawItem>()
async function loadItem(itemId: string) {
  const hit = itemCache.get(itemId)
  if (hit) return hit
  const s = await getDoc(doc(db!, 'items', itemId))
  if (!s.exists()) return null
  const it = { id: s.id, ...s.data() } as RawItem
  itemCache.set(itemId, it)
  return it
}

export type Question = {
  key: string
  wordId: string
  /** 골든벨·줄다리기·초성: 뜻 + 빈칸 예문 */
  definition?: string
  example?: string
  /** 문장 골든벨: 빈칸이 ★ 인 문장 */
  sentence?: string
  options: string[]
}

const BLANK = /\(\s*\)/g
function sentenceWithBlank(sentences: string[], k: number) {
  let n = 0
  for (const s of sentences) {
    const count = (s.match(BLANK) ?? []).length
    if (k < n + count) {
      let i = 0
      return s.replace(BLANK, () => (n + i++ === k ? '( ★ )' : '(   )'))
    }
    n += count
  }
  return sentences.join(' ')
}

export function useQuestion(key: string | undefined) {
  const [q, setQ] = useState<Question | null>(null)
  useEffect(() => {
    setQ(null)
    if (!key) return
    let alive = true
    const { itemId, blank } = parseKey(key)
    loadItem(itemId).then((it) => {
      if (!alive || !it) return
      const p = it.prompt
      setQ(
        blank === null
          ? { key, wordId: it.word_id, definition: p.definition as string, example: p.example as string, options: it.options }
          : { key, wordId: it.word_id, sentence: sentenceWithBlank(p.sentences as string[], blank), options: it.options },
      )
    })
    return () => {
      alive = false
    }
  }, [key])
  return q
}

/** 교사 화면 전용: 정답 (보기 번호 + 낱말) */
export async function correctFor(key: string): Promise<{ index: number; text: string } | null> {
  const { itemId, blank } = parseKey(key)
  const [it, ans] = await Promise.all([loadItem(itemId), getDoc(doc(db!, 'answers', itemId))])
  const a = ans.data()?.answer as number[] | undefined
  if (!it || !a) return null
  const index = a[blank ?? 0]
  return { index, text: it.options[index] }
}

/* ---------------- 초성 ---------------- */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
export function chosung(word: string) {
  return [...word]
    .map((ch) => {
      const c = ch.charCodeAt(0) - 0xac00
      return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch
    })
    .join('')
}
export const normalizeWord = (s: string) => s.replace(/\s+/g, '').trim()

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
