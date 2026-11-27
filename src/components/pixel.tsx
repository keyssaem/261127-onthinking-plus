import type { CSSProperties, ReactNode } from 'react'

/* =====================================================================
   픽셀 아트 부품 (모두 코드로 그린 자체 도안)
   Sprite: 문자열 격자 + 팔레트 → SVG 사각형 (crispEdges 로 또렷하게)
   ===================================================================== */

type Palette = Record<string, string>

export function Sprite({
  rows,
  palette,
  size = 4,
  className,
  style,
  title,
}: {
  rows: string[]
  palette: Palette
  size?: number
  className?: string
  style?: CSSProperties
  title?: string
}) {
  const w = rows[0].length
  const h = rows.length
  const rects: ReactNode[] = []
  rows.forEach((row, y) => {
    // 같은 색이 이어지면 하나의 사각형으로 합쳐 SVG 요소 수를 줄임
    let x = 0
    while (x < w) {
      const ch = row[x]
      const fill = palette[ch]
      if (!fill) {
        x++
        continue
      }
      let run = 1
      while (x + run < w && row[x + run] === ch) run++
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={fill} />)
      x += run
    }
  })
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * size}
      height={h * size}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  )
}

/* ---------------- 고양이 ---------------- */
const CAT = [
  '..k.........k...',
  '.kbk.......kbk..',
  '.kpbkkkkkkkbpk..',
  '.kbbbbbbbbbbbk..',
  'kbbbbbbbbbbbbbk.',
  'kbbekbbbbbekbbk.',
  'kbbkkbbbbbkkbbk.',
  'kbbbbbbpbbbbbbk.',
  'kbbbbbkbkbbbbbk.',
  '.kbbbbbbbbbbbk..',
  '..kbbbbbbbbbk...',
  '.kbbbbbbbbbbbk..',
  '.kbbbbbbbbbbbk.k',
  '.kbbbbbbbbbbbkbk',
  '.kbwwbbbbbwwbbk.',
  '..kkkkkkkkkkkk..',
]

export const CAT_COLORS = {
  black: { name: '까망', k: '#14141f', b: '#3b3b4f', e: '#f2c14e', p: '#f4a7b9', w: '#5a5a70' },
  cheese: { name: '치즈', k: '#5a2d0c', b: '#f39a3b', e: '#2b2b2b', p: '#ff7b8a', w: '#fff3e0' },
  gray: { name: '회색', k: '#2f3540', b: '#a3adb8', e: '#3fa34d', p: '#f4a7b9', w: '#f2f4f6' },
  cream: { name: '크림', k: '#5c4630', b: '#f3e2c4', e: '#3a7bd5', p: '#ff9aa8', w: '#ffffff' },
} as const
export type CatColor = keyof typeof CAT_COLORS
const CAT_ORDER: CatColor[] = ['cheese', 'gray', 'cream', 'black']

/** 학생 번호 → 고양이 색 (같은 번호는 항상 같은 고양이) */
export const catForNumber = (n: number): CatColor => CAT_ORDER[Math.abs(n) % CAT_ORDER.length]

export function PixelCat({
  color = 'black',
  size = 5,
  className,
  flip,
}: {
  color?: CatColor
  size?: number
  className?: string
  flip?: boolean
}) {
  const c = CAT_COLORS[color]
  return (
    <Sprite
      rows={CAT}
      palette={{ k: c.k, b: c.b, e: c.e, p: c.p, w: c.w }}
      size={size}
      className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      title={`${c.name} 고양이`}
    />
  )
}

