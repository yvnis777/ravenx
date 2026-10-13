import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyWalletNotice, isEmptyWallet } from '@/components/trader/EmptyWalletNotice'
import type { LiveTrader } from '@/hooks/useTrader'
import type { HLPortfolio } from '@/lib/hyperliquid'

const empty = { perp_equity: 0, open_positions: [] } as unknown as LiveTrader
const portfolio = (vlm: string) =>
  ({ perpAllTime: { vlm, pnlHistory: [], accountValueHistory: [] } }) as HLPortfolio

describe('isEmptyWallet', () => {
  it('is true with no equity, no positions and no perp volume ever', () => {
    expect(isEmptyWallet(empty, portfolio('0'))).toBe(true)
    expect(isEmptyWallet(empty, undefined)).toBe(true)
  })

  it.each([
    ['equity', { ...empty, perp_equity: 12.5 }, portfolio('0')],
    ['positions', { ...empty, open_positions: [{ coin: 'BTC' }] }, portfolio('0')],
    ['trading history', empty, portfolio('1500.5')],
  ])('is false when the wallet has %s', (_, trader, p) => {
    expect(isEmptyWallet(trader as unknown as LiveTrader, p)).toBe(false)
  })
})

describe('EmptyWalletNotice', () => {
  // NEXT_PUBLIC_HL_ENV is unset in tests, so the app is on mainnet.
  it('says the wallet has no activity on the current network', () => {
    render(<EmptyWalletNotice />)
    expect(screen.getByRole('status')).toHaveTextContent(/no activity on hyperliquid mainnet/i)
  })
})
