import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AddressInput, parseWalletAddress } from '@/components/ui/AddressInput'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const ADDR = '0xAbCdEf0123456789aBcDeF0123456789abCDef01'

describe('parseWalletAddress', () => {
  it('accepts a 0x + 40 hex address, trimmed and lowercased', () => {
    expect(parseWalletAddress(`  ${ADDR} `)).toBe(ADDR.toLowerCase())
  })

  it.each(['', '0x123', 'AbCdEf0123456789aBcDeF0123456789abCDef01', `${ADDR}00`, '0xZZcdef0123456789abcdef0123456789abcdef01'])(
    'rejects %j',
    (raw) => expect(parseWalletAddress(raw)).toBeNull(),
  )
})

describe('AddressInput', () => {
  beforeEach(() => push.mockReset())

  it('opens the trader page for a valid address', () => {
    render(<AddressInput />)
    fireEvent.change(screen.getByLabelText(/wallet address/i), { target: { value: ADDR } })
    fireEvent.submit(screen.getByRole('search'))
    expect(push).toHaveBeenCalledWith(`/traders/${ADDR.toLowerCase()}`)
  })

  it('shows an error and stays put for an invalid address', () => {
    render(<AddressInput />)
    fireEvent.change(screen.getByLabelText(/wallet address/i), { target: { value: '0x123' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/not a valid/i)
  })
})
