// __tests__/hooks/useAuth.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth, SIGN_TIMEOUT_MS, resetSignInState } from '@/hooks/useAuth'

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({ address: '0xabc', isConnected: true })),
  useDisconnect: vi.fn(() => ({ disconnectAsync: vi.fn() })),
  useSignMessage: vi.fn(() => ({
    signMessageAsync: vi.fn().mockResolvedValue('0xsignature'),
  })),
  useChainId: vi.fn(() => 42161),
  useSwitchChain: vi.fn(() => ({ switchChainAsync: vi.fn() })),
}))

// Mock api
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: { nonce: 'abc123', message: 'Sign in to RavenX\nNonce: abc123' },
    }),
    post: vi.fn().mockResolvedValue({
      data: { access_token: 'jwt-token-xyz' },
    }),
  },
}))

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSignInState()
  })

  it('isAuthenticated is false when no token in localStorage', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('isAuthenticated is true when token exists in localStorage', () => {
    localStorage.setItem('ravenx_token', 'existing-token')
    const { result } = renderHook(() => useAuth())
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('login stores token in localStorage', async () => {
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.login() })
    expect(localStorage.getItem('ravenx_token')).toBe('jwt-token-xyz')
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('logout clears token from localStorage', async () => {
    const { useAccount } = await import('wagmi')
    localStorage.setItem('ravenx_token', 'existing-token')
    const { result } = renderHook(() => useAuth())
    // After logout, wallet disconnects — simulate that to prevent auto-login re-triggering
    vi.mocked(useAccount).mockReturnValue({ address: undefined, isConnected: false } as any)
    await act(async () => { await result.current.logout() })
    expect(localStorage.getItem('ravenx_token')).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  // Address present but not connected: login() works, auto-login stays out of the way.
  async function mockIdleAccount() {
    const { useAccount } = await import('wagmi')
    vi.mocked(useAccount).mockReturnValue({ address: '0xabc', isConnected: false } as any)
  }

  it('surfaces an error when the wallet rejects the signature', async () => {
    await mockIdleAccount()
    const { useSignMessage } = await import('wagmi')
    const rejected = Object.assign(new Error('User rejected the request.'), {
      name: 'UserRejectedRequestError',
    })
    vi.mocked(useSignMessage).mockReturnValue({
      signMessageAsync: vi.fn().mockRejectedValue(rejected),
    } as any)
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.login().catch(() => {}) })
    expect(result.current.authError).toMatch(/rejected/i)
    expect(result.current.isSigningIn).toBe(false)
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('times out when the wallet never answers the signature request', async () => {
    await mockIdleAccount()
    vi.useFakeTimers()
    try {
      const { useSignMessage } = await import('wagmi')
      vi.mocked(useSignMessage).mockReturnValue({
        signMessageAsync: vi.fn(() => new Promise(() => {})),
      } as any)
      const { result } = renderHook(() => useAuth())
      let pending: Promise<void>
      act(() => { pending = result.current.login().catch(() => {}) })
      await act(async () => { await vi.advanceTimersByTimeAsync(SIGN_TIMEOUT_MS) })
      await act(async () => { await pending })
      expect(result.current.authError).toMatch(/no response from your wallet/i)
      expect(result.current.isSigningIn).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a successful retry clears the previous error', async () => {
    await mockIdleAccount()
    const { useSignMessage } = await import('wagmi')
    vi.mocked(useSignMessage).mockReturnValue({
      signMessageAsync: vi.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('0xsignature'),
    } as any)
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.login().catch(() => {}) })
    expect(result.current.authError).not.toBeNull()
    await act(async () => { await result.current.login() })
    expect(result.current.authError).toBeNull()
    expect(localStorage.getItem('ravenx_token')).toBe('jwt-token-xyz')
  })
})

describe('useAuth across components', () => {
  beforeEach(async () => {
    localStorage.clear()
    resetSignInState()
    vi.clearAllMocks()
    const { useAccount, useSignMessage } = await import('wagmi')
    vi.mocked(useAccount).mockReturnValue({ address: '0xabc', isConnected: true } as any)
    vi.mocked(useSignMessage).mockReturnValue({
      signMessageAsync: vi.fn(() => new Promise(() => {})),   // prompt left open
    } as any)
  })

  it('several components auto-signing in ask the wallet only once', async () => {
    const { api } = await import('@/lib/api')
    await act(async () => {
      renderHook(() => useAuth())   // TopNav
      renderHook(() => useAuth())   // TraderHeader
      renderHook(() => useAuth())   // useSubscriptions
    })
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('two copies of the module (as the production bundle has) still sign in once', async () => {
    const { api } = await import('@/lib/api')
    vi.resetModules()
    const copyA = (await import('@/hooks/useAuth')).useAuth
    vi.resetModules()
    const copyB = (await import('@/hooks/useAuth')).useAuth
    expect(copyA).not.toBe(copyB)
    await act(async () => {
      renderHook(() => copyA())   // e.g. TopNav's chunk
      renderHook(() => copyB())   // e.g. the trader page's chunk
    })
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('an explicit login while auto sign-in is pending reuses the same request', async () => {
    const { api } = await import('@/lib/api')
    let header!: { current: ReturnType<typeof useAuth> }
    await act(async () => {
      renderHook(() => useAuth())
      header = renderHook(() => useAuth()).result
    })
    await act(async () => { header.current.login().catch(() => {}) })
    expect(api.get).toHaveBeenCalledTimes(1)
  })
})
