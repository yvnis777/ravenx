// components/dashboard/TraderRow.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Trader, SortField } from '@/types'
import { CopyModal } from '@/components/trader/CopyModal'
import { getIdenticonData } from '@/lib/identicon'
import { Sparkline } from '@/components/ui/Sparkline'
import { WinRateBar } from '@/components/ui/WinRateBar'

function Identicon({ address }: { address: string }) {
  const { size, rects } = getIdenticonData(address)
  return (
    <svg
      aria-hidden="true"
      width={18}
      height={18}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0 rounded-sm"
    >
      <rect width={size} height={size} fill="#17171d" rx="4" />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={r.fill} rx={1.5} />
      ))}
    </svg>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

function fmtUsd(n: number | null | undefined): { text: string; arrow: string } {
  if (n == null) return { text: '—', arrow: '' }
  const arrow = n >= 0 ? '▲' : '▼'
  const sign = n >= 0 ? '+' : '−'
  return { text: `${sign}$${fmt(Math.abs(n))}`, arrow }
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

type Period = '1d' | '7d' | '30d' | '90d' | 'all'

function periodFromPnlField(field: SortField): Period {
  if (field === 'pnl_1d') return '1d'
  if (field === 'pnl_7d') return '7d'
  if (field === 'pnl_30d') return '30d'
  if (field === 'pnl_90d') return '90d'
  return 'all'
}

function getVal(
  trader: Trader,
  period: Period,
  metric: 'pnl' | 'trades' | 'win_rate' | 'growth'
): number | null | undefined {
  if (period === 'all') {
    if (metric === 'pnl') return trader.pnl
    if (metric === 'trades') return trader.trade_count
    if (metric === 'win_rate') return trader.win_rate
    if (metric === 'growth') return trader.growth_rate
  }
  const key = `${metric === 'growth' ? 'pnl' : metric}_${period}` as keyof Trader
  const val = trader[key] as number | null | undefined

  if (metric === 'growth') {
    const pnl = val ?? 0
    const equity = trader.perp_equity ?? 1
    return equity > 0 ? pnl / equity : 0
  }

  return val ?? 0
}

interface TraderRowProps {
  trader: Trader
  rank: number
  pnlField?: SortField
}

export function TraderRow({ trader, rank, pnlField = 'pnl' }: TraderRowProps) {
  const router = useRouter()
  const [showCopyModal, setShowCopyModal] = useState(false)
  const period = periodFromPnlField(pnlField)

  const pnlValue = getVal(trader, period, 'pnl')
  const winRate = getVal(trader, period, 'win_rate')
  const trades = getVal(trader, period, 'trades')
  const growth = getVal(trader, period, 'growth')

  const isProfit = (pnlValue ?? 0) >= 0
  const detailUrl = `/traders/${trader.address}`
  const activeAgo = trader.last_updated ? timeAgo(trader.last_updated) : null
  const pnlFormatted = fmtUsd(pnlValue)
  const traderLabel = trader.display_name ?? truncate(trader.address)

  return (
    <>
      <tr
        tabIndex={0}
        aria-label={`${traderLabel} — PnL ${pnlFormatted.text}. Open trader.`}
        onClick={() => router.push(detailUrl)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            router.push(detailUrl)
          }
        }}
        className="group h-[var(--row-h)] cursor-pointer border-b border-line transition-colors
          hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
      >
        <td className="w-8 px-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowCopyModal(true)
            }}
            aria-label={`Copy trader ${traderLabel}`}
            title="Copy this trader"
            className="flex h-5 w-5 items-center justify-center rounded border border-line
              text-xs font-bold text-faint transition-colors hover:border-accent hover:text-accent"
          >
            +
          </button>
        </td>
        <td className="num w-8 px-2 text-[11px] text-faint">{rank}</td>
        <td className="px-3">
          <div className="flex items-center gap-2">
            <Identicon address={trader.address} />
            <span className="num text-xs text-fg">{traderLabel}</span>
            {activeAgo && <span className="num text-[10px] text-faint">{activeAgo}</span>}
          </div>
        </td>
        <td
          className={`num px-3 text-right text-[13px] font-medium ${
            isProfit ? 'text-profit' : 'text-loss'
          }`}
        >
          <span className="sr-only">{isProfit ? 'Profit' : 'Loss'}: </span>
          {pnlFormatted.arrow && (
            <span aria-hidden="true" className="mr-0.5 text-[9px] opacity-60">
              {pnlFormatted.arrow}
            </span>
          )}
          {pnlFormatted.text}
        </td>
        <td className="hidden px-3 sm:table-cell">
          <Sparkline value={pnlValue ?? 0} />
        </td>
        <td className="px-3">
          <WinRateBar rate={winRate} />
        </td>
        <td className="hidden px-3 text-right md:table-cell">
          {growth != null ? (
            <span className={`num text-xs ${growth >= 0 ? 'text-profit' : 'text-loss'}`}>
              {growth >= 0 ? '+' : '−'}
              {Math.abs(growth * 100).toFixed(1)}%
            </span>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
        <td className="num hidden px-3 text-right text-xs text-muted md:table-cell">{fmt(trades)}</td>
        <td className="num px-3 text-right text-xs text-muted">${fmt(trader.perp_equity)}</td>
      </tr>
      {showCopyModal && (
        <CopyModal targetAddress={trader.address} onClose={() => setShowCopyModal(false)} />
      )}
    </>
  )
}
