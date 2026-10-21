'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { RavenMark } from '@/components/ui/RavenMark'
import { GitHubIcon } from '@/components/ui/GitHubIcon'
import { AddressInput } from '@/components/ui/AddressInput'
import { api } from '@/lib/api'
import { ADVERTISED_FEE, FEES_ENABLED, feeRateLabel } from '@/lib/fee'
import { EXTERNAL_WALLET_FINDERS, LEADERBOARD_ENABLED, SOURCE_CODE_URL } from '@/lib/features'

/* Landing page — same terminal system as the app, with room to breathe.
   Every claim here must stay true of the running product: RavenX is
   non-custodial (agent wallets, no key storage) and the price shown is
   whatever lib/fee.ts is configured with. */

interface Step {
  num: number
  title: string
  desc: string | ((count: string) => string)
  emphasis: string
}

const STEPS: Step[] = [
  LEADERBOARD_ENABLED
    ? {
        num: 1,
        title: 'Browse',
        desc: (count: string) =>
          `No signup, no email. ${count} ranked wallets, filterable by PnL, win rate and equity.`,
        emphasis: 'No wallet needed to browse',
      }
    : {
        num: 1,
        title: 'Find a wallet',
        desc: 'Paste any Hyperliquid address — or find one on the Hyperliquid leaderboard, Dextrabot or Hyperdash.',
        emphasis: 'No signup, no email',
      },
  {
    num: 2,
    title: 'Pick your edge',
    desc: 'Inspect open positions, fill history and risk profile before you commit to anyone.',
    emphasis: 'Full transparency',
  },
  {
    num: 3,
    title: 'Copy',
    desc: 'Set your scale and risk limits. RavenX mirrors every entry and exit from your own account.',
    emphasis: 'You trade when they trade',
  },
]

interface Feature {
  title: string | ((count: string) => string)
  desc: string
  highlight?: boolean
}

const FEATURES: Feature[] = [
  {
    title: 'Guaranteed better entry',
    desc: 'Limit orders sized so your weighted-average entry is always at least as good as the trader you copy. A mathematical invariant, not a heuristic.',
    highlight: true,
  },
  {
    title: 'You control the risk',
    desc: 'Stop-loss, max drawdown and position limits are set before a single order is placed — and editable while a copy runs.',
  },
  LEADERBOARD_ENABLED
    ? {
        title: (count: string) => `${count} wallets scanned`,
        desc: 'Our own scanner enriches every active Hyperliquid wallet. Sort by period PnL, win rate, equity or growth.',
      }
    : {
        title: 'Copy any wallet',
        desc: 'Not limited to a curated list. Any Hyperliquid address can be copied the moment you find it.',
      },
]

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'How does the algorithm guarantee a better entry?',
    a: "RavenX places limit orders calculated so your weighted-average entry is always equal to or better than the trader you're copying. Longs fill at or below their price, shorts at or above. If the price never becomes favorable, no order is placed — the guarantee is never traded away for speed.",
  },
  {
    q: 'How does RavenX trade for me?',
    a: "You authorize a limited 'agent wallet' on Hyperliquid. It can place trades on your account but cannot withdraw. Only you, with your main wallet, can move funds. RavenX never holds your funds and never has your private key.",
  },
  {
    q: 'What do I sign?',
    a: FEES_ENABLED
      ? `Two signatures, once: approval of the ${feeRateLabel()} RavenX fee, and approval of the agent wallet that places your trades. Neither can move money out of your account. Later copies reuse the fee approval, so they need one signature.`
      : 'One signature, once: approval of the agent wallet that places your trades. It cannot move money out of your account.',
  },
  {
    q: 'What does it cost?',
    a: FEES_ENABLED
      ? `${ADVERTISED_FEE} of each order RavenX places for you, collected by Hyperliquid itself through its builder-fee mechanism. No subscription, no profit share, and nothing charged on trades you place yourself. Hyperliquid's own trading fees apply as usual.`
      : "Nothing. RavenX charges no fee on the trades it copies for you — no per-order fee, no subscription, no profit share. Other copy-trading bots charge per order: Based 0.025%, Phantom 0.05%, Dextrabot 0.055%. Hyperliquid's own trading fees apply as usual.",
  },
  {
    q: 'Can I check what the code does?',
    a: 'Yes. RavenX is open source under the AGPL-3.0 licence: the code that places your trades is public on GitHub, exactly as it runs on ravenx.app. Anyone can read how orders are sized, priced and cancelled.',
  },
  {
    q: 'Can I stop at any time?',
    a: 'Instantly. One click stops the copying and cancels the open orders RavenX placed. Your positions stay exactly as they are — nothing is force-closed — and you can revoke the agent on Hyperliquid whenever you like.',
  },
  {
    q: 'What do I need to start?',
    a: 'A funded Hyperliquid account and $10 per order — the minimum order size. There is no deposit to RavenX, because your funds never leave your own account.',
  },
]

