/**
 * How much of a trader a follower can actually copy. Hyperliquid rejects
 * orders under $10, so the backend skips any share smaller than that
 * (MIN_POSITION_SIZE_USD) — on a small account, most of a big trader's
 * trades. This sizes the trader's recent trades to the follower, or their
 * open positions when they haven't traded lately.
 */
import type { HLFill } from '@/lib/hyperliquid'

/** Must match the backend's MIN_POSITION_SIZE_USD. */
export const MIN_ORDER_USD = 10

/** routes/copy.py accepts 0 < scaling_pct <= 1000. */
export const SCALE_LIMIT = 1000

/** The suggestion copies this share of the trader's trades (or positions),
 * by count: weighting by volume let a few huge trades hide that most were
 * skipped (106% suggested, 141 of 240 trades missed, 2026-10-26). */
const TRADES_COVERED = 0.8

/** Sizes are rounded down to the coin's lot (up to ~8% of $10 on BTC), so
 * the suggestion aims a little above the minimum. */
const LOT_HEADROOM = 1.1

export interface SizingCheck {
  /** What was sized: the trader's recent opening trades, or open positions. */
  basis: 'trades' | 'positions'
  total: number
  /** How many come out at or above the minimum at this scale. */
  copied: number
  /** Smallest scale copying 80% of them, or null when that would take
   * more than SCALE_LIMIT. */
  minPct: number | null
  /** The follower's total open position size at this scale, in USD, and as
   * a multiple of their equity. Null when the trader holds nothing. */
  exposure: number | null
  leverage: number | null
}

/** USD size of each fill that opened or added to a position. */
export function openingTradeValues(fills: HLFill[]): number[] {
  return fills
    .filter((f) => f.dir.startsWith('Open'))
    .map((f) => parseFloat(f.sz) * parseFloat(f.px))
    .filter((v) => v > 0)
}

export function checkSizing({
  myEquity,
  targetEquity,
  tradeValues,
  positionValues,
  scalingPct,
}: {
  myEquity: number
  targetEquity: number
  tradeValues: number[]
  positionValues: number[]
  scalingPct: number
}): SizingCheck | null {
  if (!(myEquity > 0) || !(targetEquity > 0)) return null
  const basis = tradeValues.length > 0 ? 'trades' : 'positions'
  const values = (basis === 'trades' ? tradeValues : positionValues)
    .map(Math.abs)
    .sort((a, b) => b - a)
  if (values.length === 0) return null
  const ratio = myEquity / targetEquity
  // The smallest of the largest TRADES_COVERED share
  const smallest = values[Math.ceil(values.length * TRADES_COVERED) - 1]
  const needed = ((MIN_ORDER_USD * LOT_HEADROOM) / (smallest * ratio)) * 100
  const minPct = Math.max(1, Math.ceil(needed - 1e-9)) // float noise shouldn't add a point

  const held = positionValues.reduce((s, v) => s + Math.abs(v), 0)
  const exposure = held > 0 ? held * ratio * (scalingPct / 100) : null

  return {
    basis,
    total: values.length,
    copied: values.filter((v) => v * ratio * (scalingPct / 100) >= MIN_ORDER_USD).length,
    minPct: minPct <= SCALE_LIMIT ? minPct : null,
    exposure,
    leverage: exposure === null ? null : exposure / myEquity,
  }
}
