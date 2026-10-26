import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CopyModal } from '@/components/trader/CopyModal'
import type { OpenPosition } from '@/types'

const ME = '0xd95c0b9067044de78bd06d2cef257e82a9ac19d3'
const TARGET = '0xb5be7ae6f69c5d3ad941e17200ea316db91aa9fb'

vi.mock('@reown/appkit/react', () => ({ useAppKit: () => ({ open: vi.fn() }) }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ address: ME, isAuthenticated: true, isConnected: true }),
}))
vi.mock('@/hooks/useAgentApproval', () => ({
  useAgentApproval: () => ({ approve: vi.fn(), step: { kind: 'idle' } }),
  BUILDER_ADDRESS: '',
  feeRateLabel: () => '0%',
}))
vi.mock('@/hooks/useSubscriptions', () => ({ useSubscriptions: () => ({ data: [] }) }))

const fill = (sz: number, px: number, dir = 'Open Long') => ({ sz: String(sz), px: String(px), dir })

// A $51 follower and a flat $1,667 trader whose trades run around $233, as on
// 2026-10-26, when the dialog showed nothing because the trader held no positions.
type Account = { perp_equity: number; open_positions: OpenPosition[] }
const state = {
  me: { perp_equity: 51, open_positions: [] } as Account,
  target: { perp_equity: 1_667, open_positions: [] } as Account,
  fills: [fill(1, 233), fill(2, 116.5), fill(1, 240, 'Open Short'), fill(1, 250, 'Close Long')],
}
vi.mock('@/hooks/useTrader', () => ({
  useTrader: (address: string) => ({
    data: address === ME ? state.me : state.target,
    isError: false,
  }),
}))
vi.mock('@/hooks/useFills', () => ({
  useFills: () => ({ data: { fills: state.fills }, isError: false }),
}))

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CopyModal targetAddress={TARGET} onClose={() => {}} />
    </QueryClientProvider>
  )
}

describe('CopyModal sizing check', () => {
  beforeEach(() => {
    state.me.perp_equity = 51
    state.target.open_positions = []
    state.fills = [fill(1, 233), fill(2, 116.5), fill(1, 240, 'Open Short'), fill(1, 250, 'Close Long')]
  })

  it('warns about skipped trades even when the trader holds no positions', () => {
    renderModal()
    // $233 × 51/1667 = $7.13 at 100%; 110% headroom needs 155%
    expect(screen.getByText('Suggested minimum scale: 155%')).toBeInTheDocument()
    expect(screen.getByText(/3 of the trader.s 3 trades from the last 7 days/)).toBeInTheDocument()
  })

  it('applies the suggested scale', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Use 155%' }))
    expect(screen.getByLabelText('Scale')).toHaveValue(155)
    expect(screen.queryByRole('button', { name: /Use \d+%/ })).not.toBeInTheDocument()
    expect(screen.getByText(/3 of the trader.s 3 trades .* are \$10 or more/)).toBeInTheDocument()
  })

  it('takes a typed scale above the slider', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Scale'), { target: { value: '400' } })
    expect(screen.getByText(/Suggested minimum scale: 155%\. At 400%/)).toBeInTheDocument()
  })

  it('says so when the follower has no funds', () => {
    state.me.perp_equity = 0
    renderModal()
    expect(screen.getByText('No funds on your Hyperliquid account')).toBeInTheDocument()
  })

  it('says so when there is nothing to size', () => {
    state.fills = []
    renderModal()
    expect(screen.getByText(/hasn.t opened a trade in the last 7 days/)).toBeInTheDocument()
  })
})
