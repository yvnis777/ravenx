// components/trader/EmptyWalletNotice.tsx
import { HL_ENV, IS_MAINNET } from '@/lib/hl-env'
import type { LiveTrader } from '@/hooks/useTrader'
import type { HLPortfolio } from '@/lib/hyperliquid'

/** Nothing to show: no equity, no open positions, and no perp volume ever. */
export function isEmptyWallet(trader: LiveTrader, portfolio: HLPortfolio | undefined): boolean {
  const everTraded = parseFloat(portfolio?.perpAllTime?.vlm ?? '0') > 0
  return trader.perp_equity === 0 && trader.open_positions.length === 0 && !everTraded
}

/**
 * Explains an all-zero trader page. On testnet this is almost always a mainnet
 * wallet pasted from an external site — say so, rather than show a page of $0.
 */
export function EmptyWalletNotice() {
  return (
    <div
      role="status"
      className="flex-shrink-0 border-b border-[var(--accent-line)] bg-accent-dim px-3 py-2 text-xs text-fg"
    >
      This wallet has no activity on Hyperliquid {HL_ENV}
      {IS_MAINNET
        ? ' — no equity, open positions or trades. Check the address.'
        : '. Wallets from Hyperdash, Hypurrscan or the Hyperliquid leaderboard are mainnet wallets; to test copying, use a wallet that trades on testnet.'}
    </div>
  )
}
