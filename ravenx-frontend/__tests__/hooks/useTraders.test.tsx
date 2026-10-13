// __tests__/hooks/useTraders.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTraders } from '@/hooks/useTraders'
import type { TraderFilters } from '@/types'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: {
        traders: [
          {
            address: '0xabc',
            pnl: 10000,
            upnl: 500,
            perp_equity: 50000,
            win_rate: 0.72,
            long_pnl: 8000,
            short_pnl: 2000,
            growth_rate: 0.2,
            trade_count: 100,
            win_count: 72,
            loss_count: 28,
            tx_count: 100,
            display_name: null,
            last_updated: '2026-01-01T00:00:00',
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
        per_page: 20,
      },
    }),
  },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('useTraders', () => {
  it('returns traders from the API', async () => {
    const filters: TraderFilters = { sort_by: 'pnl', order: 'desc', page: 1 }
    const { result } = renderHook(() => useTraders(filters), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.traders).toHaveLength(1)
    expect(result.current.data?.traders[0].address).toBe('0xabc')
  })
})
