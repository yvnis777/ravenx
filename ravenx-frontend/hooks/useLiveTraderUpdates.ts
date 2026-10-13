// hooks/useLiveTraderUpdates.ts
'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TradersResponse } from '@/types'

interface UpnlUpdate {
  type: 'upnl_update'
  data: Record<string, { upnl: number; perp_equity?: number }>
  ts: number
}

/**
 * Subscribes to the backend SSE stream and merges live uPnL/equity
 * updates into all cached 'traders' queries.
 */
export function useLiveTraderUpdates() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'
    const url = `${baseUrl}/dashboard/traders/stream`

    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      es = new EventSource(url)

      es.onmessage = (event) => {
        try {
          const update: UpnlUpdate = JSON.parse(event.data)
          if (update.type !== 'upnl_update') return

          // Update all cached traders queries
          queryClient.setQueriesData<TradersResponse>(
            { queryKey: ['traders'] },
            (old) => {
              if (!old) return old
              return {
                ...old,
                traders: old.traders.map((t) => {
                  const live = update.data[t.address]
                  if (!live) return t
                  return {
                    ...t,
                    upnl: live.upnl,
                    ...(live.perp_equity !== undefined && { perp_equity: live.perp_equity }),
                  }
                }),
              }
            }
          )

          // Update individual trader queries too
          for (const [address, live] of Object.entries(update.data)) {
            queryClient.setQueryData(['trader', address], (old: Record<string, unknown> | undefined) => {
              if (!old) return old
              return {
                ...old,
                upnl: live.upnl,
                ...(live.perp_equity !== undefined && { perp_equity: live.perp_equity }),
              }
            })
          }
        } catch {
          // Ignore parse errors
        }
      }

      es.onerror = () => {
        es?.close()
        // Reconnect after 3 seconds
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [queryClient])
}
