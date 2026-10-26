// hooks/useAuth.ts
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useAccount,
  useAccountEffect,
  useChainId,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from 'wagmi'
import { api } from '@/lib/api'

const ARBITRUM_MAINNET_CHAIN_ID = 42161

// A wallet that never answers (popup closed, WalletConnect relay unreachable)
// leaves signMessageAsync pending forever — give up so the user can retry.
export const SIGN_TIMEOUT_MS = 120_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

function describeAuthError(err: unknown): string {
  const e = err as {
    name?: string
    code?: number
    cause?: { code?: number }
    shortMessage?: string
    message?: string
    response?: { data?: { error?: string } }
  }
  if (e?.name === 'UserRejectedRequestError' || e?.code === 4001 || e?.cause?.code === 4001) {
    return 'You rejected the signature request in your wallet.'
  }
  if (e?.response?.data?.error) return e.response.data.error
  return e?.shortMessage ?? e?.message ?? 'Sign-in failed.'
}

// One sign-in at a time for the whole page. Many components call useAuth();
// each used to start its own sign-in, stacking signature prompts in the
// wallet until it dropped them.
//
// The state lives on globalThis, not in module variables: the production
// bundler copies this module into more than one chunk, and each copy would
// get its own variables — two sign-ins again (seen live, 2026-10-21).
interface SignInState {
  inflight: Promise<string> | null
  // The address auto sign-in was last tried for — once per connection, not
  // once per component.
  autoTriedFor: string | null
}
const g = globalThis as typeof globalThis & { __ravenxSignIn?: SignInState }
const signIn: SignInState = (g.__ravenxSignIn ??= { inflight: null, autoTriedFor: null })

/** Test hook: forget page-wide sign-in state. */
export function resetSignInState() {
  signIn.inflight = null
  signIn.autoTriedFor = null
}

export function useAuth() {
  const { address, isConnected, isReconnecting } = useAccount()
  const { disconnectAsync } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  // A session restored on page load gets no automatic sign-in: on a phone the
  // wallet app never shows a request it didn't open itself, so it hung
  // unanswered behind a disabled button (2026-10-26). The user taps Sign in.
  useAccountEffect({
    onConnect({ address: connected, isReconnected }) {
      if (isReconnected) signIn.autoTriedFor = connected
    },
  })

  const ensureCorrectChain = useCallback(async () => {
    if (chainId !== ARBITRUM_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: ARBITRUM_MAINNET_CHAIN_ID })
    }
  }, [chainId, switchChainAsync])

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ravenx_token')
    }
    return null
  })
  const [isSigningIn, setIsSigningIn] = useState(false)
  // This component's newest sign-in; an older one that settles later must
  // not end the newer one's "signing in" state.
  const latest = useRef<Promise<string> | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  // Sync token state if it gets cleared externally (e.g. by 401 interceptor)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'ravenx_token') {
        setToken(e.newValue)
        if (!e.newValue) signIn.autoTriedFor = null
      }
    }
    // Listen for both cross-tab storage events and same-tab dispatched events
    window.addEventListener('storage', onStorage)

    // Periodically check if the token was cleared by the 401 interceptor (same-tab)
    const interval = setInterval(() => {
      const current = localStorage.getItem('ravenx_token')
      if (current !== token) {
        setToken(current)
        if (!current) signIn.autoTriedFor = null
      }
    }, 2000)

    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(interval)
    }
  }, [token])

  /**
   * Sign in, joining one already in progress rather than prompting again.
   * `restart` sends a fresh request instead: for a prompt the wallet lost,
   * which would otherwise only give up after SIGN_TIMEOUT_MS.
   */
  const login = useCallback(async ({ restart = false }: { restart?: boolean } = {}) => {
    if (!address) throw new Error('Wallet address not available')
    setIsSigningIn(true)
    setAuthError(null)
    if (restart) signIn.inflight = null
    let attempt: Promise<string> | null = null
    try {
      attempt = signIn.inflight ??= (async () => {
        await ensureCorrectChain()
        const { data } = await api.get<{ nonce: string; message: string }>(
          `/auth/nonce?address=${address}`
        )
        const signature = await withTimeout(
          signMessageAsync({ message: data.message }),
          SIGN_TIMEOUT_MS,
          'No response from your wallet. Open it and check for a pending signature request.',
        )
        const { data: auth } = await api.post<{ access_token: string }>('/auth/verify', {
          address,
          signature,
        })
        localStorage.setItem('ravenx_token', auth.access_token)
        window.dispatchEvent(new StorageEvent('storage', { key: 'ravenx_token', newValue: auth.access_token }))
        return auth.access_token
      })()
      const mine = attempt
      mine.finally(() => {
        if (signIn.inflight === mine) signIn.inflight = null
      }).catch(() => {})
      latest.current = mine
      setToken(await mine)
    } catch (err) {
      // A request replaced by a restart fails quietly
      if (latest.current === attempt) setAuthError(describeAuthError(err))
      throw err
    } finally {
      if (latest.current === attempt) setIsSigningIn(false)
    }
  }, [address, signMessageAsync, ensureCorrectChain])

  // Auto-login when wallet is connected but no valid token — once per
  // connection for the whole page, however many components use this hook.
  useEffect(() => {
    if (isConnected && address && !token && signIn.autoTriedFor !== address) {
      signIn.autoTriedFor = address
      // A failure is surfaced via authError; the user retries explicitly.
      login().catch(() => {})
    }
    if (!isConnected) {
      signIn.autoTriedFor = null
    }
  }, [isConnected, address, token, login])

  // A fresh connection starts a fresh sign-in; drop the old error.
  useEffect(() => {
    if (!isConnected) setAuthError(null)
  }, [isConnected])

  const logout = useCallback(async () => {
    localStorage.removeItem('ravenx_token')
    setToken(null)
    await disconnectAsync()
  }, [disconnectAsync])

  return {
    token,
    address,
    isConnected,
    isReconnecting,
    chainId,
    ensureCorrectChain,
    isAuthenticated: !!token && isConnected,
    isSigningIn,
    authError,
    login,
    logout,
  }
}
