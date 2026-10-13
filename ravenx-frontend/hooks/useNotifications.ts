'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Notification {
  id: number
  parent_address: string
  child_address: string | null
  type: string
  title: string
  message: string
  platform: string
  is_read: boolean
  created_at: string
}

interface NotificationsResponse {
  notifications: Notification[]
  unread_count: number
  total: number
  page: number
  pages: number
}

export function useNotifications(enabled: boolean) {
  return useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?per_page=30').then((r) => r.data),
    enabled,
    refetchInterval: 10_000,
  })
}

export function useUnreadCount(enabled: boolean) {
  return useQuery<{ unread_count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data),
    enabled,
    refetchInterval: 10_000,
  })
}

export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids?: number[]) =>
      api.post('/notifications/read', ids ? { ids } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
