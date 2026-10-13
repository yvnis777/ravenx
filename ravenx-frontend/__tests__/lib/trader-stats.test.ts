import { describe, it, expect } from 'vitest'
import { fillsCoverStart, periodPnl, tradeStats } from '@/lib/trader-stats'
import type { HLFill, HLPortfolio } from '@/lib/hyperliquid'

const T0 = 1_790_000_000_000

const portfolio: HLPortfolio = {
  perpMonth: {
    accountValueHistory: [[T0, '10000'], [T0 + 3_600_000, '11000'], [T0 + 7_200_000, '12500']],
    pnlHistory: [[T0, '0'], [T0 + 3_600_000, '1000'], [T0 + 7_200_000, '2500']],
    vlm: '50000',
  },
  perpDay: {
    accountValueHistory: [[T0, '0'], [T0 + 60_000, '0']],
    pnlHistory: [[T0, '0'], [T0 + 60_000, '0']],
    vlm: '0',
  },
}

describe('periodPnl', () => {
  it('reads the perps series for the period, in seconds', () => {
    const r = periodPnl(portfolio, '30d')
    expect(r.pnl).toBe(2500)
    expect(r.data).toEqual([
      { time: T0 / 1000, value: 0 },
      { time: T0 / 1000 + 3600, value: 1000 },
      { time: T0 / 1000 + 7200, value: 2500 },
    ])
  })

  it('growth is PnL over the account value at the start of the period', () => {
    expect(periodPnl(portfolio, '30d').growth).toBeCloseTo(0.25)
  })

  it('growth is null when the period starts with an empty account', () => {
    expect(periodPnl(portfolio, '1d').growth).toBeNull()
  })

  it('growth uses the peak balance when deposits dwarf the starting one', () => {
    const deposited: HLPortfolio = {
      perpWeek: {
        accountValueHistory: [[T0, '5'], [T0 + 60_000, '1000'], [T0 + 120_000, '974']],
        pnlHistory: [[T0, '0'], [T0 + 60_000, '0'], [T0 + 120_000, '-26']],
        vlm: '1',
      },
    }
    expect(periodPnl(deposited, '7d').growth).toBeCloseTo(-0.026)
  })

  it('is empty when the period is missing', () => {
    expect(periodPnl(portfolio, '7d')).toEqual({ data: [], pnl: 0, growth: null })
  })
})

const fill = (closedPnl: string, dir: string): HLFill =>
  ({ closedPnl, dir, side: 'A', time: T0 } as HLFill)

describe('tradeStats', () => {
  it('counts closing fills as trades and splits PnL by side', () => {
    const s = tradeStats([
      fill('100', 'Close Long'),
      fill('-40', 'Close Long'),
      fill('25', 'Close Short'),
      fill('0', 'Open Long'), // opening fills are not trades
    ])
    expect(s).toEqual({ trades: 3, wins: 2, losses: 1, winRate: 2 / 3, longPnl: 60, shortPnl: 25 })
  })

  it('has a null win rate with no closed trades', () => {
    expect(tradeStats([fill('0', 'Open Long')]).winRate).toBeNull()
  })
})

describe('fillsCoverStart', () => {
  const LATE = T0 + 5 * 3_600_000

  it('is null when the fills reach the start of the period', () => {
    expect(fillsCoverStart(T0, T0 + 60_000, 9000)).toBeNull()
  })

  it('is the oldest fill when HL may have capped the history', () => {
    expect(fillsCoverStart(T0, LATE, 10_000)).toBe(LATE)
  })

  it('is null for a wallet with too few fills to be capped', () => {
    expect(fillsCoverStart(T0, LATE, 101)).toBeNull()
  })

  it('is null with no fills', () => {
    expect(fillsCoverStart(T0, null, 0)).toBeNull()
  })
})
