import { useCallback, useEffect, useRef, useState } from 'react'
import { Mascot } from './pixel'

/**
 * 한자 따라 쓰기 (Canvas 2D)
 *  - 흐린 본보기 글자 위를 손가락·마우스로 따라 쓴다 (田자 칸)
 *  - 채점: 작은 격자(N×N)에 본보기와 내 글씨를 각각 그려
 *      덮은 정도  = 본보기 획 중 내 글씨가 지나간 비율
 *      정확도     = 내 글씨 중 본보기 획 위에 있는 비율
 *    둘 다 기준을 넘으면 통과 (획순·획 수는 보지 않음)
 */

const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", sans-serif'
const N = 96 // 채점 격자
const PEN = 0.075 // 펜 굵기 (칸 크기 대비)
const PASS_COVER = 0.8 // 실측: 본보기를 따라 쓰면 0.98 이상, 낙서 15줄도 0.83 이하
const PASS_PRECISION = 0.58 // 실측: 삐뚤게 따라 써도 0.63 이상, 낙서는 0.53 이하

type Pt = [number, number] // 0~1 정규화 좌표
type Stroke = Pt[]

function drawGlyph(ctx: CanvasRenderingContext2D, ch: string, size: number, color: string) {
  ctx.fillStyle = color
  ctx.font = `500 ${Math.round(size * 0.78)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ch, size / 2, size / 2 + size * 0.03)
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], size: number, color: string) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = size * PEN
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    if (s.length === 1) {
      ctx.beginPath()
      ctx.arc(s[0][0] * size, s[0][1] * size, (size * PEN) / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.beginPath()
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x * size, y * size) : ctx.moveTo(x * size, y * size)))
    ctx.stroke()
  }
}

function mask(draw: (ctx: CanvasRenderingContext2D) => void): Uint8Array {
  const c = document.createElement('canvas')
  c.width = c.height = N
  const ctx = c.getContext('2d')!
  draw(ctx)
  const d = ctx.getImageData(0, 0, N, N).data
  const m = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) m[i] = d[i * 4 + 3] > 80 ? 1 : 0
  return m
}

function dilate(m: Uint8Array, r: number) {
  const out = new Uint8Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!m[y * N + x]) continue
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const X = x + dx
          const Y = y + dy
          if (X >= 0 && Y >= 0 && X < N && Y < N && dx * dx + dy * dy <= r * r) out[Y * N + X] = 1
        }
    }
  return out
}

/** 채점: { cover, precision } (0~1) */
export function scoreTrace(ch: string, strokes: Stroke[]) {
  const g = mask((ctx) => drawGlyph(ctx, ch, N, '#000'))
  const u = mask((ctx) => drawStrokes(ctx, strokes, N, '#000'))
  const gd = dilate(g, 2)
  const ud = dilate(u, 1)
  let gN = 0, gHit = 0, uN = 0, uIn = 0
  for (let i = 0; i < N * N; i++) {
    if (g[i]) {
      gN++
      if (ud[i]) gHit++
    }
    if (u[i]) {
      uN++
      if (gd[i]) uIn++
    }
  }
  return { cover: gN ? gHit / gN : 0, precision: uN ? uIn / uN : 0 }
}

export default function HanjaTrace({
  ch,
  gloss,
  onPass,
}: {
  ch: string
  gloss?: string
  onPass: (ch: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(300)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [showGuide, setShowGuide] = useState(true)
  const [result, setResult] = useState<{ ok: boolean; score: number } | null>(null)
  const drawing = useRef<Stroke | null>(null)

  // 칸 크기: 화면 폭에 맞춤 (최대 320)
  useEffect(() => {
    const fit = () => setSize(Math.min(320, (boxRef.current?.clientWidth ?? 320) - 4))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const redraw = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = size * dpr
    c.height = size * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#fffdf5'
    ctx.fillRect(0, 0, size, size)
    // 田자 칸
    ctx.strokeStyle = '#f0b4b4'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.moveTo(size / 2, 0)
    ctx.lineTo(size / 2, size)
    ctx.moveTo(0, size / 2)
    ctx.lineTo(size, size / 2)
    ctx.moveTo(0, 0)
    ctx.lineTo(size, size)
    ctx.moveTo(size, 0)
    ctx.lineTo(0, size)
    ctx.stroke()
    ctx.setLineDash([])
    if (showGuide) drawGlyph(ctx, ch, size, 'rgba(27,27,43,0.16)')
    const all = drawing.current ? [...strokes, drawing.current] : strokes
    drawStrokes(ctx, all, size, result?.ok ? '#2f9e44' : '#1b1b2b')
  }, [size, ch, strokes, showGuide, result])

  useEffect(redraw, [redraw])
  useEffect(() => {
    setStrokes([])
    setResult(null)
  }, [ch])

  const pt = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }
  const down = (e: React.PointerEvent) => {
    if (result?.ok) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 일부 기기에서 실패해도 그리기는 계속 */
    }
    drawing.current = [pt(e)]
    setResult(null)
    redraw()
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    drawing.current.push(pt(e))
    redraw()
  }
  const up = () => {
    if (!drawing.current) return
    const s = drawing.current
    drawing.current = null
    setStrokes((xs) => [...xs, s])
  }

  function check() {
    const { cover, precision } = scoreTrace(ch, strokes)
    const ok = cover >= PASS_COVER && precision >= PASS_PRECISION
    // 점수: 덮은 정도 50 + 정확도 50 (각각 기준에 닿으면 만점)
    const score = Math.round(50 * Math.min(1, cover / PASS_COVER) + 50 * Math.min(1, precision / PASS_PRECISION))
    setResult({ ok, score: ok ? Math.max(score, 80) : Math.min(score, 79) })
    if (ok) onPass(ch)
  }

  return (
    <div ref={boxRef} className="flex flex-col items-center">
      {gloss && <p className="mb-2 font-pixel text-lg">{gloss}</p>}
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, touchAction: 'none' }}
        className={`rounded-xl border-[3px] ${result?.ok ? 'border-ok' : 'border-ink'} cursor-crosshair`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label={`${ch} 따라 쓰기 칸`}
      />
      <div className="mt-3 flex flex-wrap justify-center gap-2 font-pixel text-sm">
        <button onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length || result?.ok} className="pixel-btn px-3 py-1.5">
          ↶ 한 획 지우기
        </button>
        <button onClick={() => (setStrokes([]), setResult(null))} disabled={!strokes.length} className="pixel-btn px-3 py-1.5">
          🧽 모두 지우기
        </button>
        <button onClick={() => setShowGuide((v) => !v)} className="pixel-btn px-3 py-1.5">
          {showGuide ? '👀 본보기 숨기기' : '👀 본보기 보기'}
        </button>
        <button onClick={check} disabled={!strokes.length || result?.ok} className="pixel-btn go px-4 py-1.5">
          ✔ 확인
        </button>
      </div>
      {result && (
        <Mascot color="cream" size={3} className="mt-4 w-full">
          {result.ok ? (
            <b className="text-ok">⭕ 잘 썼어요! {result.score}점 — 기록에 쌓였어요 ✍️</b>
          ) : (
            <span>
              <b className="text-coral">{result.score}점</b> · 흐린 글자 위를 조금 더 꼼꼼하게 따라 써 봐요.
            </span>
          )}
        </Mascot>
      )}
    </div>
  )
}

/** 낱말의 한자들 (글자마다 칸 하나, 다 쓰면 ✔) */
export function HanjaPractice({
  hanja,
  glosses,
  done,
  onPass,
  onClose,
}: {
  hanja: string
  glosses: string[]
  done: string[]
  onPass: (ch: string) => void
  onClose: () => void
}) {
  const chars = [...hanja].filter((c) => /\p{Script=Han}/u.test(c))
  const [i, setI] = useState(0)
  const glossOf = (c: string) => glosses.find((g) => g.startsWith(c)) ?? ''

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-label="한자 따라 쓰기" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-3 sm:items-center">
      <div className="pixel-panel w-full max-w-md p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-pixel text-xl">✍️ 한자 따라 쓰기</h2>
          <button onClick={onClose} className="pixel-btn px-3 py-1 font-pixel text-sm">
            닫기 ✕
          </button>
        </div>
        <div className="mb-4 flex justify-center gap-2">
          {chars.map((c, k) => (
            <button
              key={c + k}
              onClick={() => setI(k)}
              className={`relative grid h-14 w-14 place-items-center rounded-xl border-[3px] border-ink text-3xl ${k === i ? 'bg-[#fff4c2] ring-4 ring-star' : 'bg-white'}`}
            >
              {c}
              {done.includes(c) && <span className="absolute -right-2 -top-2 rounded-full bg-ok px-1 text-xs text-white">✔</span>}
            </button>
          ))}
        </div>
        {chars[i] && (
          <HanjaTrace
            key={chars[i]}
            ch={chars[i]}
            gloss={glossOf(chars[i])}
            onPass={(c) => {
              onPass(c)
              if (i < chars.length - 1) setTimeout(() => setI(i + 1), 1200)
            }}
          />
        )}
      </div>
    </div>
  )
}
