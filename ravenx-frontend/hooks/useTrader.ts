import { useQuery } from '@tanstack/react-query'
import { fetchUserState } from '@/lib/hyperliquid'
import type { OpenPosition } from '@/types'

/** What HL's account state gives us live. Period figures come from usePnlHistory / useFills. */
export interface LiveTrader {
  address: string
  display_name: string | null
  perp_equity: number
  upnl: number
  open_positions: OpenPosition[]
}

export function useTrader(address: string) {
  return useQuery({
    queryKey: ['trader', address],
    queryFn: async (): Promise<LiveTrader> => {
      const addr = address.toLowerCase()
      const state = await fetchUserState(addr)

      const open_positions = state.assetPositions
        .filter((p) => parseFloat(p.position.szi) !== 0)
        .map((p) => ({
          coin: p.position.coin,
          szi: parseFloat(p.position.szi),
          entry_px: parseFloat(p.position.entryPx),
          upnl: parseFloat(p.position.unrealizedPnl),
          leverage: p.position.leverage?.value ?? 0,
          liq_px: p.position.liquidationPx ? parseFloat(p.position.liquidationPx) : null,
          position_value: parseFloat(p.position.positionValue),
          margin_used: parseFloat(p.position.marginUsed),
        }))

      return {
        address: addr,
        display_name: null,
        perp_equity: parseFloat(state.marginSummary.accountValue),
        upnl: open_positions.reduce((sum, p) => sum + p.upnl, 0),
        open_positions,
      }
    },
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: 10_000, // equity, uPnL and positions stay live; WS events refetch sooner
  })
}
