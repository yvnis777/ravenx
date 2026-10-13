'use client'
import { useRouter } from 'next/navigation'
import type { Cohort } from '@/hooks/useDashboardStats'

function biasTone(bias: string) {
  if (bias.includes('Bullish')) return 'text-profit'
  if (bias.includes('Bearish')) return 'text-loss'
  return 'text-faint'
}

function biasArrow(bias: string) {
  if (bias.includes('Very Bullish')) return '↑↑'
  if (bias.includes('Bullish')) return '↑'
  if (bias.includes('Very Bearish')) return '↓↓'
  if (bias.includes('Bearish')) return '↓'
  return '→'
}

const COHORT_SLUGS: Record<string, string> = {
  Shrimp: 'shrimp',
  Fish: 'fish',
  Dolphin: 'dolphin',
  Shark: 'shark',
  Whale: 'whale',
  'Mega Whale': 'mega-whale',
}

/** Dense cohort strip — six tiles on one row, no wasted vertical space. */
export function WalletCohorts({ cohorts }: { cohorts: Cohort[] }) {
  const router = useRouter()

  if (cohorts.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-panel px-3 py-2">
            <div className="mb-1.5 h-3 w-16 rounded bg-raised" />
            <div className="h-3 w-20 rounded bg-raised" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {cohorts.map((c) => (
        <button
          key={c.name}
          onClick={() => router.push(`/cohorts/${COHORT_SLUGS[c.name] ?? c.name.toLowerCase()}`)}
          className="group bg-panel px-3 py-2 text-left transition-colors hover:bg-raised"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
              <span aria-hidden="true">{c.emoji}</span>
              {c.name}
            </span>
            <span className={`text-[11px] ${biasTone(c.bias)}`} title={c.bias}>
              {biasArrow(c.bias)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-faint">
            <span className="num">{c.count.toLocaleString()} wallets</span>
            <span className={`num ${c.avg_upnl >= 0 ? 'text-profit' : 'text-loss'}`}>
              {c.avg_upnl >= 0 ? '+' : '−'}${Math.abs(Math.round(c.avg_upnl)).toLocaleString()}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
