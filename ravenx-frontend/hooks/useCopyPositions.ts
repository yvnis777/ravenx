import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { CopyShare } from '@/lib/attribution'

/** Each active copy's recorded share per coin. Database only — no HL calls. */
export function useCopyPositions() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['copy-positions'],
    queryFn: async () => (await api.get<CopyShare[]>('/copy/positions')).data,
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  })
}
