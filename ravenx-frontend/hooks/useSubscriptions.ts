// hooks/useSubscriptions.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { Subscription } from '@/types'

export function useSubscriptions() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => {
      const { data } = await api.get<Subscription[]>('/copy/subscriptions')
      return data
    },
    enabled: isAuthenticated,
  })
}
