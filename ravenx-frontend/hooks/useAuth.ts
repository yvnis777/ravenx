// hooks/useAuth.ts
'use client'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useAccount, useChainId, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi'
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

export function useAuth() {
  const { address, isConnected, isReconnecting } = useAccount()
  const { disconnectAsync } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

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
  const loginAttempted = useRef(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Sync token state if it gets cleared externally (e.g. by 401 interceptor)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'ravenx_token') {
        setToken(e.newValue)
        if (!e.newValue) loginAttempted.current = false
      }
    }
    // Listen for both cross-tab storage events and same-tab dispatched events
    window.addEventListener('storage', onStorage)

    // Periodically check if the token was cleared by the 401 interceptor (same-tab)
    const interval = setInterval(() => {
      const current = localStorage.getItem('ravenx_token')
      if (current !== token) {
        setToken(current)
        if (!current) loginAttempted.current = false
      }
    }, 2000)

    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(interval)
    }
  }, [token])

  const login = useCallback(async () => {
    if (!address) throw new Error('Wallet address not available')
    setIsSigningIn(true)
    setAuthError(null)
    try {
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
      setToken(auth.access_token)
    } catch (err) {
      setAuthError(describeAuthError(err))
      throw err
    } finally {
      setIsSigningIn(false)
    }
  }, [address, signMessageAsync, ensureCorrectChain])

  // Auto-login when wallet is connected but no valid token
  useEffect(() => {
    if (isConnected && address && !token && !loginAttempted.current) {
      loginAttempted.current = true
      // A failure is surfaced via authError; the user retries explicitly.
      login().catch(() => {})
    }
    if (!isConnected) {
      loginAttempted.current = false
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
