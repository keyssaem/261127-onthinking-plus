import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Shell from '../components/Shell'
import { Mascot, PixelCat, catForNumber } from '../components/pixel'
import { existingNickname, joinClass, lookupClass, startGuest, type ClassInfo } from '../lib/student'

/**
 * 학생 입장 (교사의 사전 등록 없음)
 *  1) 학급코드 → 학급 확인   2) 번호 + 닉네임 → 입장
 *  또는 비회원 '혼자 연습'
 */
export default function StudentJoin() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [cls, setCls] = useState<ClassInfo | null>(null)
  const [number, setNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [taken, setTaken] = useState<string | null>(null) // 같은 번호로 이미 들어온 닉네임
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // QR(…/join?code=ABC123)로 열면 학급코드를 채우고 바로 확인
  const [params] = useSearchParams()
  const qrDone = useRef(false)
  useEffect(() => {
    if (qrDone.current) return
    qrDone.current = true
    const c = (params.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (c.length !== 6) return
    setCode(c)
    run(async () => setCls(await lookupClass(c)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCode = (e: FormEvent) => {
    e.preventDefault()
    run(async () => setCls(await lookupClass(code)))
  }

  const onJoin = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const n = Number(number)
      if (!n || n > 99) throw new Error('번호는 1~99 사이로 써 주세요')
      if (taken === null) {
        const prev = await existingNickname(cls!.classId, n)
        if (prev && prev !== nickname.trim()) {
          setTaken(prev) // 한 번 확인받기
          return
        }
      }
      await joinClass(cls!.classId, n, nickname)
      navigate('/learn')
    })
  }

  const onGuest = () =>
    run(async () => {
      if (!(await startGuest())) return
      navigate('/learn')
    })

  const input = 'pixel-input text-center font-pixel text-2xl'
  const n = Number(number)

  return (
    <Shell>
      <h1 className="pixel-title text-center font-pixel text-4xl">학생 입장</h1>

      <div className="mx-auto mt-8 max-w-sm">
        {!cls ? (
          /* 1단계: 학급코드 */
          <form onSubmit={onCode} className="pixel-panel space-y-5 p-6">
            <div className="flex justify-center">
              <PixelCat color="black" size={5} className="bob" />
            </div>
            <label className="block">
              <span className="mb-1 block font-pixel text-sm">선생님이 알려 준 학급코드</span>
              <input
                className={`${input} uppercase tracking-[0.3em]`}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={6}
                autoComplete="off"
                placeholder="ABC123"
                required
              />
            </label>
            {error && <ErrorBox msg={error} />}
            <button disabled={busy || code.length < 6} className="pixel-btn go w-full py-4 font-pixel text-2xl">
              {busy ? '찾는 중…' : '다음 ▶'}
            </button>
          </form>
        ) : (
          /* 2단계: 번호 + 닉네임 */
          <form onSubmit={onJoin} className="pixel-panel space-y-5 p-6">
            <div className="flex items-center justify-between">
              <span className="pixel-chip text-base">🏫 {cls.name} 반</span>
              <button
                type="button"
                onClick={() => {
                  setCls(null)
                  setTaken(null)
                }}
                className="font-pixel text-xs text-ink-soft underline"
              >
                코드 다시 입력
              </button>
            </div>
            <div className="flex justify-center">
              <PixelCat color={n ? catForNumber(n) : 'black'} size={5} className="bob" />
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <label className="block">
                <span className="mb-1 block font-pixel text-sm">번호</span>
                <input
                  className={input}
                  value={number}
                  onChange={(e) => {
                    setNumber(e.target.value.replace(/\D/g, ''))
                    setTaken(null)
                  }}
                  inputMode="numeric"
                  maxLength={2}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-pixel text-sm">닉네임</span>
                <input
                  className="pixel-input font-pixel text-xl"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={12}
                  placeholder="예: 하늘"
                  required
                />
              </label>
            </div>
            {taken !== null && (
              <p className="rounded-xl border-2 border-ink bg-[#fff4c2] p-3 font-pixel text-sm">
                {number}번에는 이미 ‘{taken}’(이)가 있어요. 나 맞아요? 맞으면 한 번 더 눌러요.
                <br />
                (닉네임은 ‘{nickname.trim()}’(으)로 바뀌어요)
              </p>
            )}
            {error && <ErrorBox msg={error} />}
            <button disabled={busy} className="pixel-btn go w-full py-4 font-pixel text-2xl">
              {busy ? '들어가는 중…' : taken !== null ? '네, 나예요 ▶' : 'START ▶'}
            </button>
          </form>
        )}

        {/* 비회원 혼자 연습 */}
        <div className="mt-8 text-center">
          <p className="pixel-title sm font-pixel text-sm">학급코드가 없나요?</p>
          <button onClick={onGuest} disabled={busy} className="pixel-btn sky mt-3 w-full py-3 font-pixel text-xl">
            🐾 혼자 연습하기 (비회원)
          </button>
        </div>

        <Mascot color="gray" size={4} className="mt-6">
          혼자 연습한 기록은 이 기기에만 남고, 선생님께는 보이지 않아.
        </Mascot>
      </div>
    </Shell>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return <p className="rounded-xl border-2 border-bad bg-bad-bg p-3 font-pixel text-sm text-bad">{msg}</p>
}
