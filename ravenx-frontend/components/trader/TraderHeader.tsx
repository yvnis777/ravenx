'use client'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useAppKit } from '@reown/appkit/react'
import { Button } from '@/components/ui/Button'
import { CopyIcon } from '@/components/ui/CopyIcon'
import { getIdenticonData } from '@/lib/identicon'
import type { Trader } from '@/types'
import { copyToClipboard } from '@/lib/clipboard'

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function Identicon({ address }: { address: string }) {
  const { size, rects } = getIdenticonData(address)
  return (
    <svg
      aria-hidden="true"
      width={22}
      height={22}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0 rounded"
    >
      <rect width={size} height={size} fill="#17171d" rx="4" />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={r.fill} rx={1.5} />
      ))}
    </svg>
  )
}

interface TraderHeaderProps {
  trader: Pick<Trader, 'address' | 'display_name'>
  onBack: () => void
  onCopy: () => void
}

export function TraderHeader({ trader, onBack, onCopy }: TraderHeaderProps) {
  const { isAuthenticated, isConnected, isSigningIn, authError, login } = useAuth()
  const { open } = useAppKit()
  const [copied, setCopied] = useState(false)

  // Connected but not signed in is its own state: ask for the sign-in
  // signature, not the wallet picker (which only shows the account).
  async function handleCopy() {
    if (isAuthenticated) return onCopy()
    if (!isConnected) return open()
    try {
      // A second tap while waiting resends a request the wallet may have lost
      await login({ restart: isSigningIn })
      onCopy()
    } catch {
      /* authError is shown under the button */
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        onClick={onBack}
        aria-label="Back to dashboard"
        className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-line
          text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        ←
      </button>

      <Identicon address={trader.address} />

      <h1 className="num truncate text-sm font-semibold text-fg">
        {trader.display_name ?? truncate(trader.address)}
      </h1>

      <button
        onClick={() => {
          copyToClipboard(trader.address)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className={`flex h-[22px] w-[22px] items-center justify-center rounded transition-colors hover:bg-raised ${
          copied ? 'text-accent' : 'text-faint hover:text-muted'
        }`}
        title={copied ? 'Copied' : 'Copy full address'}
        aria-label={copied ? 'Address copied' : 'Copy full address'}
      >
        <CopyIcon copied={copied} />
      </button>

      <div className="relative ml-1">
        <Button size="sm" onClick={handleCopy}>
          {isSigningIn ? 'Check your wallet…' : 'Copy Trade'}
        </Button>
        {authError && !isAuthenticated && !isSigningIn && (
          <p
            role="alert"
            className="absolute right-0 top-full z-10 mt-1 w-64 text-right text-[11px] text-warn"
          >
            {authError}
          </p>
        )}
      </div>
    </div>
  )
}