const TRUST = [
  {
    title: 'Non-custodial',
    desc: 'Your funds stay in your Hyperliquid account. RavenX has no withdrawal access, ever.',
  },
  {
    title: 'No key storage',
    desc: 'You never share a private key. Trading is authorized by a revocable agent wallet.',
  },
  {
    title: 'No lock-in',
    desc: 'Stop with one click. Open positions remain yours to manage.',
  },
  {
    title: 'Open source',
    desc: 'Every line that trades for you is public on GitHub. Read it before you trust it.',
  },
]

/** Animated counter — gives the stat a live feel without faking a number. */
function AnimatedNumber({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(target) // start at target to avoid a flash of 0
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let cached = 0
    try {
      cached = parseInt(localStorage.getItem(`ravenx_counter_${target}`) ?? '0', 10)
    } catch {
      cached = 0
    }
    const start = cached > 0 ? cached : Math.floor(target * 0.85)
    setValue(start)
    const duration = 1200
    const steps = 30
    const increment = (target - start) / steps
    let current = start
    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setValue(target)
        try {
          localStorage.setItem(`ravenx_counter_${target}`, String(target))
        } catch {
          /* private mode — the counter simply restarts next visit */
        }
        clearInterval(timer)
      } else {
        setValue(Math.floor(current))
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [target])
  return (
    <span className="num">
      {value.toLocaleString()}
      {suffix}
    </span>
  )
}

function useWalletCount() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!LEADERBOARD_ENABLED) return
    api
      .get('/dashboard/traders', { params: { per_page: 1 } })
      .then((r) => setCount(r.data.total))
      .catch(() => setCount(0))
  }, [])
  return count
}

