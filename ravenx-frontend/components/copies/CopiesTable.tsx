'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StopChoice } from '@/components/copies/StopCopy'
import { CopyDetail } from '@/components/copies/CopyDetail'
import type { CopySummary } from '@/lib/attribution'
import type { CopyTrades } from '@/lib/copy-fills'
import { fmtMoney, truncateAddress } from '@/lib/format'
import type { Subscription } from '@/types'

const TH = 'h-[26px] px-3 text-[10px] font-semibold uppercase tracking-wider text-faint whitespace-nowrap'
const TD = 'h-[34px] px-3 text-xs whitespace-nowrap'

function summarizeRisk(sub: Subscription): string {
  const rp = sub.risk_params ?? {}
  const parts: string[] = []
  if (rp.stop_loss_pct) parts.push(`SL ${rp.stop_loss_pct}%`)
  if (rp.max_drawdown_pct) parts.push(`DD ${rp.max_drawdown_pct}%`)
  if (rp.max_position_usd) parts.push(`Max $${rp.max_position_usd.toLocaleString()}`)
  if (rp.price_tolerance_pct === -1) parts.push('Market')
  else if (rp.price_tolerance_pct) parts.push(`±${rp.price_tolerance_pct}%`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function copyName(sub: Pick<Subscription, 'target_name' | 'target_address'>) {
  return sub.target_name || truncateAddress(sub.target_address)
}

const COLS = 10

const tone = (n: number) => (n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : 'text-muted')

/** One copy, active or stopped, with its detail underneath when expanded. */
function CopyRow({
  sub,
  summary,
  trades,
  tradesLoading,
}: {
  sub: Subscription
  summary?: CopySummary
  trades?: CopyTrades
  tradesLoading: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const active = sub.is_active
  const upnl = summary?.upnl ?? 0
  const net = trades ? trades.realized - trades.fees : 0

  return (
    <>
      <tr className="border-b border-line transition-colors hover:bg-raised">
        <td className={TD}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} details for ${copyName(sub)}`}
            className={`num flex items-center gap-1.5 font-medium transition-colors hover:text-accent ${
              active ? 'text-fg' : 'text-muted'
            }`}
          >
            <span aria-hidden="true" className="w-2 text-faint">
              {open ? '▾' : '▸'}
            </span>
            {copyName(sub)}
          </button>
        </td>
        <td className={`${TD} num text-right text-muted`}>{active ? (summary?.positions ?? 0) : '—'}</td>
        <td className={`${TD} num text-right text-muted`}>
          {active ? fmtMoney(summary?.exposure ?? 0) : '—'}
        </td>
        <td className={`${TD} num text-right ${active ? tone(upnl) : 'text-faint'}`}>
          {active ? fmtMoney(upnl, true) : '—'}
        </td>
        <td
          className={`${TD} num text-right ${tone(net)}`}
          title={
            trades
              ? `Closed PnL ${fmtMoney(trades.realized, true)}, fees ${fmtMoney(trades.fees)}`
              : undefined
          }
        >
          {tradesLoading ? '…' : fmtMoney(net, true)}
        </td>
        <td className={`${TD} num text-right text-muted`}>{sub.scaling_pct}%</td>
        <td className={`${TD} hidden text-muted md:table-cell`}>{summarizeRisk(sub)}</td>
        <td className={`${TD} num hidden text-faint sm:table-cell`}>
          {fmtDate(active ? sub.created_at : sub.stopped_at)}
        </td>
        <td className={TD}>
          {!active ? (
            <Badge variant="inactive">Stopped</Badge>
          ) : sub.last_error ? (
            <span title={sub.last_error}>
              <Badge variant="warning">Error</Badge>
            </span>
          ) : (
            <Badge variant="profit">Active</Badge>
          )}
        </td>
        <td className={`${TD} text-right`}>
          {active && (
            <div className="flex justify-end gap-1">
              {confirming ? (
                // A failed close is in the stop notification under Activity
                <StopChoice
                  compact
                  subId={sub.id}
                  onDone={() => setConfirming(false)}
                  onCancel={() => setConfirming(false)}
                />
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => router.push(`/traders/${sub.target_address}`)}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                    Stop
                  </Button>
                </>
              )}
            </div>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line">
          <td colSpan={COLS} className="p-0">
            <CopyDetail sub={sub} trades={trades} loading={tradesLoading} />
          </td>
        </tr>
      )}
    </>
  )
}

interface CopiesTableProps {
  active: Subscription[]
  stopped: Subscription[]
  perCopy: Map<number, CopySummary>
  trades?: Map<number, CopyTrades>
  tradesLoading: boolean
}

export function CopiesTable({ active, stopped, perCopy, trades, tradesLoading }: CopiesTableProps) {
  const [showPast, setShowPast] = useState(false)
  const past = [...stopped].sort((a, b) => b.id - a.id).slice(0, 20)
  const row = (s: Subscription) => (
    <CopyRow
      key={s.id}
      sub={s}
      summary={perCopy.get(s.id)}
      trades={trades?.get(s.id)}
      tradesLoading={tradesLoading}
    />
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Trader</th>
            <th className={`${TH} text-right`}>Positions</th>
            <th className={`${TH} text-right`}>Exposure</th>
            <th className={`${TH} text-right`}>uPnL</th>
            <th className={`${TH} text-right`} title="Closed PnL minus fees, from this copy's own fills">
              Realized
            </th>
            <th className={`${TH} text-right`}>Scale</th>
            <th className={`${TH} hidden md:table-cell`}>Risk</th>
            <th className={`${TH} hidden sm:table-cell`}>Date</th>
            <th className={TH}>Status</th>
            <th className={`${TH} text-right`} />
          </tr>
        </thead>
        <tbody>
          {active.map(row)}
          {stopped.length > 0 && (
            <tr className="border-b border-line">
              <td colSpan={COLS} className="px-3 py-1.5">
                <button
                  onClick={() => setShowPast((v) => !v)}
                  aria-expanded={showPast}
                  className="text-[11px] text-faint transition-colors hover:text-muted"
                >
                  {showPast ? '▾' : '▸'} {stopped.length} stopped
                </button>
              </td>
            </tr>
          )}
          {showPast && past.map(row)}
        </tbody>
      </table>
    </div>
  )
}
