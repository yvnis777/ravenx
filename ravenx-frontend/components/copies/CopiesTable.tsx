'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import type { CopySummary } from '@/lib/attribution'
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

function ActiveRow({ sub, summary }: { sub: Subscription; summary?: CopySummary }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const stopMutation = useMutation({
    mutationFn: () => api.post('/copy/stop', { subscription_id: sub.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['copy-positions'] })
      setConfirming(false)
    },
  })
  const upnl = summary?.upnl ?? 0

  return (
    <tr className="border-b border-line transition-colors hover:bg-raised">
      <td className={TD}>
        <button
          onClick={() => router.push(`/traders/${sub.target_address}`)}
          className="num font-medium text-fg hover:text-accent"
        >
          {copyName(sub)}
        </button>
      </td>
      <td className={`${TD} num text-right text-muted`}>{summary?.positions ?? 0}</td>
      <td className={`${TD} num text-right text-muted`}>{fmtMoney(summary?.exposure ?? 0)}</td>
      <td className={`${TD} num text-right ${upnl > 0 ? 'text-profit' : upnl < 0 ? 'text-loss' : 'text-muted'}`}>
        {fmtMoney(upnl, true)}
      </td>
      <td className={`${TD} num text-right text-muted`}>{sub.scaling_pct}%</td>
      <td className={`${TD} hidden text-muted md:table-cell`}>{summarizeRisk(sub)}</td>
      <td className={`${TD} num hidden text-faint sm:table-cell`}>{fmtDate(sub.created_at)}</td>
      <td className={TD}>
        {sub.last_error ? (
          <span title={sub.last_error}>
            <Badge variant="warning">Error</Badge>
          </span>
        ) : (
          <Badge variant="profit">Active</Badge>
        )}
      </td>
      <td className={`${TD} text-right`}>
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => router.push(`/traders/${sub.target_address}`)}>
            Edit
          </Button>
          {confirming ? (
            <>
              <Button
                size="sm"
                variant="danger"
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
              >
                {stopMutation.isPending ? <Spinner size="sm" /> : 'Confirm'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
              Stop
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function PastRows({ subs }: { subs: Subscription[] }) {
  const router = useRouter()
  const latest = new Map<string, Subscription>()
  for (const s of subs) {
    const existing = latest.get(s.target_address)
    if (!existing || s.id > existing.id) latest.set(s.target_address, s)
  }
  return (
    <>
      {Array.from(latest.values()).slice(0, 10).map((s) => (
        <tr
          key={s.id}
          onClick={() => router.push(`/traders/${s.target_address}`)}
          className="cursor-pointer border-b border-line transition-colors hover:bg-raised"
        >
          <td className={`${TD} num text-muted`}>{copyName(s)}</td>
          <td className={TD} colSpan={3} />
          <td className={`${TD} num text-right text-faint`}>{s.scaling_pct}%</td>
          <td className={`${TD} hidden text-faint md:table-cell`}>{summarizeRisk(s)}</td>
          <td className={`${TD} num hidden text-faint sm:table-cell`}>{fmtDate(s.stopped_at)}</td>
          <td className={TD}>
            <Badge variant="inactive">Stopped</Badge>
          </td>
          <td className={TD} />
        </tr>
      ))}
    </>
  )
}

interface CopiesTableProps {
  active: Subscription[]
  stopped: Subscription[]
  perCopy: Map<number, CopySummary>
}

export function CopiesTable({ active, stopped, perCopy }: CopiesTableProps) {
  const [showPast, setShowPast] = useState(false)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Trader</th>
            <th className={`${TH} text-right`}>Positions</th>
            <th className={`${TH} text-right`}>Exposure</th>
            <th className={`${TH} text-right`}>uPnL</th>
            <th className={`${TH} text-right`}>Scale</th>
            <th className={`${TH} hidden md:table-cell`}>Risk</th>
            <th className={`${TH} hidden sm:table-cell`}>Date</th>
            <th className={TH}>Status</th>
            <th className={`${TH} text-right`} />
          </tr>
        </thead>
        <tbody>
          {active.map((s) => (
            <ActiveRow key={s.id} sub={s} summary={perCopy.get(s.id)} />
          ))}
          {stopped.length > 0 && (
            <tr className="border-b border-line">
              <td colSpan={9} className="px-3 py-1.5">
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
          {showPast && <PastRows subs={stopped} />}
        </tbody>
      </table>
    </div>
  )
}