function formatCount(n: number) {
  if (n >= 1000) return `${Math.floor(n / 1000).toLocaleString()}K+`
  return n.toLocaleString()
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const walletCount = useWalletCount()
  const countLabel = walletCount ? formatCount(walletCount) : '65K+'

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* ─── Top bar ─── */}
      <header className="flex h-[44px] flex-shrink-0 items-center border-b border-line px-4">
        <RavenMark size={22} className="mr-2 flex-shrink-0" />
        <span className="wordmark text-sm font-bold">
          <span className="text-fg">Raven</span>
          <span className="text-accent">X</span>
        </span>
        <a
          href={SOURCE_CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto mr-5 flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-fg"
        >
          <GitHubIcon size={15} />
          <span className="hidden sm:inline">GitHub</span>
          <span className="sm:hidden">Source</span>
        </a>
        <Link
          href="/dashboard"
          className="text-[13px] text-faint transition-colors hover:text-fg"
        >
          Open app →
        </Link>
      </header>

      {/* ─── Hero ─── */}
      <section className="flex flex-col items-center px-6 pb-20 pt-24 text-center">
        <RavenMark size={72} className="mb-6" />
        <span className="wordmark mb-8 text-5xl font-bold sm:text-6xl">
          <span className="text-fg">Raven</span>
          <span className="text-accent">X</span>
        </span>

        <h1 className="mb-4 max-w-2xl text-3xl font-semibold leading-tight text-fg sm:text-4xl">
          Stop watching profitable trades you didn&apos;t take.
        </h1>

        <p className="mb-5 max-w-lg text-base text-accent sm:text-lg">
          {FEES_ENABLED
            ? 'Copy top Hyperliquid traders — at a mathematically guaranteed better entry price.'
            : 'Copy top Hyperliquid traders for free — at a mathematically guaranteed better entry price.'}
        </p>

        <p className="mb-9 max-w-md text-[13px] leading-relaxed text-muted">
          {LEADERBOARD_ENABLED
            ? 'No signup. Browse the leaderboard without connecting a wallet.'
            : 'Paste any Hyperliquid wallet. No signup.'}{' '}
          Your funds never leave your own account, and the code is{' '}
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline underline-offset-2 hover:text-accent"
          >
            open source
          </a>
          .
        </p>

        {LEADERBOARD_ENABLED ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link href="/dashboard">
              <Button className="h-[36px] min-w-[190px] px-5 text-[13px]">Browse Top Traders</Button>
            </Link>
            <span className="text-[11px] text-faint">No wallet connection needed to browse</span>
          </div>
        ) : (
          <div className="flex w-full max-w-lg flex-col items-center gap-3">
            <AddressInput variant="hero" className="w-full" />
            <p className="text-[11px] text-faint">
              Need a wallet?{' '}
              {EXTERNAL_WALLET_FINDERS.map(({ label, href }, i) => (
                <span key={href}>
                  {i > 0 && ' · '}
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted underline-offset-2 hover:text-fg hover:underline"
                  >
                    {label}
                  </a>
                </span>
              ))}
            </p>
          </div>
        )}

        {/* Stat strip */}
        <div className={`mt-14 grid w-full max-w-2xl grid-cols-1 gap-px border border-line bg-line text-center ${LEADERBOARD_ENABLED ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {LEADERBOARD_ENABLED && (
            <div className="bg-panel px-6 py-3">
              <div className="text-xl font-semibold text-fg">
                <AnimatedNumber target={walletCount ?? 65000} suffix="+" />
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">
                Wallets scanned
              </div>
            </div>
          )}
          <div className="bg-panel px-6 py-3">
            <div className="num text-xl font-semibold text-accent">{ADVERTISED_FEE}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">
              Copy-trading fee
            </div>
          </div>
          <div className="bg-panel px-6 py-3">
            <div className="text-xl font-semibold text-profit">Non-custodial</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">
              We never hold your funds
            </div>
          </div>
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group bg-panel px-6 py-3 transition-colors hover:bg-raised"
          >
            <div className="flex items-center justify-center gap-2 text-xl font-semibold text-fg">
              <GitHubIcon size={18} className="text-muted group-hover:text-fg" />
              Open source
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">
              Read the code on GitHub
            </div>
          </a>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-xl font-semibold text-fg">Three steps</h2>
          <p className="mb-10 text-center text-[13px] text-faint">
            {LEADERBOARD_ENABLED
              ? 'From browsing to copying in under two minutes.'
              : 'From address to copying in under two minutes.'}
          </p>

          <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.num} className="bg-panel p-6">
                <span className="num mb-3 inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--accent-line)] bg-accent-dim text-xs font-semibold text-accent">
                  {step.num}
                </span>
                <h3 className="mb-1.5 text-sm font-semibold text-fg">{step.title}</h3>
                <p className="mb-3 text-[13px] leading-relaxed text-muted">
                  {typeof step.desc === 'function' ? step.desc(countLabel) : step.desc}
                </p>
                <span className="text-[11px] text-accent">{step.emphasis}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why RavenX ─── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-xl font-semibold text-fg">Why RavenX</h2>
          <p className="mb-10 text-center text-[13px] text-faint">
            The only copy-trading platform that guarantees a better price than the trader you follow.
          </p>

          <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
            {FEATURES.map((feature) => {
              const title =
                typeof feature.title === 'function' ? feature.title(countLabel) : feature.title
              return (
                <div
                  key={title}
                  className={`bg-panel p-6 ${feature.highlight ? 'border-t-2 border-t-accent' : ''}`}
                >
                  <h3
                    className={`mb-1.5 text-sm font-semibold ${
                      feature.highlight ? 'text-accent' : 'text-fg'
                    }`}
                  >
                    {title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted">{feature.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── Trust strip ─── */}
      <section className="border-y border-line px-6 py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => (
            <div key={t.title}>
              <div className="mb-1 text-[13px] font-medium text-fg">{t.title}</div>
              <div className="text-[11px] leading-relaxed text-faint">{t.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center text-xl font-semibold text-fg">Questions</h2>

          <div className="border border-line">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="border-b border-line last:border-b-0">
                <button
                  className="flex w-full items-center justify-between gap-4 bg-panel px-4 py-3 text-left transition-colors hover:bg-raised"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className="text-[13px] font-medium text-fg">{item.q}</span>
                  <span aria-hidden="true" className="shrink-0 text-xs text-accent">
                    {openFaq === i ? '▾' : '▸'}
                  </span>
                </button>
                {openFaq === i && (
                  <div className="bg-panel px-4 pb-4">
                    <p className="text-[13px] leading-relaxed text-muted">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Closing CTA ─── */}
      <section className="px-6 py-16 text-center">
        <div className="mx-auto max-w-lg">
          <h2 className="mb-3 text-2xl font-semibold text-fg">
            The next profitable trade is happening now.
          </h2>
          <p className="mx-auto mb-7 max-w-sm text-[13px] text-muted">
            {LEADERBOARD_ENABLED
              ? 'Browse the leaderboard. Find your edge. Copy it at a better price.'
              : 'Paste a wallet. Copy it at a better price.'}
          </p>
          <Link href="/dashboard">
            <Button className="h-[36px] min-w-[190px] px-5 text-[13px]">
              {LEADERBOARD_ENABLED ? 'Browse Top Traders' : 'Copy a wallet'}
            </Button>
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-line px-6 py-8 text-center">
        <span className="wordmark text-sm font-bold">
          <span className="text-fg">Raven</span>
          <span className="text-accent">X</span>
        </span>
        <p className="mt-1.5 text-[11px] text-faint">
          Built for Hyperliquid traders · Open source under AGPL-3.0
        </p>
        <div className="mt-3 flex justify-center gap-4">
          <Link
            href="/terms"
            className="text-[11px] text-faint transition-colors hover:text-muted"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="text-[11px] text-faint transition-colors hover:text-muted"
          >
            Privacy Policy
          </Link>
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-muted"
          >
            <GitHubIcon size={12} />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
