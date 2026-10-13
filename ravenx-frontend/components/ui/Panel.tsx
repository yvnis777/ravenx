interface PanelProps {
  children: React.ReactNode
  /** Optional header label — uppercase, tiny, terminal-style. */
  title?: string
  /** Right-aligned header slot: tabs, filters, actions. */
  actions?: React.ReactNode
  /** Drop the body padding when the panel holds a table. */
  flush?: boolean
  className?: string
}

/**
 * The layout primitive. A bordered region with an optional header —
 * replaces the floating glass cards, which wasted space at every level.
 */
export function Panel({
  children,
  title,
  actions,
  flush = false,
  className = '',
}: PanelProps) {
  return (
    <section className={`border border-line bg-panel rounded-md ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 h-[34px]">
          {title && (
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-3'}>{children}</div>
    </section>
  )
}
