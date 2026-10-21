import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TraderHeader } from '@/components/trader/TraderHeader'

const open = vi.fn()
vi.mock('@reown/appkit/react', () => ({ useAppKit: () => ({ open }) }))

const auth = {
  isAuthenticated: false,
  isConnected: false,
  isSigningIn: false,
  authError: null as string | null,
  login: vi.fn(),
}
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))

const copyToClipboard = vi.fn()
vi.mock('@/lib/clipboard', () => ({ copyToClipboard: (t: string) => copyToClipboard(t) }))

const trader = { address: '0x' + 'd'.repeat(40), display_name: null }

function renderHeader() {
  const onCopy = vi.fn()
  render(<TraderHeader trader={trader} onBack={() => {}} onCopy={onCopy} />)
  return onCopy
}

describe('TraderHeader Copy Trade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(auth, { isAuthenticated: false, isConnected: false, isSigningIn: false, authError: null })
    auth.login.mockResolvedValue(undefined)
  })

  it('opens the copy window when signed in', () => {
    auth.isAuthenticated = true
    auth.isConnected = true
    const onCopy = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Copy Trade' }))
    expect(onCopy).toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('opens the wallet picker when no wallet is connected', () => {
    const onCopy = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Copy Trade' }))
    expect(open).toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
  })

  it('signs in, then opens the copy window, when connected but not signed in', async () => {
    auth.isConnected = true
    const onCopy = renderHeader()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Trade' }))
    })
    expect(auth.login).toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    expect(onCopy).toHaveBeenCalled()
  })

  it('stays put and shows why when the sign-in fails', async () => {
    auth.isConnected = true
    auth.login.mockRejectedValue(new Error('rejected'))
    const onCopy = renderHeader()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Trade' }))
    })
    expect(onCopy).not.toHaveBeenCalled()
  })

  it('shows the sign-in error under the button', () => {
    auth.isConnected = true
    auth.authError = 'You rejected the signature request in your wallet.'
    renderHeader()
    expect(screen.getByRole('alert')).toHaveTextContent(/rejected the signature/)
  })
})

describe('TraderHeader address copy', () => {
  it('is an icon button that copies the full address and confirms', () => {
    renderHeader()
    const button = screen.getByRole('button', { name: 'Copy full address' })
    expect(button).not.toHaveTextContent(/copy/i)        // icon only, no text
    expect(button.querySelector('svg')).not.toBeNull()
    fireEvent.click(button)
    expect(copyToClipboard).toHaveBeenCalledWith(trader.address)
    expect(screen.getByRole('button', { name: 'Address copied' })).toBeInTheDocument()
  })
})
