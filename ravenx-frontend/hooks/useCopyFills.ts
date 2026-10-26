import { useQuery } from '@tanstack/react-query'
import { fetchFillsSince } from '@/lib/hyperliquid'
import { tradesByCopy } from '@/lib/copy-fills'

/**
 * The user's fills on HL since their first copy started, split by copy.
 * Read from HL directly, like the rest of the account.
 */
export function useCopyFills(address: string | undefined, since: number | null) {
  return useQuery({
    queryKey: ['copy-fills', address?.toLowerCase(), since],
    queryFn: async () => tradesByCopy(await fetchFillsSince(address!.toLowerCase(), since!)),
    enabled: !!address && since !== null,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}
