'use client'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useAppKit } from '@reown/appkit/react'
import { Button } from '@/components/ui/Button'
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
  const { isAuthenticated } = useAuth()
  const { open } = useAppKit()
  const [copied, setCopied] = useState(false)

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
        className="num text-[11px] text-faint transition-colors hover:text-muted"
        title="Copy full address"
      >
        {copied ? 'copied ✓' : 'copy'}
      </button>

      <Button size="sm" onClick={() => (isAuthenticated ? onCopy() : open())} className="ml-1">
        Copy Trade
      </Button>
    </div>
  )
}
