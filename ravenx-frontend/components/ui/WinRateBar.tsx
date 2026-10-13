'use client'

interface WinRateBarProps {
  rate: number | null | undefined // 0-1 decimal
}

/**
 * Win rate is a performance measure, not profit — it uses the gold accent
 * rather than green, so green stays exclusively "money made".
 */
export function WinRateBar({ rate }: WinRateBarProps) {
  if (rate == null) return <span className="text-xs text-faint">—</span>

  const pct = Math.round(rate * 100)
  const isGood = pct >= 50

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-[3px] w-9 flex-shrink-0 overflow-hidden rounded-sm bg-raised">
        <div
          className={`h-full ${isGood ? 'bg-accent' : 'bg-loss'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`num text-xs ${isGood ? 'text-muted' : 'text-faint'}`}>{pct}%</span>
    </div>
  )
}
