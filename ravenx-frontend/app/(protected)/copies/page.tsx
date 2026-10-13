'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import type { Subscription } from '@/types'
import { LEADERBOARD_ENABLED } from '@/lib/features'

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

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

const TH = 'h-[26px] px-3 text-[10px] font-semibold uppercase tracking-wider text-faint'
const TD = 'h-[34px] px-3 text-xs'

function ActiveRow({ sub }: { sub: Subscription }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const stopMutation = useMutation({
    mutationFn: () => api.post('/copy/stop', { subscription_id: sub.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      setConfirming(false)
    },
  })

  return (
    <tr className="border-b border-line transition-colors hover:bg-raised">
      <td className={TD}>
        <button
          onClick={() => router.push(`/traders/${sub.target_address}`)}
          className="num font-medium text-fg hover:text-accent"
        >
          {sub.target_name || truncate(sub.target_address)}
        </button>
      </td>
      <td className={`${TD} num text-right text-muted`}>{sub.scaling_pct}%</td>
      <td className={`${TD} hidden text-muted md:table-cell`}>{summarizeRisk(sub)}</td>
      <td className={`${TD} num hidden text-faint lg:table-cell`}>
        {truncate(sub.agent_address)}
      </td>
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push(`/traders/${sub.target_address}`)}
          >
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
  const seen = new Map<string, Subscription>()
  for (const s of subs) {
    const existing = seen.get(s.target_address)
    if (!existing || s.id > existing.id) seen.set(s.target_address, s)
  }
  const past = Array.from(seen.values()).slice(0, 10)

  return (
    <>
      {past.map((s) => (
        <tr
          key={s.id}
          onClick={() => router.push(`/traders/${s.target_address}`)}
          className="cursor-pointer border-b border-line transition-colors hover:bg-raised"
        >
          <td className={`${TD} num text-muted`}>{s.target_name || truncate(s.target_address)}</td>
          <td className={`${TD} num text-right text-faint`}>{s.scaling_pct}%</td>
          <td className={`${TD} hidden text-faint md:table-cell`}>{summarizeRisk(s)}</td>
          <td className={`${TD} num hidden text-faint lg:table-cell`}>
            {truncate(s.agent_address)}
          </td>
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

export default function CopiesPage() {
  const router = useRouter()
  const { data: subscriptions = [], isLoading } = useSubscriptions()
  const [showPast, setShowPast] = useState(false)

  const active = subscriptions.filter((s) => s.is_active)
  const inactive = subscriptions.filter((s) => !s.is_active)
  const totalScaling = active.reduce((sum, s) => sum + s.scaling_pct, 0)

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-line px-3 py-2">
        <h1 className="text-[13px] font-semibold text-fg">My Copies</h1>
        <span className="num text-[11px] text-faint">
          {active.length} active · {totalScaling}% allocated
        </span>
        {totalScaling > 100 && (
          <span className="num text-[11px] text-warn" title="Combined scaling exceeds your equity">
            over-allocated
          </span>
        )}
        <Button className="ml-auto" size="sm" onClick={() => router.push('/dashboard')}>
          + Start copy
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-muted">No copies yet.</p>
            <Button size="sm" onClick={() => router.push('/dashboard')}>
              {LEADERBOARD_ENABLED ? 'Browse traders' : 'Copy a wallet'}
            </Button>
          </div>
        ) : (
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line">
                <th className={TH}>Trader</th>
                <th className={`${TH} text-right`}>Scale</th>
                <th className={`${TH} hidden md:table-cell`}>Risk</th>
                <th className={`${TH} hidden lg:table-cell`}>Agent</th>
                <th className={`${TH} hidden sm:table-cell`}>Date</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`} />
              </tr>
            </thead>
            <tbody>
              {active.map((s) => (
                <ActiveRow key={s.id} sub={s} />
              ))}

              {inactive.length > 0 && (
                <tr className="border-b border-line bg-panel">
                  <td colSpan={7} className="px-3 py-1.5">
                    <button
                      onClick={() => setShowPast((v) => !v)}
                      aria-expanded={showPast}
                      className="text-[11px] text-faint transition-colors hover:text-muted"
                    >
                      {showPast ? '▾' : '▸'} {inactive.length} stopped
                    </button>
                  </td>
                </tr>
              )}
              {showPast && <PastRows subs={inactive} />}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
