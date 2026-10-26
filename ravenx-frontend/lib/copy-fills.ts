/**
 * Splits the user's fills on HL by the copy that made them. Every order the
 * copy engine sends carries a cloid whose first 4 bytes are the copy's id
 * (copy_service._cloid_for_sub), so a fill names its copy.
 */
import type { HLFill } from '@/lib/hyperliquid'

/**
 * Closes carried no cloid before this deploy. An older untagged fill is put on
 * a copy when exactly one copy had traded that coin before it; after it, an
 * untagged fill is the user's own trading.
 */
export const CLOSES_TAGGED_SINCE = Date.UTC(2026, 9, 25, 21, 35)

export interface CopyTrades {
  /** Newest first. */
  fills: HLFill[]
  /** Closed PnL, before fees. */
  realized: number
  fees: number
}

/** The copy id in a cloid, or null for an order RavenX didn't tag. */
export function copyIdOf(cloid: string | undefined): number | null {
  if (!cloid || !/^0x[0-9a-f]{32}$/i.test(cloid)) return null
  const id = parseInt(cloid.slice(2, 10), 16)
  return id > 0 ? id : null
}

/** The backend's naive UTC timestamps, in ms. */
export function utcMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)
}

export function tradesByCopy(fills: HLFill[]): Map<number, CopyTrades> {
  const result = new Map<number, CopyTrades>()
  const add = (id: number, f: HLFill) => {
    const t = result.get(id) ?? { fills: [], realized: 0, fees: 0 }
    t.fills.push(f)
    t.realized += parseFloat(f.closedPnl) || 0
    t.fees += parseFloat(f.fee) || 0
    result.set(id, t)
  }

  // Oldest first, so "traded this coin before" is known when a fill comes up
  const ordered = [...fills].sort((a, b) => a.time - b.time)
  const copiesOnCoin = new Map<string, Set<number>>()
  for (const f of ordered) {
    const id = copyIdOf(f.cloid)
    if (id !== null) {
      add(id, f)
      copiesOnCoin.set(f.coin, (copiesOnCoin.get(f.coin) ?? new Set()).add(id))
      continue
    }
    const candidates = copiesOnCoin.get(f.coin)
    if (f.time < CLOSES_TAGGED_SINCE && f.dir.startsWith('Close') && candidates?.size === 1) {
      add([...candidates][0], f)
    }
  }
  for (const t of result.values()) t.fills.reverse()
  return result
}
