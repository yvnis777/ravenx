import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuth, resetSignInState } from '@/hooks/useAuth'

const ADDRESS = '0xd95c0b9067044de78bd06d2cef257e82a9ac19d3'

const wallet = {
  // Whether this connection was restored on page load rather than made now
  restored: false,
  signMessageAsync: vi.fn(),
}

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: ADDRESS, isConnected: true, isReconnecting: false }),
  // wagmi reports the connection before the auto sign-in effect runs
  useAccountEffect: ({ onConnect }: { onConnect: (d: object) => void }) => {
    onConnect({ address: ADDRESS, isReconnected: wallet.restored })
  },
  useChainId: () => 42161,
  useDisconnect: () => ({ disconnectAsync: vi.fn() }),
  useSignMessage: () => ({ signMessageAsync: wallet.signMessageAsync }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { nonce: 'n', message: 'Sign in to RavenX' } }),
    post: vi.fn().mockResolvedValue({ data: { access_token: 'jwt' } }),
  },
}))

describe('useAuth sign-in', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSignInState()
    wallet.restored = false
    wallet.signMessageAsync = vi.fn().mockResolvedValue('0xsig')
  })

  it('signs in on its own after a fresh connection', async () => {
    renderHook(() => useAuth())
    await waitFor(() => expect(wallet.signMessageAsync).toHaveBeenCalledTimes(1))
  })

  it('waits for a tap when the session was restored on page load', async () => {
    wallet.restored = true
    const { result } = renderHook(() => useAuth())
    await new Promise((r) => setTimeout(r, 20))
    expect(wallet.signMessageAsync).not.toHaveBeenCalled()
    expect(result.current.isSigningIn).toBe(false)
  })

  it('resends a request the wallet lost', async () => {
    wallet.restored = true
    // The first request never comes back, as on a phone
    wallet.signMessageAsync = vi
      .fn()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce('0xsig')
    const { result } = renderHook(() => useAuth())

    act(() => {
      result.current.login().catch(() => {})
    })
    await waitFor(() => expect(result.current.isSigningIn).toBe(true))

    await act(async () => {
      await result.current.login({ restart: true })
    })
    expect(wallet.signMessageAsync).toHaveBeenCalledTimes(2)
    expect(result.current.isSigningIn).toBe(false)
    expect(result.current.isAuthenticated).toBe(true)
  })
})
