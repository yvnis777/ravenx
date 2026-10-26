import { describe, it, expect } from 'vitest'
import { CLOSES_TAGGED_SINCE, copyIdOf, tradesByCopy, utcMs } from '@/lib/copy-fills'
import type { HLFill } from '@/lib/hyperliquid'

const tag = (id: number) => '0x' + id.toString(16).padStart(8, '0') + 'ab'.repeat(12)

function fill(over: Partial<HLFill>): HLFill {
  return {
    coin: 'ETH', px: '100', sz: '1', side: 'B', time: CLOSES_TAGGED_SINCE + 1_000,
    startPosition: '0', dir: 'Open Long', closedPnl: '0', hash: '', oid: 1,
    crossed: true, fee: '0.01', feeToken: 'USDC', ...over,
  }
}

describe('copyIdOf', () => {
  it('reads the copy id from a RavenX cloid', () => {
    expect(copyIdOf(tag(4))).toBe(4)
    expect(copyIdOf(tag(300))).toBe(300)
  })
  it('ignores missing and foreign ids', () => {
    expect(copyIdOf(undefined)).toBeNull()
    expect(copyIdOf('0x1234')).toBeNull()
    expect(copyIdOf('0x' + '0'.repeat(32))).toBeNull()
  })
})

describe('tradesByCopy', () => {
  it('sums each copy’s closed PnL and fees, newest fill first', () => {
    const t = tradesByCopy([
      fill({ cloid: tag(3), time: CLOSES_TAGGED_SINCE + 1 }),
      fill({ cloid: tag(3), time: CLOSES_TAGGED_SINCE + 2, dir: 'Close Long', closedPnl: '2.5' }),
      fill({ cloid: tag(4), coin: 'BTC' }),
    ])
    expect(t.get(3)).toMatchObject({ realized: 2.5, fees: 0.02 })
    expect(t.get(3)?.fills[0].dir).toBe('Close Long')
    expect(t.get(4)?.fills).toHaveLength(1)
  })

  it('puts an old untagged close on the one copy trading that coin', () => {
    const before = CLOSES_TAGGED_SINCE - 10_000
    const t = tradesByCopy([
      fill({ cloid: tag(4), coin: 'XMR', time: before - 5, dir: 'Open Short' }),
      fill({ coin: 'XMR', time: before, dir: 'Close Short', closedPnl: '2.518' }),
    ])
    expect(t.get(4)?.realized).toBeCloseTo(2.518)
  })

  it('leaves untagged fills alone after closes were tagged, or when copies share the coin', () => {
    const before = CLOSES_TAGGED_SINCE - 10_000
    const t = tradesByCopy([
      fill({ cloid: tag(3), time: before - 9 }),
      fill({ cloid: tag(4), time: before - 8 }),
      fill({ time: before, dir: 'Close Long', closedPnl: '5' }), // two copies on ETH
      fill({ cloid: tag(5), coin: 'BTC', time: before - 7 }),
      fill({ coin: 'BTC', dir: 'Close Long', closedPnl: '7' }), // after the fix: manual
    ])
    expect(t.get(3)?.realized).toBe(0)
    expect(t.get(4)?.realized).toBe(0)
    expect(t.get(5)?.realized).toBe(0)
  })
})

describe('utcMs', () => {
  it('reads the backend’s naive timestamps as UTC', () => {
    expect(utcMs('2026-10-25T21:35:00')).toBe(CLOSES_TAGGED_SINCE)
    expect(utcMs('2026-10-25T21:35:00Z')).toBe(CLOSES_TAGGED_SINCE)
    expect(utcMs(null)).toBeNull()
  })
})
