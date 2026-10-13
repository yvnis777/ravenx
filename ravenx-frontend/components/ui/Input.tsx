import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Render the value in tabular mono — use for every numeric field. */
  numeric?: boolean
}

export function Input({
  label,
  error,
  numeric = false,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[10px] uppercase tracking-wider text-faint">{label}</label>
      )}
      <input
        className={`h-[30px] rounded-md border bg-raised px-2.5 text-[13px] text-fg
          placeholder:text-faint outline-none transition-colors duration-100
          focus:border-accent ${error ? 'border-loss' : 'border-line'}
          ${numeric ? 'num' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  )
}
