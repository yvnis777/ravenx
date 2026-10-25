import { describe, it, expect } from 'vitest'
import { checkSizing } from '@/lib/copy-sizing'

// A $50 follower of a $10,000 trader gets 0.5% of each position at 100%.
const ME = 50
const TRADER = 10_000

describe('checkSizing', () => {
  it('counts the positions that clear the $10 minimum', () => {
    const check = checkSizing(ME, TRADER, [1_000, 4_000], 100)
    expect(check).toMatchObject({ total: 2, copied: 1 }) // $5 and $20
  })

  it('suggests a scale that clears the minimum with room for lot rounding', () => {
    // $1,000 → $11 at 220%
    expect(checkSizing(ME, TRADER, [4_000, 1_000], 100)?.minPct).toBe(220)
  })

  it('ignores dust that makes up the last 10% of exposure', () => {
    // The $50 position would need 2,200% on its own
    expect(checkSizing(ME, TRADER, [9_000, 50], 100)?.minPct).toBe(25) // $9,000 → $11.25
  })

  it('has no suggestion past the backend limit', () => {
    expect(checkSizing(ME, TRADER, [100], 100)?.minPct).toBeNull()
  })

  it('reports exposure as a multiple of equity', () => {
    // The trader is 2x levered; 300% of that is 6x
    const check = checkSizing(ME, TRADER, [15_000, -5_000], 300)
    expect(check?.exposure).toBeCloseTo(300)
    expect(check?.leverage).toBeCloseTo(6)
  })

  it('has nothing to say without both equities and some positions', () => {
    expect(checkSizing(0, TRADER, [1_000], 100)).toBeNull()
    expect(checkSizing(ME, 0, [1_000], 100)).toBeNull()
    expect(checkSizing(ME, TRADER, [], 100)).toBeNull()
  })
})
