'use client'
import { usePnlHistory, type PnlPeriod } from '@/hooks/usePnlHistory'
import { useFills } from '@/hooks/useFills'
import type { LiveTrader } from '@/hooks/useTrader'
import { fillsCoverStart, tradeStats } from '@/lib/trader-stats'
import { StatTile } from '@/components/ui/StatTile'

function fmtUsd(n: number | null | undefined) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  const sign = n >= 0 ? '+' : '−'
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtUsdFull(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${new Intl.NumberFormat('en-US').format(Math.round(n))}`
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function tone(n: number | null | undefined) {
  return (n ?? 0) >= 0 ? ('profit' as const) : ('loss' as const)
}

function fmtSince(ms: number) {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface TraderMetricsProps {
  trader: LiveTrader
  address: string
  period: PnlPeriod
}

/**
 * Stat rail — every figure the copy decision needs, in one scan.
 * PnL and growth come from HL's portfolio (exact for any period); win rate, trades
 * and long/short split come from fills, which HL caps at the newest 10,000.
 */
export function TraderMetrics({ trader, address, period }: TraderMetricsProps) {
  const { data: pnl } = usePnlHistory(address, period)
  const { data: fillData } = useFills(address, period)
  const stats = fillData ? tradeStats(fillData.fills) : null
  const coverStart = fillData ? fillsCoverStart(fillData.periodStart, fillData.oldest, fillData.count) : null

  const positions = trader.open_positions ?? []
  const longCount = positions.filter((p) => p.szi > 0).length
  const shortCount = positions.filter((p) => p.szi < 0).length
  const total = positions.length
  const longPct = total > 0 ? (longCount / total) * 100 : 0
  const shortPct = total > 0 ? (shortCount / total) * 100 : 0

  const periodLabel = period === 'all' ? 'All time' : period.toUpperCase()

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-3 border-b border-line p-3 sm:grid-cols-4 xl:grid-cols-2">
        <StatTile label="Equity" value={fmtUsdFull(trader.perp_equity)} />
        <StatTile label="uPnL" value={fmtUsd(trader.upnl)} tone={tone(trader.upnl)} />
        <StatTile label={`${periodLabel} PnL`} value={fmtUsd(pnl?.pnl)} tone={tone(pnl?.pnl)} />
        <StatTile label="Growth" value={fmtPct(pnl?.growth)} tone={tone(pnl?.growth)} />
      </div>

      <div className="border-b border-line p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
          <StatTile
            label="Win rate"
            value={fmtPct(stats?.winRate)}
            sub={stats ? `${stats.wins}W / ${stats.losses}L` : undefined}
          />
          <StatTile label="Trades" value={stats ? stats.trades.toLocaleString('en-US') : '—'} />
          <StatTile label="Long PnL" value={fmtUsd(stats?.longPnl)} tone={tone(stats?.longPnl)} />
          <StatTile label="Short PnL" value={fmtUsd(stats?.shortPnl)} tone={tone(stats?.shortPnl)} />
        </div>
        {coverStart !== null && (
          <p className="mt-2 text-[10px] leading-snug text-faint">
            Trade stats cover fills since {fmtSince(coverStart)}. Hyperliquid keeps a wallet&apos;s
            latest 10,000 fills.
          </p>
        )}
      </div>

      <div className="p-3">
        <span className="text-[10px] uppercase tracking-wider text-faint">
          Positions ({total})
        </span>
        {total > 0 ? (
          <>
            <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-sm bg-raised">
              <div className="bg-profit" style={{ width: `${longPct}%` }} />
              <div className="bg-loss" style={{ width: `${shortPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between">
              <span className="num text-[11px] text-profit">
                {longPct.toFixed(0)}% long ({longCount})
              </span>
              <span className="num text-[11px] text-loss">
                {shortPct.toFixed(0)}% short ({shortCount})
              </span>
            </div>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-faint">No open positions</p>
        )}
      </div>
    </div>
  )
}
