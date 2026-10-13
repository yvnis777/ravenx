interface BadgeProps {
  children: React.ReactNode
  /** `active`/`inactive` are legacy aliases kept until every page is rebuilt. */
  variant?: 'neutral' | 'accent' | 'profit' | 'loss' | 'warning' | 'active' | 'inactive'
  className?: string
}

const VARIANTS: Record<string, string> = {
  neutral: 'bg-raised text-muted border-line',
  accent: 'bg-accent-dim text-accent border-[var(--accent-line)]',
  profit: 'bg-profit-dim text-profit border-[rgba(46,204,128,0.3)]',
  loss: 'bg-loss-dim text-loss border-[rgba(255,92,92,0.3)]',
  warning: 'bg-[rgba(240,180,41,0.12)] text-warn border-[rgba(240,180,41,0.3)]',
  // legacy names used by pages not yet rebuilt
  active: 'bg-profit-dim text-profit border-[rgba(46,204,128,0.3)]',
  inactive: 'bg-raised text-faint border-line',
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]
        font-medium uppercase tracking-wide ${VARIANTS[variant] ?? VARIANTS.neutral} ${className}`}
    >
      {children}
    </span>
  )
}
