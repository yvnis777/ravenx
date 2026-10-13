'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAppKit } from '@reown/appkit/react'
import { useAuth } from '@/hooks/useAuth'
import { NotificationDropdown } from '@/components/nav/NotificationDropdown'
import { Button } from '@/components/ui/Button'
import { RavenMark } from '@/components/ui/RavenMark'
import { AddressInput } from '@/components/ui/AddressInput'
import { LEADERBOARD_ENABLED } from '@/lib/features'

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const NAV_ITEMS = [
  { href: '/dashboard', label: LEADERBOARD_ENABLED ? 'Dashboard' : 'Copy a wallet', protected: false },
  { href: '/copies', label: 'My Copies', protected: true },
]

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { address, isConnected, isAuthenticated, logout } = useAuth()
  const { open } = useAppKit()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isAuthenticated && pendingHref) {
      router.push(pendingHref)
      setPendingHref(null)
    }
  }, [isAuthenticated, pendingHref, router])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = search.trim()
    if (q) router.push(`/dashboard?search=${encodeURIComponent(q)}`)
  }

  function handleProtectedClick(href: string) {
    setPendingHref(href)
    open()
  }

  return (
    <header className="flex h-[44px] flex-shrink-0 items-center gap-1 border-b border-line bg-panel px-3">
      <Link href="/" className="wordmark mr-3 flex items-center gap-2 text-sm font-bold">
        <RavenMark size={22} className="flex-shrink-0" />
        <span>
          <span className="text-fg">Raven</span>
          <span className="text-accent">X</span>
        </span>
      </Link>

      {NAV_ITEMS.map(({ href, label, protected: isProtected }) => {
        const isActive = pathname.startsWith(href)
        const cls = `relative flex h-[44px] items-center px-3 text-[13px] transition-colors ${
          isActive
            ? 'text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent'
            : 'text-faint hover:text-fg'
        }`
        if (isProtected && !isAuthenticated && !isConnected) {
          return (
            <button
              key={href}
              onClick={() => handleProtectedClick(href)}
              className={cls}
              title="Connect your wallet to access this page"
              aria-label={`${label} — requires wallet connection`}
            >
              {label}
            </button>
          )
        }
        return (
          <Link key={href} href={href} className={cls}>
            {label}
          </Link>
        )
      })}

      <div className="ml-auto flex items-center gap-2">
        {LEADERBOARD_ENABLED ? (
          <form onSubmit={handleSearch} role="search">
            <label htmlFor="nav-search" className="sr-only">
              Search wallet addresses
            </label>
            <input
              id="nav-search"
              type="search"
              placeholder="Search 0x…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="num h-[26px] w-[130px] rounded-md border border-line bg-raised px-2 text-xs
                text-fg placeholder:text-faint outline-none transition-colors focus:border-accent sm:w-[200px]"
            />
          </form>
        ) : (
          <AddressInput variant="compact" />
        )}

        <NotificationDropdown isAuthenticated={isAuthenticated} />

        {isConnected && address ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => logout()}
            className="num group"
            title={isAuthenticated ? 'Click to disconnect' : 'Session expired — click to disconnect'}
          >
            <span className={`group-hover:hidden ${!isAuthenticated ? 'text-warn' : ''}`}>
              {truncateAddress(address)}
            </span>
            <span className="hidden text-loss group-hover:inline">Disconnect</span>
          </Button>
        ) : (
          <Button size="sm" onClick={() => open()}>
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  )
}
