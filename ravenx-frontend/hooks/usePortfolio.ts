import { useQuery } from '@tanstack/react-query'
import { fetchPortfolio } from '@/lib/hyperliquid'

/** One `portfolio` request covers every period — the chart, PnL and growth all read from it. */
export function usePortfolio(address: string) {
  return useQuery({
    queryKey: ['portfolio', address.toLowerCase()],
    queryFn: () => fetchPortfolio(address.toLowerCase()),
    enabled: !!address,
    staleTime: 60_000,
  })
}
