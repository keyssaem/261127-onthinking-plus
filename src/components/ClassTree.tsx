import { useMemo } from 'react'
import { STAGE_NAME, treeStage } from '../lib/tree'

/** 픽셀 나무 (단계별로 줄기·잎이 자라고, 목표를 넘기면 열매가 늘어남) */
export function PixelTree({ count, goal, size = 6 }: { count: number; goal: number; size?: number }) {
  const stage = treeStage(count, goal)
  const W = 24
  const H = 24
  const cells = useMemo(() => {
    const px: { x: number; y: number; c: string }[] = []
    const put = (x: number, y: number, c: string) => x >= 0 && x < W && y >= 0 && y < H && px.push({ x, y, c })
    const ground = H - 2
    for (let x = 0; x < W; x++) {
      put(x, ground, '#6cbf3f')
      put(x, ground + 1, '#8a5a2b')
    }
    if (stage === 0) {
      put(11, ground - 1, '#8a5a2b')
      put(12, ground - 1, '#8a5a2b')
      return px
    }
    const trunk = [0, 2, 4, 6, 8, 9][stage]
    const tw = stage >= 4 ? 2 : 1
    for (let y = 1; y <= trunk; y++) for (let x = 0; x < tw; x++) put(12 - Math.floor(tw / 2) + x, ground - y, '#8a5a2b')
    const top = ground - trunk
    if (stage === 1) {
      put(11, top - 1, '#5fd35a')
      put(13, top - 1, '#5fd35a')
      put(12, top - 1, '#3d9a3a')
      return px
    }
    const r = [0, 0, 3, 5, 7, 8][stage]
    const cy = top - Math.floor(r * 0.6)
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = (x * x) / (r * r) + (y * y) / (r * 0.8 * (r * 0.8))
        if (d <= 1) put(12 + x, cy + y, d > 0.75 ? '#3d9a3a' : (x + y) % 3 === 0 ? '#7be276' : '#5fd35a')
      }
    if (stage === 5) {
      // 목표를 넘긴 만큼 열매 (최대 12개)
      const fruits = Math.min(12, 3 + Math.floor(((count - goal) / goal) * 10))
      const spots = [[-4, -2], [3, -4], [5, 1], [-2, 2], [0, -6], [-6, 1], [6, -3], [2, 4], [-4, -5], [4, 3], [-1, -3], [1, 0]]
      for (const [x, y] of spots.slice(0, fruits)) {
        put(12 + x, cy + y, '#e8323c')
        put(13 + x, cy + y, '#ff6b6b')
      }
    }
    return px
  }, [stage, count, goal])

  return (
    <svg width={W * size} height={H * size} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-label={`학급 나무: ${STAGE_NAME[stage]}`}>
      {cells.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
      ))}
    </svg>
  )
}

/** 나무 카드 (학생 목록 화면 · 교사 현황판) */
export default function ClassTree({
  count,
  goal,
  size = 5,
  children,
}: {
  count: number | null
  goal: number
  size?: number
  children?: React.ReactNode
}) {
  const c = count ?? 0
  const stage = treeStage(c, goal)
  const pct = Math.min(100, Math.round((c / goal) * 100))
  return (
    <section className="pixel-panel plain flex items-center gap-4 p-4">
      <PixelTree count={c} goal={goal} size={size} />
      <div className="min-w-0 flex-1 font-pixel">
        <p className="text-lg">🌳 우리 반 나무 · {STAGE_NAME[stage]}</p>
        <p className="mt-1 text-sm text-ink-soft">
          이번 주 반 전체 정답 <b className="text-ink">{c}</b> / 목표 {goal}
        </p>
        <div className="mt-2 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-white">
          <div className="h-full bg-xp" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          {stage === 5 ? '목표 달성! 더 맞히면 열매가 늘어나요 🍎' : '혼자 공부와 단체 게임에서 맞힐 때마다 자라요'}
        </p>
        {children}
      </div>
    </section>
  )
}
