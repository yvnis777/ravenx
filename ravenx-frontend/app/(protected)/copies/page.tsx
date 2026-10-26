'use client'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useSubscriptions } from '@/hooks/useSubscriptions'
import { useCopyPositions } from '@/hooks/useCopyPositions'
import { useNotifications } from '@/hooks/useNotifications'
import { useTrader } from '@/hooks/useTrader'
import { useCopyFills } from '@/hooks/useCopyFills'
import { utcMs } from '@/lib/copy-fills'
import { attribute } from '@/lib/attribution'
import { truncateAddress } from '@/lib/format'
import { LEADERBOARD_ENABLED } from '@/lib/features'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { Spinner } from '@/components/ui/Spinner'
import { AccountStrip } from '@/components/copies/AccountStrip'
import { PositionsTable } from '@/components/copies/PositionsTable'
import { CopiesTable, copyName } from '@/components/copies/CopiesTable'
import { ActivityFeed } from '@/components/copies/ActivityFeed'

/* My Copies: the user's own HL account (read live from HL), which copy opened
   what, the copies themselves, and what the copy engine has been doing. */
export default function CopiesPage() {
  const router = useRouter()
  const { address, isAuthenticated } = useAuth()
  const { data: subscriptions = [], isLoading } = useSubscriptions()
  const { data: account, isError: accountError } = useTrader(address ?? '')
  const { data: shares = [] } = useCopyPositions()
  const { data: activity } = useNotifications(isAuthenticated)
  // Every copy's fills, from when the first one started
  const since = subscriptions.reduce<number | null>((min, s) => {
    const t = utcMs(s.created_at)
    return t !== null && (min === null || t < min) ? t : min
  }, null)
  const { data: trades, isLoading: tradesLoading } = useCopyFills(address, since)
  const realized = [...(trades?.values() ?? [])].reduce((sum, t) => sum + t.realized - t.fees, 0)

  const active = subscriptions.filter((s) => s.is_active)
  const stopped = subscriptions.filter((s) => !s.is_active)
  const positions = useMemo(() => account?.open_positions ?? [], [account])
  const { rows, orphans, perCopy } = useMemo(() => attribute(positions, shares), [positions, shares])

  const names = new Map(subscriptions.map((s) => [s.id, copyName(s)]))
  const copyLabel = (id: number) => names.get(id) ?? `copy #${id}`
  const exposure = positions.reduce((sum, p) => sum + (p.position_value ?? 0), 0)
  const marginUsed = positions.reduce((sum, p) => sum + (p.margin_used ?? 0), 0)

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-line px-3 py-2">
        <h1 className="text-[13px] font-semibold text-fg">My Copies</h1>
        {address && <span className="num text-[11px] text-faint">{truncateAddress(address)}</span>}
        <Button className="ml-auto" size="sm" onClick={() => router.push('/dashboard')}>
          + Start copy
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <AccountStrip
          equity={account?.perp_equity}
          exposure={exposure}
          upnl={account?.upnl ?? 0}
          marginUsed={marginUsed}
          activeCopies={active.length}
          realized={trades ? realized : undefined}
        />
        {accountError && (
          <p role="alert" className="border-b border-line px-3 py-2 text-[11px] text-warn">
            Couldn&apos;t reach Hyperliquid to read your account. Retrying…
          </p>
        )}

        <div className="flex flex-col gap-3 p-3">
          <Panel title="Positions" flush>
            <PositionsTable rows={rows} orphans={orphans} copyLabel={copyLabel} />
          </Panel>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
            <Panel title="Copies" flush>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <p className="text-sm text-muted">No copies yet.</p>
                  <Button size="sm" onClick={() => router.push('/dashboard')}>
                    {LEADERBOARD_ENABLED ? 'Browse traders' : 'Copy a wallet'}
                  </Button>
                </div>
              ) : (
                <CopiesTable
                  active={active}
                  stopped={stopped}
                  perCopy={perCopy}
                  trades={trades}
                  tradesLoading={tradesLoading && since !== null}
                />
              )}
            </Panel>

            <Panel title="Activity" flush>
              <ActivityFeed items={activity?.notifications ?? []} />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}
