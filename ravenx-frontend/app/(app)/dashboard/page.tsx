'use client'
import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTraders } from '@/hooks/useTraders'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useLiveTraderUpdates } from '@/hooks/useLiveTraderUpdates'
import { WalletCohorts } from '@/components/dashboard/WalletCohorts'
import { FilterPanel } from '@/components/dashboard/FilterPanel'
import { TraderTable } from '@/components/dashboard/TraderTable'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { CopyAWallet } from '@/components/dashboard/CopyAWallet'
import { LEADERBOARD_ENABLED } from '@/lib/features'
import type { TraderFilters, SortField } from '@/types'

const TIME_TABS = [
  { label: '1D', value: '1d', sort: 'pnl_1d' as SortField },
  { label: '7D', value: '7d', sort: 'pnl_7d' as SortField },
  { label: '30D', value: '30d', sort: 'pnl_30d' as SortField },
  { label: '90D', value: '90d', sort: 'pnl_90d' as SortField },
  { label: 'All', value: 'all', sort: 'pnl' as SortField },
]

function filtersFromParams(params: URLSearchParams): TraderFilters {
  return {
    sort_by: (params.get('sort_by') as TraderFilters['sort_by']) ?? 'pnl',
    order: (params.get('order') as TraderFilters['order']) ?? 'desc',
    page: Number(params.get('page') ?? 1),
    search: params.get('search') ?? undefined,
    min_pnl: params.get('min_pnl') ? Number(params.get('min_pnl')) : undefined,
    max_pnl: params.get('max_pnl') ? Number(params.get('max_pnl')) : undefined,
    min_win_rate: params.get('min_win_rate') ? Number(params.get('min_win_rate')) : undefined,
    max_win_rate: params.get('max_win_rate') ? Number(params.get('max_win_rate')) : undefined,
    min_trades: params.get('min_trades') ? Number(params.get('min_trades')) : undefined,
    max_trades: params.get('max_trades') ? Number(params.get('max_trades')) : undefined,
    min_equity: params.get('min_equity') ? Number(params.get('min_equity')) : undefined,
    max_equity: params.get('max_equity') ? Number(params.get('max_equity')) : undefined,
  }
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const baseFilters = filtersFromParams(searchParams)
  const [activeTime, setActiveTime] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  const activeTab = TIME_TABS.find((t) => t.value === activeTime) ?? TIME_TABS[4]
  const pnlSortField = activeTab.sort

  const pnlFields = new Set<string>(['pnl', 'pnl_1d', 'pnl_7d', 'pnl_30d', 'pnl_90d'])
  const effectiveSortBy = pnlFields.has(baseFilters.sort_by) ? pnlSortField : baseFilters.sort_by
  const filters: TraderFilters = { ...baseFilters, sort_by: effectiveSortBy }

  const { data: tableData, isLoading: tableLoading } = useTraders(filters)
  const { data: stats } = useDashboardStats()
  useLiveTraderUpdates()

  function handleFilterChange(next: TraderFilters) {
    const params = new URLSearchParams()
    params.set('sort_by', next.sort_by)
    params.set('order', next.order)
    params.set('page', String(next.page))
    if (next.search) params.set('search', next.search)
    if (next.min_pnl !== undefined) params.set('min_pnl', String(next.min_pnl))
    if (next.max_pnl !== undefined) params.set('max_pnl', String(next.max_pnl))
    if (next.min_win_rate !== undefined) params.set('min_win_rate', String(next.min_win_rate))
    if (next.max_win_rate !== undefined) params.set('max_win_rate', String(next.max_win_rate))
    if (next.min_trades !== undefined) params.set('min_trades', String(next.min_trades))
    if (next.max_trades !== undefined) params.set('max_trades', String(next.max_trades))
    if (next.min_equity !== undefined) params.set('min_equity', String(next.min_equity))
    if (next.max_equity !== undefined) params.set('max_equity', String(next.max_equity))
    router.push(`/dashboard?${params.toString()}`)
  }

  function handleTimeChange(value: string) {
    setActiveTime(value)
    const tab = TIME_TABS.find((t) => t.value === value)!
    handleFilterChange({ ...filters, sort_by: tab.sort, order: 'desc', page: 1 })
  }

  const activeFilterCount = [
    filters.min_pnl, filters.max_pnl, filters.min_win_rate, filters.max_win_rate,
    filters.min_trades, filters.max_trades, filters.min_equity, filters.max_equity,
  ].filter((v) => v !== undefined).length

  return (
    <div className="flex h-full flex-col">
      {/* Cohort strip — dense, one row */}
      {stats?.cohorts && (
        <div className="flex-shrink-0 px-3 pt-3">
          <WalletCohorts cohorts={stats.cohorts} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line px-3 py-2">
        <h1 className="text-[13px] font-semibold text-fg">Traders</h1>
        <span className="num text-[11px] text-faint">
          {tableData?.total?.toLocaleString() ?? '—'} wallets
        </span>

        <Tabs
          items={TIME_TABS.map(({ label, value }) => ({ label, value }))}
          value={activeTime}
          onChange={handleTimeChange}
          variant="segmented"
          aria-label="PnL period"
          className="ml-auto"
        />

        <Button
          variant="secondary"
          size="sm"
          className="lg:hidden"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Hide' : 'Filters'}
          {activeFilterCount > 0 && <span className="num text-accent">{activeFilterCount}</span>}
        </Button>
      </div>

      {showFilters && (
        <div className="lg:hidden">
          <FilterPanel filters={filters} onChange={handleFilterChange} className="border-b" />
        </div>
      )}

      {/* Filters rail + table */}
      <div className="flex min-h-0 flex-1">
        <FilterPanel
          filters={filters}
          onChange={handleFilterChange}
          className="hidden w-[210px] flex-shrink-0 lg:flex"
        />
        <div className="min-w-0 flex-1">
          <TraderTable
            data={tableData}
            isLoading={tableLoading}
            filters={filters}
            onFilterChange={handleFilterChange}
            pnlField={pnlSortField}
          />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  if (!LEADERBOARD_ENABLED) return <CopyAWallet />
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
