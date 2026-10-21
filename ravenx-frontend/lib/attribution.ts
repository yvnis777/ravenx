/**
 * Matches the live positions on the user's HL account to the shares each copy
 * recorded for itself (GET /copy/positions). Several copies can share one
 * coin's position, and the user may also hold some of it themselves.
 */
import type { OpenPosition } from '@/types'

/** One copy's recorded share of one coin, as the backend tracks it. */
export interface CopyShare {
  subscription_id: number
  coin: string
  szi: number
  entry_px: number
}

export interface PositionRow {
  position: OpenPosition
  /** Mark price, from HL's position value. */
  mark: number
  /** The copies holding part of this position, on its side. */
  sources: { subscription_id: number; szi: number }[]
  /** The part no copy opened: the user's own trading. */
  manualSzi: number
  /** The copies record more than HL holds: something closed outside RavenX. */
  mismatch: boolean
}

export interface CopySummary {
  /** Coins this copy holds a share of, including shares missing on HL. */
  positions: number
  /** |share| × mark, over shares HL actually holds. */
  exposure: number
  /** share × (mark − the share's own entry). */
  upnl: number
}

const EPS = 1e-9

export function attribute(positions: OpenPosition[], shares: CopyShare[]) {
  const rows: PositionRow[] = []
  const orphans: CopyShare[] = []
  const perCopy = new Map<number, CopySummary>()
  const summary = (id: number) => {
    if (!perCopy.has(id)) perCopy.set(id, { positions: 0, exposure: 0, upnl: 0 })
    return perCopy.get(id)!
  }

  const byCoin = new Map(positions.map((p) => [p.coin, p]))
  const sharesByCoin = new Map<string, CopyShare[]>()
  for (const s of shares) {
    summary(s.subscription_id).positions += 1
    sharesByCoin.set(s.coin, [...(sharesByCoin.get(s.coin) ?? []), s])
  }

  for (const p of positions) {
    const mark = p.position_value && p.szi ? p.position_value / Math.abs(p.szi) : 0
    const sameSide = (sharesByCoin.get(p.coin) ?? []).filter((s) => Math.sign(s.szi) === Math.sign(p.szi))
    const recorded = sameSide.reduce((sum, s) => sum + Math.abs(s.szi), 0)
    const mismatch = recorded > Math.abs(p.szi) + EPS
    const manualAbs = mismatch ? 0 : Math.abs(p.szi) - recorded

    for (const s of sameSide) {
      const c = summary(s.subscription_id)
      c.exposure += Math.abs(s.szi) * mark
      c.upnl += s.szi * (mark - s.entry_px)
    }
    rows.push({
      position: p,
      mark,
      sources: sameSide.map((s) => ({ subscription_id: s.subscription_id, szi: s.szi })),
      manualSzi: manualAbs < EPS ? 0 : Math.sign(p.szi) * manualAbs,
      mismatch,
    })
  }

  for (const s of shares) {
    const held = byCoin.get(s.coin)
    if (!held || Math.sign(held.szi) !== Math.sign(s.szi)) orphans.push(s)
  }

  return { rows, orphans, perCopy }
}
