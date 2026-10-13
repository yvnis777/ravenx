// components/dashboard/CopyAWallet.tsx
// Shown at /dashboard while the leaderboard is off (lib/features.ts).
import { AddressInput } from '@/components/ui/AddressInput'
import { EXTERNAL_WALLET_FINDERS } from '@/lib/features'
import { IS_MAINNET } from '@/lib/hl-env'

const STEPS = [
  'Paste the address of the wallet you want to copy.',
  'Check its positions, PnL and fills on the trader page.',
  'Hit Copy, set your scale and risk limits, and approve it in your wallet.',
]

export function CopyAWallet() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pb-16 pt-16 sm:pt-24">
      <h1 className="mb-2 text-2xl font-semibold text-fg">Copy a wallet</h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        Paste any Hyperliquid wallet address. RavenX mirrors its trades from your own account, always
        at an entry price at least as good as theirs.
      </p>

      <AddressInput variant="hero" />

      <div className="mt-8 border-t border-line pt-5">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
          Need a wallet to copy? Find one on
        </h2>
        <ul className="flex flex-wrap gap-2">
          {EXTERNAL_WALLET_FINDERS.map(({ label, href }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-[26px] items-center rounded-md border border-line bg-raised px-2.5 text-xs
                  text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                {label} ↗
              </a>
            </li>
          ))}
        </ul>
        {!IS_MAINNET && (
          <p className="mt-3 text-[11px] text-warn">
            You&apos;re on testnet. These sites list mainnet wallets, which have no testnet trades to
            copy.
          </p>
        )}
      </div>

      <ol className="mt-8 flex flex-col gap-2">
        {STEPS.map((step, i) => (
          <li key={step} className="flex gap-3 text-[13px] text-muted">
            <span className="num inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-[var(--accent-line)] bg-accent-dim text-[11px] font-semibold text-accent">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}
