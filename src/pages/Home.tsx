import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import { CAT_COLORS, Hearts, Mascot, PixelCat, type CatColor } from '../components/pixel'
import { isFirebaseConfigured } from '../lib/firebase'
import { startGuest } from '../lib/student'

const FRIENDS: CatColor[] = ['cheese', 'gray', 'cream', 'black']

export default function Home() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  return (
    <Shell>
      <section className="flex flex-col items-center pt-6 text-center">
        <Hearts total={3} left={3} size={4} />
        <h1 className="pixel-title mt-4 font-pixel text-6xl leading-tight sm:text-7xl">
          온생각
          <br />
          퀴즈 월드
        </h1>
        <p className="pixel-title sm bob mt-4 font-pixel text-base">▶ PRESS START ◀</p>
      </section>

      {!isFirebaseConfigured && (
        <p className="pixel-panel plain mt-6 p-4 font-pixel text-sm text-bad">
          ⚙️ .env.local에 Firebase 설정값을 넣어 주세요.
        </p>
      )}

      <Mascot className="mx-auto mt-8 max-w-xl" color="black">
        안녕! 나는 생각냥이야. 사고도구어 293개를 함께 모험해 보자.
        <br />
        낱말을 알면 생각이 커져!
      </Mascot>

      <div className="mx-auto mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
        <Link to="/join" className="pixel-btn primary py-5 font-pixel text-2xl">
          🎒 학급코드로 입장
        </Link>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              if (!(await startGuest())) return
              navigate('/learn')
            } catch {
              navigate('/join')
            }
          }}
          className="pixel-btn go py-5 font-pixel text-2xl"
        >
          🐾 혼자 연습
        </button>
        <Link to="/teacher" className="pixel-btn sky py-3 font-pixel text-lg sm:col-span-2">
          🧑‍🏫 선생님
        </Link>
      </div>

      <section className="mx-auto mt-10 max-w-xl">
        <h2 className="pixel-title text-center font-pixel text-2xl">PLAYERS</h2>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {FRIENDS.map((c) => (
            <div key={c} className="flex flex-col items-center gap-2">
              <div className="pixel-panel plain flex aspect-square w-full items-center justify-center">
                <PixelCat color={c} size={4} />
              </div>
              <span className="pixel-chip">{CAT_COLORS[c].name}</span>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  )
}
