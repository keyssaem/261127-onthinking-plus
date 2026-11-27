import { TEAM } from '../lib/bell'

/** 줄다리기 줄 (-100 노랑 ~ +100 파랑) */
export default function Rope({ rope, teamScore, big }: { rope: number; teamScore: [number, number]; big?: boolean }) {
  const pos = 50 + rope / 2 // 0~100%
  return (
    <div className="font-pixel">
      <div className={`flex justify-between ${big ? 'text-2xl' : 'text-sm'}`}>
        <span>
          {TEAM[0].emoji} {TEAM[0].name} {teamScore[0]}
        </span>
        <span>
          {teamScore[1]} {TEAM[1].name} {TEAM[1].emoji}
        </span>
      </div>
      <div className={`relative mt-2 overflow-hidden rounded-full border-[3px] border-ink ${big ? 'h-10' : 'h-6'}`}>
        <div className="absolute inset-y-0 left-0 w-1/2 bg-star/40" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-sky/40" />
        <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-ink/40" />
        <div className="absolute inset-y-[40%] left-0 right-0 bg-[#c49a6c]" />
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700"
          style={{ left: `${pos}%` }}
        >
          <span className={big ? 'text-4xl' : 'text-2xl'}>🎀</span>
        </div>
      </div>
    </div>
  )
}
