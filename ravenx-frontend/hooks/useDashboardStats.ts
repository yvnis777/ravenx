import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Trader } from '@/types'

export interface Cohort {
  name: string
  emoji: string
  count: number
  bias: string
  avg_upnl: number
  in_pos_pct: number
}

interface DashboardStatsResponse {
  cohorts: Cohort[]
  trending: Trader[]
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get<DashboardStatsResponse>('/dashboard/stats')
      return data
    },
    staleTime: 60_000,
  })
}
