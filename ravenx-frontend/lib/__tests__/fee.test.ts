import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('ADVERTISED_FEE', () => {
  it('is 0% when no builder is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILDER_ADDRESS', '')
    const fee = await import('@/lib/fee')
    expect(fee.FEES_ENABLED).toBe(false)
    expect(fee.ADVERTISED_FEE).toBe('0%')
  })

  it('is the charged rate when a builder is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILDER_ADDRESS', '0x' + 'f'.repeat(40))
    vi.stubEnv('NEXT_PUBLIC_BUILDER_FEE_TENTHS_BPS', '30')
    const fee = await import('@/lib/fee')
    expect(fee.ADVERTISED_FEE).toBe('0.03%')
  })
})
