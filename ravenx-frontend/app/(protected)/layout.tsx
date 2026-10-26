// app/(protected)/layout.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { TopNav } from '@/components/nav/TopNav'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isConnected, isReconnecting, isSigningIn, authError, login, logout } =
    useAuth()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  // Wait for wagmi to finish restoring state before making any redirect decisions.
  // wagmi can take multiple ticks to restore connection from persisted state,
  // so we delay the "ready" flag. If there's a token in localStorage, the user
  // was previously authenticated — give wagmi time to reconnect.
  useEffect(() => {
    const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('ravenx_token')
    if (!hasToken) {
      // No token — user is definitely not authenticated, redirect immediately
      setReady(true)
      return
    }
    // Token exists — wait for wagmi to finish reconnecting (up to 3s)
    const timer = setTimeout(() => setReady(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  // If wagmi connects before the timer, mark ready immediately
  useEffect(() => {
    if (isConnected || isAuthenticated) {
      setReady(true)
    }
  }, [isConnected, isAuthenticated])

  // Redirect only when ready and definitively not connected
  useEffect(() => {
    if (ready && !isAuthenticated && !isConnected && !isReconnecting) {
      router.push('/')
    }
  }, [ready, isAuthenticated, isConnected, isReconnecting, router])

  // Show spinner while waiting for wagmi to restore the connection
  if (!ready || isReconnecting) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  // Connected but not signed in: restored session, pending signature, or a failed
  // one. Every state has a button — a restored session isn't signed in
  // automatically, and a phone's wallet can lose a request.
  if (!isAuthenticated && isConnected) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          {authError ? (
            <>
              <p className="text-sm text-fg">Sign-in didn&apos;t complete</p>
              <p className="text-xs text-muted" role="alert">{authError}</p>
            </>
          ) : isSigningIn ? (
            <>
              <Spinner size="lg" />
              <p className="text-sm text-fg">Confirm the sign-in message in your wallet</p>
              <p className="text-xs text-muted">
                Signing is free and doesn&apos;t send a transaction. Nothing in your wallet app?
                Send the request again.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-fg">Sign in to see your copies</p>
              <p className="text-xs text-muted">
                It&apos;s a free signature in your wallet, not a transaction.
              </p>
            </>
          )}
          <div className="mt-1 flex gap-2">
            <Button onClick={() => login({ restart: isSigningIn }).catch(() => {})}>
              {authError ? 'Try again' : isSigningIn ? 'Send again' : 'Sign in'}
            </Button>
            <Button variant="ghost" onClick={() => logout()}>
              Disconnect
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Not connected at all — redirecting
  if (!isAuthenticated && !isConnected) {
    return null
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
