interface StatTileProps {
  label: string
  value: string
  /** Colors the value by sign — use only for money and performance. */
  tone?: 'neutral' | 'profit' | 'loss' | 'accent'
  /** Secondary line under the value, e.g. "+12.4% today". */
  sub?: string
  subTone?: 'neutral' | 'profit' | 'loss'
}

const TONES = {
  neutral: 'text-fg',
  profit: 'text-profit',
  loss: 'text-loss',
  accent: 'text-accent',
}

/** A single figure with its label. The unit dense stat rows are built from. */
export function StatTile({
  label,
  value,
  tone = 'neutral',
  sub,
  subTone = 'neutral',
}: StatTileProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-faint">{label}</span>
      <span className={`num text-[15px] font-medium leading-tight ${TONES[tone]}`}>
        {value}
      </span>
      {sub && <span className={`num text-[11px] ${TONES[subTone]}`}>{sub}</span>}
    </div>
  )
}
