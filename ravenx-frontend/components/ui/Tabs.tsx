'use client'

export interface TabItem {
  label: string
  value: string
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  /** `underline` for page-level sections, `segmented` for inline switches. */
  variant?: 'underline' | 'segmented'
  className?: string
  'aria-label'?: string
}

export function Tabs({
  items,
  value,
  onChange,
  variant = 'underline',
  className = '',
  'aria-label': ariaLabel,
}: TabsProps) {
  const isUnderline = variant === 'underline'

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center ${isUnderline ? 'gap-4' : 'gap-0.5 rounded-md border border-line bg-raised p-0.5'} ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value
        const cls = isUnderline
          ? `relative h-[30px] text-[13px] transition-colors ${
              active
                ? 'text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent'
                : 'text-faint hover:text-muted'
            }`
          : `h-[24px] rounded px-2.5 text-xs font-medium transition-colors ${
              active ? 'bg-accent-dim text-accent' : 'text-faint hover:text-fg'
            }`

        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cls}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
