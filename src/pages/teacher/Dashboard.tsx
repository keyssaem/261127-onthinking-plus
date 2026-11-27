import { useMemo, useState } from 'react'
import { PixelCat, catForNumber } from '../../components/pixel'
import { STAGE_LABEL } from '../../lib/types'
import {
  ago,
  isMastered,
  pct,
  useNow,
  useSummaries,
  type AttemptRow,
  type ProgressRow,
  type StudentRow,
  type StudentSummary,
} from './classData'

const ACTIVE_MS = 3 * 60_000 // 3분 안에 푼 기록이 있으면 '지금 공부 중'
const TOTAL_WORDS = 293

type Sort = 'number' | 'today' | 'low'

/** 실시간 현황: 요약 타일 · 학생별 표 · 실시간 피드 · 어려운 낱말 */
export default function Dashboard({
  className,
  students,
  progress,
  today,
  words,
}: {
  className: string
  students: StudentRow[]
  progress: ProgressRow[] | null
  today: AttemptRow[] | null
  words: Record<string, string>
}) {
  const now = useNow()
  const rows = useSummaries(students, progress, today)
  const [sort, setSort] = useState<Sort>('number')
  const [open, setOpen] = useState<string | null>(null)

  const active = rows.filter((r) => now - r.lastAt < ACTIVE_MS).length
  const todayFirst = rows.reduce((n, r) => n + r.todayFirst, 0)
  const todayOk = rows.reduce((n, r) => n + r.todayFirstOk, 0)
  const todayCount = rows.reduce((n, r) => n + r.todayCount, 0)

  const sorted = useMemo(() => {
    const r = [...rows]
    if (sort === 'today') r.sort((a, b) => b.todayCount - a.todayCount || a.number - b.number)
    if (sort === 'low')
      r.sort((a, b) => (pct(a.correct, a.correct + a.wrong) ?? 101) - (pct(b.correct, b.correct + b.wrong) ?? 101))
    return r
  }, [rows, sort])

  if (!progress || !today) return <p className="font-pixel text-ink-soft">현황 불러오는 중…</p>

  return (
    <div className="space-y-6">
      {/* 요약 타일 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="들어온 학생" value={`${students.length}명`} />
        <Tile label="지금 공부 중" value={`${active}명`} hint="3분 안에 문제를 푼 학생" live={active > 0} />
        <Tile label="오늘 푼 문제" value={`${todayCount}개`} />
        <Tile
          label="오늘 첫 시도 정답률"
          value={pct(todayOk, todayFirst) === null ? '—' : `${pct(todayOk, todayFirst)}%`}
          hint="두 번째 기회 전 첫 답 기준"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* 학생별 표 */}
        <section className="pixel-panel plain min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-pixel text-lg">학생별 현황</h4>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['number', '번호순'],
                  ['today', '오늘 많이 푼 순'],
                  ['low', '정답률 낮은 순'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className={`pixel-btn px-3 py-1 font-pixel text-xs ${sort === k ? 'primary' : ''}`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => downloadCsv(className, rows, now)}
                className="pixel-btn sky px-3 py-1 font-pixel text-xs"
                title="엑셀·구글 시트에서 열 수 있어요"
              >
                ⬇ CSV
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-6 text-center font-pixel text-sm text-ink-soft">아직 들어온 학생이 없어요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-separate border-spacing-y-1 font-pixel text-sm">
                <thead className="text-left text-xs text-ink-soft">
                  <tr>
                    <th className="px-2 font-normal">학생</th>
                    <th className="px-2 font-normal">오늘</th>
                    <th className="px-2 font-normal">전체 정답률</th>
                    <th className="w-40 px-2 font-normal">익힌 낱말</th>
                    <th className="px-2 text-right font-normal">마지막</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <StudentLine
                      key={r.id}
                      r={r}
                      now={now}
                      open={open === r.id}
                      onToggle={() => setOpen(open === r.id ? null : r.id)}
                      progress={progress}
                      words={words}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 font-pixel text-xs text-ink-soft">● 초록 = 지금 공부 중 · 노랑 = 오늘 공부함 │ 익힌 낱말 막대: 노랑 = 공부한 낱말, 초록 = 그중 익힌 낱말(정답 3번) │ 학생 줄을 누르면 낱말별 기록이 열려요.</p>
        </section>

        <div className="space-y-6">
          <LiveFeed today={today} students={students} words={words} now={now} />
          <HardWords progress={progress} words={words} />
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, hint, live }: { label: string; value: string; hint?: string; live?: boolean }) {
  return (
    <div className="pixel-panel plain p-4" title={hint}>
      <div className="flex items-center gap-2 font-pixel text-xs text-ink-soft">
        {live && <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-xp" />}
        {label}
      </div>
      <div className="mt-1 font-pixel text-3xl">{value}</div>
    </div>
  )
}

function StudentLine({
  r,
  now,
  open,
  onToggle,
  progress,
  words,
}: {
  r: StudentSummary
  now: number
  open: boolean
  onToggle: () => void
  progress: ProgressRow[]
  words: Record<string, string>
}) {
  const isActive = now - r.lastAt < ACTIVE_MS
  const acc = pct(r.correct, r.correct + r.wrong)
  const todayAcc = pct(r.todayFirstOk, r.todayFirst)
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer bg-white hover:bg-[#fff8d6]">
        <td className="rounded-l-xl border-y-2 border-l-2 border-ink px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'animate-pulse bg-xp' : r.todayCount ? 'bg-star' : 'bg-grid'}`}
              title={isActive ? '지금 공부 중' : r.todayCount ? '오늘 공부함' : '오늘 아직'}
            />
            <PixelCat color={catForNumber(r.number)} size={2} />
            <span className="truncate">
              {r.number}. {r.nickname}
            </span>
          </div>
        </td>
        <td className="border-y-2 border-ink px-2">
          {r.todayCount ? (
            <>
              {r.todayCount}문제
              {todayAcc !== null && <span className="ml-1 text-ink-soft">({todayAcc}%)</span>}
            </>
          ) : (
            <span className="text-ink-soft">—</span>
          )}
        </td>
        <td className={`border-y-2 border-ink px-2 ${acc !== null && acc < 60 ? 'text-bad' : ''}`}>
          {acc === null ? <span className="text-ink-soft">—</span> : `${acc}%`}
        </td>
        <td className="border-y-2 border-ink px-2">
          <div className="flex items-center gap-2" title={`전체 ${TOTAL_WORDS}개 중 익힘 ${r.mastered} · 공부 ${r.touched}`}>
            {/* 노랑 = 공부한 낱말, 초록 = 그중 익힌 낱말 */}
            <div className={`h-3 w-16 shrink-0 overflow-hidden rounded-full border-2 border-ink ${r.touched ? 'bg-star' : 'bg-white'}`}>
              <div className="h-full bg-xp" style={{ width: `${r.touched ? (r.mastered / r.touched) * 100 : 0}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs">
              <b>{r.mastered}</b>
              <span className="text-ink-soft"> / 공부 {r.touched}</span>
            </span>
          </div>
        </td>
        <td className="rounded-r-xl border-y-2 border-r-2 border-ink px-2 text-right text-xs text-ink-soft">
          {ago(r.lastAt, now)}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="px-1 pb-2">
            <StudentWords studentId={r.id} progress={progress} words={words} now={now} />
          </td>
        </tr>
      )}
    </>
  )
}

/** 한 학생의 낱말별 기록 (오답 많은 순) */
function StudentWords({
  studentId,
  progress,
  words,
  now,
}: {
  studentId: string
  progress: ProgressRow[]
  words: Record<string, string>
  now: number
}) {
  const mine = progress
    .filter((p) => p.studentId === studentId)
    .sort((a, b) => b.wrong - a.wrong || b.lastSeen - a.lastSeen)
  if (!mine.length)
    return <p className="rounded-xl bg-sky/20 p-3 font-pixel text-xs text-ink-soft">아직 공부한 낱말이 없어요.</p>
  return (
    <ul className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl bg-sky/20 p-3 sm:grid-cols-3">
      {mine.map((p) => (
        <li
          key={p.wordId}
          className={`flex items-center justify-between gap-2 rounded-lg border-2 border-ink px-2 py-1 text-xs ${isMastered(p) ? 'bg-ok-bg' : p.wrong > p.correct ? 'bg-bad-bg' : 'bg-white'}`}
          title={`${p.stage ? STAGE_LABEL[p.stage] ?? p.stage : ''} · ${ago(p.lastSeen, now)}`}
        >
          <span className="truncate">{words[p.wordId] ?? p.wordId}</span>
          <span className="shrink-0">
            <span className="text-ok">○{p.correct}</span> <span className="text-bad">✕{p.wrong}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** 방금 들어온 응답 15개 */
function LiveFeed({
  today,
  students,
  words,
  now,
}: {
  today: AttemptRow[]
  students: StudentRow[]
  words: Record<string, string>
  now: number
}) {
  const name = new Map(students.map((s) => [s.id, `${s.number}. ${s.nickname}`]))
  const recent = today.filter((a) => a.isCorrect !== null).slice(0, 15)
  return (
    <section className="pixel-panel plain p-4">
      <h4 className="mb-3 flex items-center gap-2 font-pixel text-lg">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-coral" /> 실시간
      </h4>
      {recent.length ? (
        <ul className="space-y-1.5 font-pixel text-xs">
          {recent.map((a) => (
            <li key={a.id} className="pop flex items-center gap-2">
              <span>{a.isCorrect ? '✅' : '❌'}</span>
              <span className="min-w-0 flex-1 truncate">
                <b>{name.get(a.studentId) ?? `${a.studentId}번`}</b> · {words[a.wordId] ?? a.wordId}
                <span className="text-ink-soft"> · {STAGE_LABEL[a.stage] ?? a.stage}{a.tryNo === 2 ? ' (2차)' : ''}</span>
              </span>
              <span className="shrink-0 text-ink-soft">{ago(a.at, now)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-pixel text-xs text-ink-soft">오늘은 아직 푼 문제가 없어요.</p>
      )}
    </section>
  )
}

/** 학급 전체에서 오답 비율이 높은 낱말 */
function HardWords({ progress, words }: { progress: ProgressRow[]; words: Record<string, string> }) {
  const top = useMemo(() => {
    const agg = new Map<string, { correct: number; wrong: number; students: number }>()
    for (const p of progress) {
      const a = agg.get(p.wordId) ?? { correct: 0, wrong: 0, students: 0 }
      a.correct += p.correct
      a.wrong += p.wrong
      a.students++
      agg.set(p.wordId, a)
    }
    return [...agg.entries()]
      .filter(([, a]) => a.correct + a.wrong >= 4 && a.wrong > 0)
      .map(([id, a]) => ({ id, ...a, rate: a.wrong / (a.correct + a.wrong) }))
      .sort((x, y) => y.rate - x.rate || y.wrong - x.wrong)
      .slice(0, 8)
  }, [progress])
  return (
    <section className="pixel-panel plain p-4">
      <h4 className="mb-1 font-pixel text-lg">🔥 어려워하는 낱말</h4>
      <p className="mb-3 font-pixel text-xs text-ink-soft">학급 전체 오답 비율 (4번 이상 푼 낱말)</p>
      {top.length ? (
        <ol className="space-y-2 font-pixel text-sm">
          {top.map((w, i) => (
            <li key={w.id}>
              <div className="flex justify-between">
                <span>
                  {i + 1}. {words[w.id] ?? w.id}
                </span>
                <span className="text-xs text-ink-soft">
                  {w.students}명 · 오답 {Math.round(w.rate * 100)}%
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full border-2 border-ink bg-white">
                <div className="h-full bg-coral" style={{ width: `${Math.round(w.rate * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="font-pixel text-xs text-ink-soft">기록이 더 쌓이면 보여 줄게요.</p>
      )}
    </section>
  )
}

function downloadCsv(className: string, rows: StudentSummary[], now: number) {
  const head = ['번호', '닉네임', '공부한 낱말', '익힌 낱말', '정답 수', '오답 수', '전체 정답률(%)', '오늘 푼 문제', '오늘 첫 시도 정답률(%)', '마지막 활동']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [
      r.number,
      r.nickname,
      r.touched,
      r.mastered,
      r.correct,
      r.wrong,
      pct(r.correct, r.correct + r.wrong) ?? '',
      r.todayCount,
      pct(r.todayFirstOk, r.todayFirst) ?? '',
      r.lastAt ? new Date(r.lastAt).toLocaleString('ko-KR') : '',
    ]
      .map(esc)
      .join(','),
  )
  const csv = '﻿' + [head.map(esc).join(','), ...lines].join('\r\n') // BOM: 엑셀 한글 깨짐 방지
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const d = new Date(now)
  a.download = `온생각_${className}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
