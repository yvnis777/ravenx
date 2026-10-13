/**
 * Feature switches. Must match the backend .env.
 *
 * LEADERBOARD_ENABLED — the browsable leaderboard and cohort pages. Off for
 * launch: users paste a wallet address instead (or find one on an external
 * site), and the backend skips the wallet-discovery workers that feed it.
 * Matches ENABLE_LEADERBOARD in the backend.
 */
export const LEADERBOARD_ENABLED = process.env.NEXT_PUBLIC_ENABLE_LEADERBOARD === '1'

/** Where to send users looking for wallets while our leaderboard is off. */
export const EXTERNAL_WALLET_FINDERS = [
  { label: 'Hyperliquid leaderboard', href: 'https://app.hyperliquid.xyz/leaderboard' },
  { label: 'Hyperdash', href: 'https://hyperdash.info' },
  { label: 'Hypurrscan', href: 'https://hypurrscan.io' },
] as const
