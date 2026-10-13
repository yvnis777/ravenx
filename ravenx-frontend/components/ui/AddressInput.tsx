// components/ui/AddressInput.tsx
'use client'
import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** A Hyperliquid wallet address, lowercased — or null if `raw` isn't one. */
export function parseWalletAddress(raw: string): string | null {
  const v = raw.trim()
  return ADDRESS_RE.test(v) ? v.toLowerCase() : null
}

interface AddressInputProps {
  /** `compact` fits the 44px nav; `hero` is the page's main action. */
  variant?: 'compact' | 'hero'
  className?: string
}

/** Paste a wallet address → open its trader page, where the Copy button lives. */
export function AddressInput({ variant = 'hero', className = '' }: AddressInputProps) {
  const router = useRouter()
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const compact = variant === 'compact'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const address = parseWalletAddress(value)
    if (!address) {
      setError(value.trim() ? 'That is not a valid wallet address (0x + 40 characters).' : 'Paste a wallet address.')
      return
    }
    setError(null)
    router.push(`/traders/${address}`)
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={`relative ${className}`} noValidate>
      <label htmlFor={id} className="sr-only">
        Wallet address to copy
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={compact ? 'Paste wallet 0x…' : 'Paste a Hyperliquid wallet address (0x…)'}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`num min-w-0 flex-1 rounded-md border bg-raised text-fg placeholder:text-faint outline-none
            transition-colors focus:border-accent ${error ? 'border-loss' : 'border-line'}
            ${compact ? 'h-[26px] w-[130px] px-2 text-xs sm:w-[220px]' : 'h-[36px] px-3 text-[13px]'}`}
        />
        {!compact && (
          <Button type="submit" className="h-[36px] px-5 text-[13px]">
            Copy
          </Button>
        )}
      </div>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className={`text-xs text-loss ${compact ? 'absolute right-0 top-full mt-1 whitespace-nowrap rounded-md border border-line bg-panel px-2 py-1' : 'mt-1.5 text-left'}`}
        >
          {error}
        </p>
      )}
    </form>
  )
}
