import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Heart, PixelCat, SkyBackground } from './pixel'

export default function Shell({
  children,
  right,
  wide,
}: {
  children: ReactNode
  right?: ReactNode
  wide?: boolean
}) {
  return (
    <div className="relative min-h-screen">
      <SkyBackground />
      <header className="relative z-10">
        <div className={`mx-auto flex items-center justify-between px-4 pt-4 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
          <Link to="/" className="flex items-center gap-2" aria-label="처음 화면">
            <Heart size={3} />
            <span className="pixel-title sm font-pixel text-lg">온생각 플러스</span>
          </Link>
          <div className="text-sm">{right}</div>
        </div>
      </header>
      <main className={`relative z-10 mx-auto px-4 pb-[24vh] pt-6 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {children}
      </main>
    </div>
  )
}

export function Spinner({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="relative min-h-screen">
      <SkyBackground />
      <div className="relative z-10 flex flex-col items-center gap-4 pt-[30vh]">
        <PixelCat color="black" size={5} className="bob" />
        <p className="pixel-title sm font-pixel text-lg">{label}</p>
      </div>
    </div>
  )
}

/** 헤더 오른쪽 학생 배지 */
export function PlayerBadge({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const cls = 'pixel-chip bg-white py-1 text-sm'
  return onClick ? (
    <button className={`${cls} hover:bg-[#fff8d6]`} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  )
}
