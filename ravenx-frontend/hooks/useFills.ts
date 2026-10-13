import { useQuery } from '@tanstack/react-query'
import { fetchFillsSince, type HLFill } from '@/lib/hyperliquid'
import { PERIOD_MS, type StatsPeriod } from '@/lib/trader-stats'

export type Fill = HLFill

/**
 * Every fill in the period, newest first. `periodStart` and `oldest` let the UI
 * say when HL's 10,000-fill history doesn't reach back to the start of the period.
 */
export function useFills(address: string, period: StatsPeriod = '7d') {
  return useQuery({
    queryKey: ['fills', address.toLowerCase(), period],
    queryFn: async () => {
      const span = PERIOD_MS[period]
      const startTime = span === null ? 0 : Date.now() - span
      const fills = await fetchFillsSince(address.toLowerCase(), startTime)
      const oldest = fills.length > 0 ? fills[0].time : null
      fills.reverse()
      return { fills, count: fills.length, periodStart: startTime, oldest }
    },
    enabled: !!address,
    staleTime: 60_000,
  })
}
