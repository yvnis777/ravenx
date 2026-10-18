import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import LandingPage from '@/app/page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('LandingPage', () => {
  // NEXT_PUBLIC_ENABLE_LEADERBOARD is unset in tests: the launch configuration.
  it('leads with the paste-an-address box, not the leaderboard', () => {
    render(<LandingPage />)
    expect(screen.getByLabelText(/wallet address to copy/i)).toBeInTheDocument()
    expect(screen.queryByText(/browse top traders/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/wallets scanned/i)).not.toBeInTheDocument()
  })

  it('links out to external wallet finders in a new tab', () => {
    render(<LandingPage />)
    const link = screen.getAllByRole('link', { name: /hyperdash/i })[0]
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('does not render any connector buttons', () => {
    render(<LandingPage />)
    expect(screen.queryByText(/connect with/i)).not.toBeInTheDocument()
  })

  it('the closing CTA links to /dashboard', () => {
    render(<LandingPage />)
    const link = screen.getByRole('link', { name: /copy a wallet/i })
    expect(link).toHaveAttribute('href', '/dashboard')
  })

  it('links to the public GitHub repo in a new tab', () => {
    const { container } = render(<LandingPage />)
    const links = container.querySelectorAll('a[href="https://github.com/yvnis777/ravenx"]')
    expect(links.length).toBeGreaterThanOrEqual(3)
    links.forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    })
    expect(screen.getAllByText(/open source/i).length).toBeGreaterThan(0)
  })

  it('advertises copying as free and never quotes 0.03%', () => {
    const { container } = render(<LandingPage />)
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)
    // The FAQ is an accordion: open the pricing answer before reading it.
    fireEvent.click(screen.getByRole('button', { name: /what does it cost/i }))
    expect(screen.getByText(/charges no fee/i)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/0\.03%/)
  })
})
