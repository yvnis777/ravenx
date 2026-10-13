import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('hl-env', () => {
  it('defaults to mainnet', async () => {
    vi.stubEnv('NEXT_PUBLIC_HL_ENV', '')
    const m = await import('@/lib/hl-env')
    expect(m.HL_ENV).toBe('mainnet')
    expect(m.IS_MAINNET).toBe(true)
    expect(m.HL_INFO_URL).toBe('https://api.hyperliquid.xyz/info')
    expect(m.HL_EXCHANGE_URL).toBe('https://api.hyperliquid.xyz/exchange')
    expect(m.HL_WS_URL).toBe('wss://api.hyperliquid.xyz/ws')
  })

  it('switches every URL on testnet', async () => {
    vi.stubEnv('NEXT_PUBLIC_HL_ENV', 'Testnet')
    const m = await import('@/lib/hl-env')
    expect(m.IS_MAINNET).toBe(false)
    expect(m.HL_INFO_URL).toBe('https://api.hyperliquid-testnet.xyz/info')
    expect(m.HL_EXCHANGE_URL).toBe('https://api.hyperliquid-testnet.xyz/exchange')
    expect(m.HL_WS_URL).toBe('wss://api.hyperliquid-testnet.xyz/ws')
  })

  it('rejects unknown values', async () => {
    const m = await import('@/lib/hl-env')
    expect(() => m.resolveHlEnv('prod')).toThrow(/NEXT_PUBLIC_HL_ENV/)
  })

  it('assertBackendNetwork passes when both sides agree', async () => {
    vi.stubEnv('NEXT_PUBLIC_HL_ENV', 'testnet')
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ data: { status: 'ok', hl_env: 'testnet' } })
    const m = await import('@/lib/hl-env')
    await expect(m.assertBackendNetwork()).resolves.toBeUndefined()
  })

  it('assertBackendNetwork throws an explicit mismatch error', async () => {
    vi.stubEnv('NEXT_PUBLIC_HL_ENV', 'testnet')
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ data: { status: 'ok', hl_env: 'mainnet' } })
    const m = await import('@/lib/hl-env')
    await expect(m.assertBackendNetwork()).rejects.toThrow(
      /Network mismatch: this app is on testnet but the RavenX server is on mainnet/
    )
  })

  it('assertBackendNetwork refuses when the backend cannot say', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockRejectedValue(new Error('ECONNREFUSED'))
    const m = await import('@/lib/hl-env')
    await expect(m.assertBackendNetwork()).rejects.toThrow(/Network mismatch/)
  })
})