/* ---------------- 하트 · 별 ---------------- */
const HEART = [
  '.kk...kk.',
  'krrk.krrk',
  'krwrkrrrk',
  'krrrrrrrk',
  '.krrrrrk.',
  '..krrrk..',
  '...krk...',
  '....k....',
]
export function Heart({ empty, size = 3 }: { empty?: boolean; size?: number }) {
  return (
    <Sprite
      rows={HEART}
      size={size}
      palette={{ k: '#1b1b2b', r: empty ? '#c6ced8' : '#e8323c', w: empty ? '#e3e8ee' : '#ffb3b8' }}
    />
  )
}
export function Hearts({ total, left, size = 3 }: { total: number; left: number; size?: number }) {
  return (
    <div className="flex gap-1" aria-label={`기회 ${left}/${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <Heart key={i} empty={i >= left} size={size} />
      ))}
    </div>
  )
}

const STAR = [
  '....k....',
  '...kyk...',
  '...kyk...',
  'kkkyyykkk',
  'kyyyyyyyk',
  '.kyyyyyk.',
  '.kyykyyk.',
  'kyyk.kyyk',
  'kkk...kkk',
]
export function Star({ size = 3, dim }: { size?: number; dim?: boolean }) {
  return <Sprite rows={STAR} size={size} palette={{ k: '#1b1b2b', y: dim ? '#d5dbe2' : '#ffc928' }} />
}

/** 초록 게이지 + 끝의 별 (진행률) */
export function XpBar({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={`flex items-center ${className}`} aria-label={`진행 ${value}/${max}`}>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full border-[3px] border-ink bg-white">
        <div
          className="h-full rounded-full bg-xp transition-[width] duration-300"
          style={{ width: `${pct}%`, boxShadow: 'inset 0 -4px 0 rgba(0,0,0,.15), inset 0 3px 0 rgba(255,255,255,.45)' }}
        />
      </div>
      <div className="-ml-3">
        <Star size={3} dim={pct < 100} />
      </div>
    </div>
  )
}

/* ---------------- 배경: 구름 · 언덕 ---------------- */
const CLOUD = [
  '......wwww..........',
  '....wwwwwwww..www...',
  '..wwwwwwwwwwwwwwwww.',
  '.wwwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwww',
  'wwwwwwwwwwwwwwwwwwww',
  '.ssssssssssssssssss.',
]
export function Cloud({ size = 6, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return <Sprite rows={CLOUD} size={size} palette={{ w: '#ffffff', s: '#cfeafa' }} className={className} style={style} />
}

/** 계단형 언덕 (하단 고정) */
function Hills() {
  // 두 겹의 계단형 능선
  const back = 'M0 60 H40 V52 H90 V44 H150 V40 H210 V46 H260 V54 H320 V48 H380 V42 H430 V50 H480 V58 H520 V52 H560 V46 H600 V120 H0 Z'
  const front = 'M0 80 H60 V72 H120 V66 H190 V70 H240 V78 H300 V74 H350 V68 H420 V72 H470 V80 H530 V74 H600 V120 H0 Z'
  return (
    <svg
      viewBox="0 0 600 120"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="pointer-events-none fixed inset-x-0 bottom-0 h-[22vh] w-full"
      aria-hidden
    >
      <path d={back} fill="#8fd157" />
      <path d={back} fill="none" stroke="#5aa832" strokeWidth="3" />
      <path d={front} fill="#6cbf3f" />
      <path d={front} fill="none" stroke="#4f9a2c" strokeWidth="3" />
      {/* 풀 점 */}
      {[30, 95, 160, 230, 290, 360, 440, 505, 570].map((x, i) => (
        <rect key={x} x={x} y={90 + (i % 3) * 8} width="6" height="4" fill="#4f9a2c" />
      ))}
    </svg>
  )
}

/** 화면 전체 배경 */
export function SkyBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-b from-sky-deep to-sky" />
      <Cloud className="absolute left-[4%] top-[12%]" size={7} />
      <Cloud className="absolute right-[6%] top-[22%]" size={5} />
      <Cloud className="absolute left-[38%] top-[48%] opacity-80" size={4} />
      <Cloud
        className="absolute top-[6%] opacity-90"
        size={4}
        style={{ animation: 'drift 90s linear infinite' }}
      />
      <Hills />
    </div>
  )
}

/* ---------------- 말풍선 ---------------- */
export function SpeechBubble({
  children,
  side = 'left',
  className = '',
}: {
  children: ReactNode
  side?: 'left' | 'bottom'
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="pixel-panel plain px-4 py-3 font-pixel text-sm leading-relaxed">{children}</div>
      {side === 'left' ? (
        <Sprite
          rows={['..kk', '.kwk', 'kwwk', '.kkk']}
          palette={{ k: '#1b1b2b', w: '#fff' }}
          size={4}
          className="absolute -left-3 bottom-4"
        />
      ) : (
        <Sprite
          rows={['kwwwk', '.kwk.', '..k..']}
          palette={{ k: '#1b1b2b', w: '#fff' }}
          size={4}
          className="absolute -bottom-3 left-8"
        />
      )}
    </div>
  )
}

/** 고양이 + 말풍선 */
export function Mascot({
  children,
  color = 'black',
  size = 5,
  className = '',
}: {
  children: ReactNode
  color?: CatColor
  size?: number
  className?: string
}) {
  return (
    <div className={`flex items-end gap-4 ${className}`}>
      <PixelCat color={color} size={size} className="bob shrink-0" />
      <SpeechBubble className="mb-6 min-w-0 flex-1">{children}</SpeechBubble>
    </div>
  )
}
