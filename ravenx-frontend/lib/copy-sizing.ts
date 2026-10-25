/**
 * How much of a trader a follower can actually copy. Hyperliquid rejects
 * orders under $10, so the backend skips any share smaller than that
 * (MIN_POSITION_SIZE_USD) — on a small account, most of a big trader's
 * positions. This sizes the trader's current positions to the follower.
 */

/** Must match the backend's MIN_POSITION_SIZE_USD. */
export const MIN_ORDER_USD = 10

/** routes/copy.py accepts 0 < scaling_pct <= 1000. */
export const SCALE_LIMIT = 1000

/** The suggestion covers the positions that make up this share of the
 * trader's exposure, so one dust position can't inflate it. */
const EXPOSURE_COVERED = 0.9

/** Sizes are rounded down to the coin's lot (up to ~8% of $10 on BTC), so
 * the suggestion aims a little above the minimum. */
const LOT_HEADROOM = 1.1

export interface SizingCheck {
  /** The trader's open positions. */
  total: number
  /** How many of them come out at or above the minimum at this scale. */
  copied: number
  /** Smallest scale copying the positions behind 90% of the trader's
   * exposure, or null when that would take more than SCALE_LIMIT. */
  minPct: number | null
  /** The follower's total position size at this scale, in USD. */
  exposure: number
  /** That exposure as a multiple of the follower's equity. */
  leverage: number
}

export function checkSizing(
  myEquity: number,
  targetEquity: number,
  positionValues: number[],
  scalingPct: number
): SizingCheck | null {
  if (!(myEquity > 0) || !(targetEquity > 0) || positionValues.length === 0) return null
  const ratio = myEquity / targetEquity
  const values = positionValues.map(Math.abs).sort((a, b) => b - a)
  const sum = values.reduce((s, v) => s + v, 0)

  // The smallest position still needed to cover EXPOSURE_COVERED of the total
  let covered = 0
  let smallest = values[0]
  for (const v of values) {
    smallest = v
    covered += v
    if (covered >= sum * EXPOSURE_COVERED) break
  }
  const needed = ((MIN_ORDER_USD * LOT_HEADROOM) / (smallest * ratio)) * 100
  const minPct = Math.max(1, Math.ceil(needed - 1e-9)) // float noise shouldn't add a point
  const exposure = sum * ratio * (scalingPct / 100)

  return {
    total: values.length,
    copied: values.filter((v) => v * ratio * (scalingPct / 100) >= MIN_ORDER_USD).length,
    minPct: minPct <= SCALE_LIMIT ? minPct : null,
    exposure,
    leverage: exposure / myEquity,
  }
}
