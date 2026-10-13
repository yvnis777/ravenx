'use client'
import { redirect, useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StatTile } from '@/components/ui/StatTile'
import { Panel } from '@/components/ui/Panel'
import type { Trader } from '@/types'
import { LEADERBOARD_ENABLED } from '@/lib/features'

interface CohortStats {
  count: number
  bias: string
  avg_upnl: number
  total_upnl: number
  avg_equity: number
  total_equity: number
  avg_pnl: number
  avg_win_rate: number
}

interface CohortResponse {
  name: string
  emoji: string
  label: string
  stats: CohortStats
  top_coins: { coin: string; count: number }[]
  traders: Trader[]
  total: number
  page: number
  pages: number
  per_page: number
}

type SortField = 'perp_equity' | 'upnl' | 'pnl' | 'win_rate' | 'trade_count'

function fmtUsd(n: number | null | undefined) {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : '−'
  return `${sign}$${new Intl.NumberFormat('en-US').format(Math.abs(Math.round(n)))}`
}

function fmtCompact(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${Math.round(abs).toLocaleString()}`
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function biasTone(bias: string) {
  if (bias.includes('Bullish')) return 'text-profit'
  if (bias.includes('Bearish')) return 'text-loss'
  return 'text-faint'
}

const COHORT_NAMES: Record<string, string> = {
  shrimp: 'Shrimp',
  fish: 'Fish',
  dolphin: 'Dolphin',
  shark: 'Shark',
  whale: 'Whale',
  'mega-whale': 'Mega Whale',
}

const TH = 'h-[26px] px-3 text-[10px] font-semibold uppercase tracking-wider'
const TD = 'num h-[var(--row-h)] px-3 text-xs'

export default function CohortPage() {
  if (!LEADERBOARD_ENABLED) redirect('/dashboard')
  return <CohortContent />
}

function CohortContent() {
  const { name } = useParams<{ name: string }>()
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortField>('perp_equity')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  const { data, isLoading } = useQuery({
    queryKey: ['cohort', name, page, sortBy, order],
    queryFn: async () => {
      const { data } = await api.get<CohortResponse>(
        `/dashboard/cohorts/${name}?page=${page}&sort_by=${sortBy}&order=${order}&per_page=20`
      )
      return data
    },
    enabled: !!name,
  })

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setOrder(order === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(field)
      setOrder('desc')
    }
    setPage(1)
  }

  if (isLoading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">Cohort not found.</p>
        <Button variant="secondary" onClick={() => router.push('/dashboard')}>
          ← Back to dashboard
        </Button>
      </div>
    )
  }

  const s = data.stats

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <button
          onClick={() => router.push('/dashboard')}
          aria-label="Back to dashboard"
          className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-line
            text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          ←
        </button>
        <span aria-hidden="true" className="text-base">
          {data.emoji}
        </span>
        <h1 className="text-[13px] font-semibold text-fg">{COHORT_NAMES[name] ?? name}</h1>
        <span className="num text-[11px] text-faint">{data.label}</span>
        <span className="num text-[11px] text-faint">
          {s.count.toLocaleString()} wallets
        </span>
        <span className={`ml-auto text-xs font-medium ${biasTone(s.bias)}`}>{s.bias}</span>
      </header>

      {/* Stat strip */}
      <div className="grid flex-shrink-0 grid-cols-2 gap-3 border-b border-line p-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Wallets" value={s.count.toLocaleString()} />
        <StatTile label="Avg equity" value={fmtCompact(s.avg_equity)} />
        <StatTile label="Total equity" value={fmtCompact(s.total_equity)} />
        <StatTile
          label="Avg uPnL"
          value={fmtUsd(s.avg_upnl)}
          tone={s.avg_upnl >= 0 ? 'profit' : 'loss'}
        />
        <StatTile
          label="Avg PnL"
          value={fmtUsd(s.avg_pnl)}
          tone={s.avg_pnl >= 0 ? 'profit' : 'loss'}
        />
        <StatTile label="Avg win rate" value={fmtPct(s.avg_win_rate)} />
      </div>

      {/* Coins + summary */}
      <div className="grid flex-shrink-0 grid-cols-1 gap-3 p-3 lg:grid-cols-2">
        <Panel title="Top 10 open perps">
          <div className="flex flex-wrap gap-1.5">
            {data.top_coins.map(({ coin, count }) => (
              <span
                key={coin}
                className="num flex items-center gap-1.5 rounded border border-line bg-raised px-2 py-1 text-xs"
              >
                <span className="font-medium text-fg">{coin}</span>
                <span className="text-faint">{count}</span>
              </span>
            ))}
            {data.top_coins.length === 0 && <p className="text-xs text-faint">No positions</p>}
          </div>
        </Panel>

        <Panel title="Cohort summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Total uPnL"
              value={fmtCompact(s.total_upnl)}
              tone={s.total_upnl >= 0 ? 'profit' : 'loss'}
            />
            <StatTile label="Bias" value={s.bias} />
            <StatTile
              label="Avg PnL"
              value={fmtUsd(s.avg_pnl)}
              tone={s.avg_pnl >= 0 ? 'profit' : 'loss'}
            />
            <StatTile label="Avg win rate" value={fmtPct(s.avg_win_rate)} />
          </div>
        </Panel>
      </div>

      {/* Wallets */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-line">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="border-b border-line">
                <th className={`${TH} text-faint`}>#</th>
                <th className={`${TH} text-faint`}>Address</th>
                {(
                  [
                    ['perp_equity', 'Perp equity'],
                    ['upnl', 'uPnL'],
                    ['pnl', 'All-time PnL'],
                    ['win_rate', 'Win rate'],
                    ['trade_count', 'Trades'],
                  ] as [SortField, string][]
                ).map(([field, label]) => (
                  <th
                    key={field}
                    onClick={() => handleSort(field)}
                    aria-sort={
                      sortBy === field
                        ? order === 'desc'
                          ? 'descending'
                          : 'ascending'
                        : undefined
                    }
                    className={`${TH} cursor-pointer select-none text-right hover:text-muted ${
                      sortBy === field ? 'text-accent' : 'text-faint'
                    }`}
                  >
                    {label}
                    {sortBy === field && (
                      <span aria-hidden="true" className="ml-1">
                        {order === 'desc' ? '▾' : '▴'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.traders.map((t, i) => (
                <tr
                  key={t.address}
                  onClick={() => router.push(`/traders/${t.address}`)}
                  className="cursor-pointer border-b border-line transition-colors hover:bg-raised"
                >
                  <td className={`${TD} text-faint`}>{(page - 1) * 20 + i + 1}</td>
                  <td className={`${TD} text-fg`}>{t.display_name ?? truncate(t.address)}</td>
                  <td className={`${TD} text-right text-muted`}>
                    ${Math.round(t.perp_equity ?? 0).toLocaleString()}
                  </td>
                  <td
                    className={`${TD} text-right font-medium ${
                      (t.upnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'
                    }`}
                  >
                    {fmtUsd(t.upnl)}
                  </td>
                  <td
                    className={`${TD} text-right font-medium ${
                      (t.pnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'
                    }`}
                  >
                    {fmtUsd(t.pnl)}
                  </td>
                  <td className={`${TD} text-right text-muted`}>{fmtPct(t.win_rate)}</td>
                  <td className={`${TD} text-right text-muted`}>{t.trade_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.pages > 1 && (
          <div className="flex flex-shrink-0 items-center justify-between border-t border-line bg-panel px-3 py-1.5">
            <p className="num text-[11px] text-faint">
              Page {data.page} / {data.pages} — {data.total.toLocaleString()} wallets
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ← Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
