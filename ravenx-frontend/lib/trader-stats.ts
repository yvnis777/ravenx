// lib/trader-stats.ts
// Trader-page figures derived from raw Hyperliquid data. Pure, so they're tested directly.
import type { HLFill, HLPortfolio } from '@/lib/hyperliquid'

export type StatsPeriod = '1d' | '7d' | '30d' | 'all'

// Perps-only windows: RavenX copies perps, so spot PnL would mislead.
const PORTFOLIO_WINDOW: Record<StatsPeriod, string> = {
  '1d': 'perpDay',
  '7d': 'perpWeek',
  '30d': 'perpMonth',
  all: 'perpAllTime',
}

export const PERIOD_MS: Record<StatsPeriod, number | null> = {
  '1d': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  all: null,
}

export interface PeriodPnl {
  /** Cumulative PnL, `time` in seconds for lightweight-charts. */
  data: { time: number; value: number }[]
  pnl: number
  /** PnL over the capital at work (see periodPnl); null for an account that was always empty. */
  growth: number | null
}

export function periodPnl(portfolio: HLPortfolio, period: StatsPeriod): PeriodPnl {
  const window = portfolio[PORTFOLIO_WINDOW[period]]
  if (!window || window.pnlHistory.length === 0) return { data: [], pnl: 0, growth: null }

  // lightweight-charts needs strictly increasing times: keep the last value per second.
  const bySecond = new Map<number, number>()
  for (const [t, v] of window.pnlHistory) bySecond.set(Math.floor(t / 1000), parseFloat(v))
  const data = [...bySecond].sort(([a], [b]) => a - b).map(([time, value]) => ({ time, value }))
  const pnl = data[data.length - 1].value
  // PnL over the starting balance — unless deposits during the period dwarf it
  // ($5 → $1,000 would turn a -$26 loss into -520%); then over the peak balance.
  const values = window.accountValueHistory.map(([, v]) => parseFloat(v))
  const startValue = values[0] ?? 0
  const peakValue = Math.max(0, ...values)
  const base = startValue >= peakValue / 2 ? startValue : peakValue
  return { data, pnl, growth: base > 0 ? pnl / base : null }
}

export interface TradeStats {
  trades: number
  wins: number
  losses: number
  winRate: number | null
  longPnl: number
  shortPnl: number
}

/** A trade is a fill that realised PnL — i.e. one that closed (part of) a position. */
export function tradeStats(fills: HLFill[]): TradeStats {
  let wins = 0, losses = 0, longPnl = 0, shortPnl = 0
  for (const f of fills) {
    const pnl = parseFloat(f.closedPnl)
    if (pnl === 0) continue
    if (pnl > 0) wins++
    else losses++
    if (f.dir.includes('Long')) longPnl += pnl
    else if (f.dir.includes('Short')) shortPnl += pnl
    else if (f.side === 'A') longPnl += pnl // a sell closing a long
    else shortPnl += pnl
  }
  const trades = wins + losses
  return { trades, wins, losses, winRate: trades > 0 ? wins / trades : null, longPnl, shortPnl }
}

/**
 * Where trade stats really start, when HL's 10,000-fill cap may have cut the period
 * short; null when the fills cover it. Under one 2,000-fill page nothing was cut.
 */
export function fillsCoverStart(periodStart: number, oldest: number | null, count: number): number | null {
  if (oldest === null || count < 2000) return null
  return oldest - periodStart > 3_600_000 ? oldest : null
}
