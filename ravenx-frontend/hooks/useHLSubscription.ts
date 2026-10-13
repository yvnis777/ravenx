import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { HL_WS_URL as HL_WS } from '@/lib/hl-env'


/**
 * Subscribes to Hyperliquid WebSocket for real-time user events.
 * On each event, refetches the account state (useTrader also polls it every 10s).
 */
export function useHLSubscription(address: string) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!address) return

    const addr = address.toLowerCase()
    let alive = true

    function connect() {
      if (!alive) return

      const ws = new WebSocket(HL_WS)
      wsRef.current = ws

      ws.onopen = () => {
        // Subscribe to user events (fills, order updates, etc.)
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'userEvents', user: addr },
        }))
        // Subscribe to user fills for live trade updates
        ws.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'userFills', user: addr },
        }))
      }

      ws.onmessage = () => {
        // On any event, invalidate the trader query to trigger a refetch
        queryClient.invalidateQueries({ queryKey: ['trader', address] })
      }

      ws.onclose = () => {
        if (alive) {
          reconnectTimer.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      alive = false
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [address, queryClient])
}
