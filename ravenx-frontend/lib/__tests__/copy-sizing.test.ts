import { describe, it, expect } from 'vitest'
import { checkSizing, openingTradeValues } from '@/lib/copy-sizing'
import type { HLFill } from '@/lib/hyperliquid'

// A $50 follower of a $10,000 trader gets 0.5% of each trade at 100%.
const ME = 50
const TRADER = 10_000

function check(over: Partial<Parameters<typeof checkSizing>[0]>) {
  return checkSizing({
    myEquity: ME,
    targetEquity: TRADER,
    tradeValues: [],
    positionValues: [],
    scalingPct: 100,
    ...over,
  })
}

describe('checkSizing', () => {
  it('sizes recent trades first', () => {
    const c = check({ tradeValues: [1_000, 4_000], positionValues: [50_000] })
    expect(c).toMatchObject({ basis: 'trades', total: 2, copied: 1 }) // $5 and $20
  })

  it('falls back to open positions when the trader has not traded', () => {
    expect(check({ positionValues: [1_000, 4_000] })).toMatchObject({
      basis: 'positions',
      total: 2,
      copied: 1,
    })
  })

  it('suggests a scale that clears the minimum with room for lot rounding', () => {
    // $1,000 → $11 at 220%
    expect(check({ tradeValues: [4_000, 1_000] })?.minPct).toBe(220)
  })

  it('copies 80% of trades by count, so one tiny trade cannot inflate it', () => {
    // The $50 trade would need 2,200% on its own
    expect(check({ tradeValues: [9_000, 9_000, 9_000, 9_000, 50] })?.minPct).toBe(25)
  })

  it('is not fooled by a few huge trades', () => {
    // Volume is all in the $20,000 trade, but most trades are $200 ($1 at 100%)
    const c = check({ tradeValues: [20_000, 200, 200, 200, 200] })
    expect(c?.minPct).toBeNull() // $200 needs 1,100%
  })

  it('has no suggestion past the backend limit', () => {
    expect(check({ tradeValues: [100] })?.minPct).toBeNull()
  })

  it('reports open exposure as a multiple of equity', () => {
    // The trader holds 2x their equity; 300% of that is 6x
    const c = check({ tradeValues: [1_000], positionValues: [15_000, -5_000], scalingPct: 300 })
    expect(c?.exposure).toBeCloseTo(300)
    expect(c?.leverage).toBeCloseTo(6)
    expect(check({ tradeValues: [1_000] })?.exposure).toBeNull()
  })

  it('has nothing to say without both equities and something to size', () => {
    expect(check({ myEquity: 0, tradeValues: [1_000] })).toBeNull()
    expect(check({ targetEquity: 0, tradeValues: [1_000] })).toBeNull()
    expect(check({})).toBeNull()
  })
})

describe('openingTradeValues', () => {
  const fill = (dir: string, sz: string, px: string) => ({ dir, sz, px }) as HLFill

  it('keeps fills that open or add, in USD', () => {
    const fills = [
      fill('Open Long', '2', '50'),
      fill('Close Long', '2', '55'),
      fill('Open Short', '0.5', '100'),
      fill('Long > Short', '3', '60'),
    ]
    expect(openingTradeValues(fills)).toEqual([100, 50])
  })
})
