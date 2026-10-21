import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CopiesPage from '@/app/(protected)/copies/page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ address: '0xd95c0b9067044de78bd06d2cef257e82a9ac19d3', isAuthenticated: true }),
}))

const TARGET = '0x1a94785cc11b1b4225374a8e0015f788b222a538'
const state = {
  subs: [
    { id: 3, target_address: TARGET, target_name: null, scaling_pct: 100, is_active: true,
      risk_params: {}, created_at: '2026-10-21T10:18:46', parent_address: '0xd9', agent_address: '0x6e' },
  ],
  account: {
    perp_equity: 49.8, upnl: 1.5,
    open_positions: [
      { coin: 'HYPE', szi: 0.5, entry_px: 40, upnl: 1.5, position_value: 21.5, margin_used: 4.3, liq_px: 31.2, leverage: 5 },
    ],
  } as any,
  shares: [
    { subscription_id: 3, coin: 'HYPE', szi: 0.3, entry_px: 40 },
    { subscription_id: 3, coin: 'NEAR', szi: -2, entry_px: 3 },
  ],
  notes: [
    { id: 1, type: 'order_skipped', title: 'Skipped STRK', message: 'Order too small ($4.12) — minimum is $10.00.',
      created_at: new Date().toISOString() },
  ],
}
vi.mock('@/hooks/useSubscriptions', () => ({ useSubscriptions: () => ({ data: state.subs, isLoading: false }) }))
vi.mock('@/hooks/useTrader', () => ({ useTrader: () => ({ data: state.account, isError: false }) }))
vi.mock('@/hooks/useCopyPositions', () => ({ useCopyPositions: () => ({ data: state.shares }) }))
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ data: { notifications: state.notes } }) }))

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CopiesPage />
    </QueryClientProvider>,
  )
}

describe('My Copies dashboard', () => {
  beforeEach(() => {
    state.account.perp_equity = 49.8
  })

  it('shows the account in dollars and cents', () => {
    renderPage()
    expect(screen.getByText('$49.80')).toBeInTheDocument()
  })

  it('attributes a position to its copy and the rest to manual', () => {
    renderPage()
    const row = screen.getByText('HYPE').closest('tr')!
    expect(within(row).getByText(/0x1a94…a538/)).toBeInTheDocument()
    expect(within(row).getByText(/Manual/)).toBeInTheDocument()
  })

  it('warns about a recorded share that is not open on Hyperliquid', () => {
    renderPage()
    expect(screen.getByText(/not open on Hyperliquid/)).toBeInTheDocument()
  })

  it("summarizes each copy's positions", () => {
    renderPage()
    const copiesPanel = screen.getByRole('heading', { name: 'Copies' }).closest('section')!
    const row = within(copiesPanel).getByText('0x1a94…a538').closest('tr')!
    expect(within(row).getByText('2')).toBeInTheDocument()     // HYPE + orphaned NEAR
  })

  it('explains the $10 minimum to small accounts', () => {
    renderPage()
    expect(screen.getByText(/rejects orders under \$10/)).toBeInTheDocument()
  })

  it('says what to do when the account has no USDC', () => {
    state.account.perp_equity = 0
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(/No USDC available/)
  })

  it('lists activity with skip reasons', () => {
    renderPage()
    expect(screen.getByText('Skipped')).toBeInTheDocument()
    expect(screen.getByText(/Order too small/)).toBeInTheDocument()
  })
})
