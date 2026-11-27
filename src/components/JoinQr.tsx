import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** 학급 입장 주소 (QR로 열면 학급코드가 미리 채워짐) */
export function joinUrl(joinCode: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}join?code=${joinCode}`
}

function useQr(text: string) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 600, errorCorrectionLevel: 'M', color: { dark: '#1b1b2b', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''))
  }, [text])
  return src
}

/** 학급코드 옆 작은 QR — 누르면 칠판(TV)에 띄우기 좋게 크게 */
export default function JoinQr({ joinCode, className = '' }: { joinCode: string; className?: string }) {
  const url = joinUrl(joinCode)
  const src = useQr(url)
  const [big, setBig] = useState(false)

  useEffect(() => {
    if (!big) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [big])

  if (!src) return null
  return (
    <>
      <button
        onClick={() => setBig(true)}
        title="크게 보기 (칠판·TV에 띄우기)"
        className={`shrink-0 rounded-xl border-[3px] border-ink bg-white p-1 shadow-[0_4px_0_0_var(--color-ink)] hover:-translate-y-0.5 ${className}`}
      >
        <img src={src} alt={`학급코드 ${joinCode} 입장 QR`} className="h-24 w-24 [image-rendering:pixelated]" />
      </button>

      {big && (
        <div
          role="dialog"
          aria-label="학급 입장 QR"
          onClick={() => setBig(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
        >
          <div className="pixel-panel flex max-h-full w-full max-w-3xl flex-col items-center gap-4 p-6 sm:flex-row sm:gap-8 sm:p-10">
            <img
              src={src}
              alt={`학급코드 ${joinCode} 입장 QR`}
              className="aspect-square w-full max-w-[min(60vh,24rem)] rounded-xl border-[3px] border-ink [image-rendering:pixelated]"
            />
            <div className="text-center sm:text-left">
              <p className="font-pixel text-xl">📷 카메라로 찍으면 바로 입장!</p>
              <p className="mt-6 font-pixel text-sm text-ink-soft">또는 학급코드 입력</p>
              <p className="pixel-title font-pixel text-6xl tracking-widest sm:text-7xl">{joinCode}</p>
              <p className="mt-6 break-all font-pixel text-xs text-ink-soft">{url.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</p>
              <p className="mt-6 font-pixel text-xs text-ink-soft">아무 곳이나 누르면 닫혀요</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
