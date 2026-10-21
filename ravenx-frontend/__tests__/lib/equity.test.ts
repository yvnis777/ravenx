import { describe, it, expect, vi, beforeEach } from 'vitest'
import { accountEquity, fetchAccountEquity } from '@/lib/hyperliquid'

const perps = (accountValue: string) =>
  ({ marginSummary: { accountValue, totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' } }) as any
const spot = (usdc: string, extra: Record<string, string> = {}) => ({
  balances: [
    { coin: 'USDC', total: usdc },
    ...Object.entries(extra).map(([coin, total]) => ({ coin, total })),
  ],
})

describe('accountEquity', () => {
  it('unified account: the spot USDC total, not the perps collateral', () => {
    // Target 2 on 2026-10-21: perps said $47.6k, the account held $83.2k.
    expect(accountEquity('unifiedAccount', perps('47641.31'), spot('83235.03', { HFUN: '10999' })))
      .toBeCloseTo(83235.03)
  })

  it('portfolio margin reads like unified', () => {
    expect(accountEquity('portfolioMargin', perps('1'), spot('500'))).toBe(500)
  })

  it('standard account: the perps account value', () => {
    expect(accountEquity('disabled', perps('1234.5'), spot('999'))).toBe(1234.5)
  })
})

describe('fetchAccountEquity', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('only fetches the spot state for unified accounts', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      calls.push(body.type)
      const data = body.type === 'userAbstraction' ? 'disabled' : spot('0')
      return { ok: true, json: async () => data } as Response
    }))
    expect(await fetchAccountEquity('0xabc', perps('42'))).toBe(42)
    expect(calls).toEqual(['userAbstraction'])
  })

  it('unified: reads USDC from the spot state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      const data = body.type === 'userAbstraction' ? 'unifiedAccount' : spot('49.8')
      return { ok: true, json: async () => data } as Response
    }))
    expect(await fetchAccountEquity('0xabc', perps('0'))).toBeCloseTo(49.8)
  })
})
