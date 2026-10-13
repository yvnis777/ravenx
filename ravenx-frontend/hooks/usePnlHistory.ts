import { useQuery } from '@tanstack/react-query'
import { fetchPortfolio } from '@/lib/hyperliquid'
import { periodPnl, type StatsPeriod } from '@/lib/trader-stats'

export type PnlPeriod = StatsPeriod

/** Cumulative PnL for the period, from HL's `portfolio` (shares the usePortfolio cache). */
export function usePnlHistory(address: string, period: PnlPeriod = '30d') {
  return useQuery({
    queryKey: ['portfolio', address.toLowerCase()],
    queryFn: () => fetchPortfolio(address.toLowerCase()),
    select: (portfolio) => periodPnl(portfolio, period),
    enabled: !!address,
    staleTime: 60_000,
  })
}
