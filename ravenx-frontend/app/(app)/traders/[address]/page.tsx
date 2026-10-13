'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTrader } from '@/hooks/useTrader'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useHLSubscription } from '@/hooks/useHLSubscription'
import { TraderHeader } from '@/components/trader/TraderHeader'
import { TraderMetrics } from '@/components/trader/TraderMetrics'
import { PnlChart } from '@/components/trader/PnlChart'
import { TradingActivity } from '@/components/trader/TradingActivity'
import { CopyModal } from '@/components/trader/CopyModal'
import { EmptyWalletNotice, isEmptyWallet } from '@/components/trader/EmptyWalletNotice'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import type { PnlPeriod } from '@/hooks/usePnlHistory'

const PERIODS: { label: string; value: PnlPeriod }[] = [
  { label: '1D', value: '1d' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: 'All', value: 'all' },
]

export default function TraderDetailPage() {
  const { address } = useParams<{ address: string }>()
  const router = useRouter()
  const { data: trader, isLoading, isError } = useTrader(address)
  useHLSubscription(address)
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(address)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [period, setPeriod] = useState<PnlPeriod>('30d')

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !trader) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">Trader not found.</p>
        <Button variant="secondary" onClick={() => router.push('/dashboard')}>
          ← Back to dashboard
        </Button>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="flex h-full flex-col">
        {/* Command bar — identity and the copy action stay in view */}
        <header className="sticky top-0 z-20 flex flex-shrink-0 flex-wrap items-center gap-3
          border-b border-line bg-panel px-3 py-2">
          <TraderHeader
            trader={trader}
            onBack={() => router.push('/dashboard')}
            onCopy={() => setShowCopyModal(true)}
          />
          <Tabs
            items={PERIODS.map(({ label, value }) => ({ label, value }))}
            value={period}
            onChange={(v) => setPeriod(v as PnlPeriod)}
            variant="segmented"
            aria-label="Chart period"
            className="ml-auto"
          />
        </header>

        {!portfolioLoading && isEmptyWallet(trader, portfolio) && <EmptyWalletNotice />}

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PnlChart address={address} period={period} />
            <TradingActivity
              address={address}
              positions={trader.open_positions ?? []}
              period={period}
            />
          </div>

          <aside className="w-full flex-shrink-0 border-t border-line xl:w-[260px] xl:border-l xl:border-t-0">
            <TraderMetrics trader={trader} address={address} period={period} />
          </aside>
        </div>

        {showCopyModal && (
          <CopyModal targetAddress={address} onClose={() => setShowCopyModal(false)} />
        )}
      </div>
    </ErrorBoundary>
  )
}
