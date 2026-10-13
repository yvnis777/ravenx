import { describe, it, expect, vi, afterEach } from 'vitest'

async function load(value: string | undefined) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_ENABLE_LEADERBOARD', value as string)
  return (await import('@/lib/features')).LEADERBOARD_ENABLED
}

describe('LEADERBOARD_ENABLED', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off unless the env var is exactly "1"', async () => {
    expect(await load(undefined)).toBe(false)
    expect(await load('')).toBe(false)
    expect(await load('0')).toBe(false)
    expect(await load('1')).toBe(true)
  })
})
