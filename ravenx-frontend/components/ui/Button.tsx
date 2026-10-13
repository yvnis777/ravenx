import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

/**
 * Terminal button. `primary` is a solid gold fill and should appear at most
 * once per view — it is the action the screen exists for.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 font-medium rounded-md border transition-colors duration-100 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1'

  const sizes = {
    sm: 'h-[26px] px-2.5 text-xs',
    md: 'h-[30px] px-3 text-[13px]',
  }

  const variants = {
    primary: 'bg-accent border-accent text-on-accent hover:bg-accent-hover hover:border-accent-hover',
    secondary: 'bg-raised border-line text-fg hover:border-line-strong',
    ghost: 'bg-transparent border-transparent text-muted hover:text-fg hover:bg-raised',
    danger: 'bg-transparent border-line text-muted hover:text-loss hover:border-loss',
  }

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
