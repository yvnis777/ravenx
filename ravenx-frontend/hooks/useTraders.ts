// hooks/useTraders.ts
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TradersResponse, TraderFilters } from '@/types'

export function useTraders(filters: TraderFilters) {
  return useQuery({
    queryKey: ['traders', filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('sort_by', filters.sort_by)
      params.set('order', filters.order)
      params.set('page', String(filters.page))
      params.set('per_page', '20')
      if (filters.min_pnl !== undefined) params.set('min_pnl', String(filters.min_pnl))
      if (filters.max_pnl !== undefined) params.set('max_pnl', String(filters.max_pnl))
      if (filters.min_win_rate !== undefined) params.set('min_win_rate', String(filters.min_win_rate))
      if (filters.max_win_rate !== undefined) params.set('max_win_rate', String(filters.max_win_rate))
      if (filters.min_trades !== undefined) params.set('min_trades', String(filters.min_trades))
      if (filters.max_trades !== undefined) params.set('max_trades', String(filters.max_trades))
      if (filters.min_equity !== undefined) params.set('min_equity', String(filters.min_equity))
      if (filters.max_equity !== undefined) params.set('max_equity', String(filters.max_equity))
      if (filters.search) params.set('search', filters.search)
      const { data } = await api.get<TradersResponse>(`/dashboard/traders?${params}`)
      return data
    },
  })
}
