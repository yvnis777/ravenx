import { IS_MAINNET } from '@/lib/hl-env'

/** Always visible on testnet: the same UI can place fake or real orders. */
export function NetworkBanner() {
  if (IS_MAINNET) return null
  return (
    <div
      role="status"
      className="sticky top-0 z-[300] bg-warn px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-black"
    >
      Testnet — orders use Hyperliquid testnet funds, not real money
    </div>
  )
}
