// components/dashboard/TraderTable.tsx
'use client'
import { TraderRow } from './TraderRow'
import { Button } from '@/components/ui/Button'
import type { TradersResponse, TraderFilters, SortField } from '@/types'

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i)
  }
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

const PNL_LABELS: Record<string, string> = {
  pnl: 'PnL',
  pnl_1d: '1D PnL',
  pnl_7d: '7D PnL',
  pnl_30d: '30D PnL',
  pnl_90d: '90D PnL',
}

interface TraderTableProps {
  data?: TradersResponse
  isLoading: boolean
  filters: TraderFilters
  onFilterChange: (f: TraderFilters) => void
  pnlField?: SortField
}

const HIDE_CLASS: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
}

export function TraderTable({
  data,
  isLoading,
  filters,
  onFilterChange,
  pnlField = 'pnl',
}: TraderTableProps) {
  const columns: {
    key: SortField | 'rank' | 'address' | 'copy' | 'trend'
    label: string
    sortable: boolean
    tooltip?: string
    hideBelow?: 'sm' | 'md'
    align?: 'right'
  }[] = [
    { key: 'copy', label: '', sortable: false },
    { key: 'rank', label: '#', sortable: false },
    { key: 'address', label: 'Trader', sortable: false },
    { key: pnlField, label: PNL_LABELS[pnlField] ?? 'PnL', sortable: true, align: 'right' },
    { key: 'trend', label: 'Trend', sortable: false, hideBelow: 'sm' },
    { key: 'win_rate', label: 'Win Rate', sortable: true, tooltip: 'Percentage of winning trades' },
    {
      key: 'growth_rate',
      label: 'Growth',
      sortable: true,
      tooltip: 'PnL vs account equity for the period',
      hideBelow: 'md',
      align: 'right',
    },
    { key: 'trade_count', label: 'Trades', sortable: true, hideBelow: 'md', align: 'right' },
    { key: 'perp_equity', label: 'Equity', sortable: true, align: 'right' },
  ]

  function handleSort(key: SortField) {
    if (filters.sort_by === key) {
      onFilterChange({ ...filters, order: filters.order === 'desc' ? 'asc' : 'desc', page: 1 })
    } else {
      onFilterChange({ ...filters, sort_by: key, order: 'desc', page: 1 })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line">
              {columns.map(({ key, label, sortable, tooltip, hideBelow, align }) => {
                const isSorted = filters.sort_by === key
                return (
                  <th
                    key={key}
                    onClick={() => sortable && handleSort(key as SortField)}
                    title={tooltip}
                    aria-sort={
                      isSorted ? (filters.order === 'desc' ? 'descending' : 'ascending') : undefined
                    }
                    className={`h-[30px] px-3 text-[10px] font-semibold uppercase tracking-wider
                      ${align === 'right' ? 'text-right' : ''}
                      ${sortable ? 'cursor-pointer select-none hover:text-muted' : ''}
                      ${isSorted ? 'text-accent' : 'text-faint'}
                      ${hideBelow ? HIDE_CLASS[hideBelow] : ''}`}
                  >
                    {label}
                    {sortable && isSorted && (
                      <span aria-hidden="true" className="ml-1">
                        {filters.order === 'desc' ? '▾' : '▴'}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 16 }).map((_, i) => (
                <tr key={i} className="animate-pulse border-b border-line">
                  {columns.map((c) => (
                    <td key={c.key} className="h-[var(--row-h)] px-3">
                      <div className="h-2.5 w-16 rounded bg-raised" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.traders.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-16 text-center text-muted">
                  {filters.search
                    ? `No traders match “${filters.search}”.`
                    : 'No traders found — try adjusting your filters.'}
                </td>
              </tr>
            ) : (
              data?.traders.map((trader, i) => (
                <TraderRow
                  key={trader.address}
                  trader={trader}
                  rank={(filters.page - 1) * 20 + i + 1}
                  pnlField={pnlField}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex flex-shrink-0 items-center justify-between border-t border-line bg-panel px-3 py-1.5">
          <p className="num text-[11px] text-faint" aria-live="polite" aria-atomic="true">
            Page {data.page} / {data.pages} — {data.total.toLocaleString()} traders
          </p>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => onFilterChange({ ...filters, page: filters.page - 1 })}
              aria-label="Previous page"
            >
              ←
            </Button>
            {generatePageNumbers(data.page, data.pages).map((p, i) =>
              p === '...' ? (
                <span key={`dots-${i}`} className="px-1 text-xs text-faint">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === data.page ? 'primary' : 'ghost'}
                  size="sm"
                  className="num"
                  onClick={() => onFilterChange({ ...filters, page: p as number })}
                >
                  {p}
                </Button>
              )
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={filters.page >= data.pages}
              onClick={() => onFilterChange({ ...filters, page: filters.page + 1 })}
              aria-label="Next page"
            >
              →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
