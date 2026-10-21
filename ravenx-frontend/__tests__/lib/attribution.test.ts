import { describe, it, expect } from 'vitest'
import { attribute, type CopyShare } from '@/lib/attribution'
import type { OpenPosition } from '@/types'

// BTC at mark 100: value / |szi| = 100.
const pos = (coin: string, szi: number, entry = 90, mark = 100): OpenPosition => ({
  coin, szi, entry_px: entry, position_value: Math.abs(szi) * mark,
  upnl: szi * (mark - entry), liq_px: null, leverage: 5, margin_used: 1,
})
const share = (subscription_id: number, coin: string, szi: number, entry_px = 95): CopyShare => ({
  subscription_id, coin, szi, entry_px,
})

describe('attribute', () => {
  it('a position fully opened by one copy', () => {
    const { rows, orphans } = attribute([pos('BTC', 1)], [share(1, 'BTC', 1)])
    expect(rows[0].sources).toEqual([{ subscription_id: 1, szi: 1 }])
    expect(rows[0].manualSzi).toBe(0)
    expect(rows[0].mismatch).toBe(false)
    expect(orphans).toEqual([])
  })

  it('splits one position between two copies and a manual remainder', () => {
    const { rows } = attribute([pos('BTC', 2)], [share(1, 'BTC', 0.5), share(2, 'BTC', 1)])
    expect(rows[0].sources.map((s) => s.subscription_id)).toEqual([1, 2])
    expect(rows[0].manualSzi).toBeCloseTo(0.5)
  })

  it('a position RavenX never opened is all manual', () => {
    const { rows } = attribute([pos('ETH', -3)], [])
    expect(rows[0].sources).toEqual([])
    expect(rows[0].manualSzi).toBe(-3)
  })

  it('a recorded share with no position on HL is an orphan', () => {
    const { rows, orphans } = attribute([], [share(1, 'SOL', 4)])
    expect(rows).toEqual([])
    expect(orphans).toEqual([share(1, 'SOL', 4)])
  })

  it('a share on the opposite side of the HL position is an orphan', () => {
    const { rows, orphans } = attribute([pos('BTC', -1)], [share(1, 'BTC', 1)])
    expect(rows[0].sources).toEqual([])
    expect(orphans).toHaveLength(1)
  })

  it('flags more recorded than held', () => {
    const { rows } = attribute([pos('BTC', 1)], [share(1, 'BTC', 1.5)])
    expect(rows[0].mismatch).toBe(true)
    expect(rows[0].manualSzi).toBe(0)
  })

  it('sums each copy: positions, exposure at mark, and uPnL of its own share', () => {
    const { perCopy } = attribute(
      [pos('BTC', 2, 90, 100), pos('ETH', -10, 20, 18)],
      [share(1, 'BTC', 1, 95), share(1, 'ETH', -5, 19), share(2, 'BTC', 1, 80), share(2, 'DOGE', 3)],
    )
    const one = perCopy.get(1)!
    expect(one.positions).toBe(2)
    expect(one.exposure).toBeCloseTo(1 * 100 + 5 * 18)
    expect(one.upnl).toBeCloseTo(1 * (100 - 95) + -5 * (18 - 19))
    const two = perCopy.get(2)!
    expect(two.positions).toBe(2)          // BTC + the orphaned DOGE share
    expect(two.exposure).toBeCloseTo(100)  // DOGE has no mark: not counted
    expect(two.upnl).toBeCloseTo(20)
  })
})
