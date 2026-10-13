import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useAgentApproval } from '@/hooks/useAgentApproval'

vi.mock('wagmi', () => ({
  useSignTypedData: () => ({
    signTypedDataAsync: vi.fn().mockResolvedValue('0x' + 'aa'.repeat(65)),
  }),
  useAccount: () => ({ address: '0xparent' }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: { agent_address: '0xagent' } }),
  },
}))

vi.mock('@/lib/hyperliquid-agent', () => ({
  buildApproveAgentTypedData: vi.fn().mockReturnValue({
    domain: {},
    types: {},
    primaryType: 'X',
    message: {},
  }),
  submitApproveAgent: vi.fn().mockResolvedValue({ ok: true, raw: {} }),
  buildApproveBuilderFeeTypedData: vi.fn().mockReturnValue({
    domain: {},
    types: {},
    primaryType: 'Y',
    message: {},
  }),
  submitApproveBuilderFee: vi.fn().mockResolvedValue({ ok: true, raw: {} }),
  fetchMaxBuilderFee: vi.fn().mockResolvedValue(0),
}))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAgentApproval', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs the full flow and returns the agent address', async () => {
    const { result } = renderHook(() => useAgentApproval(), { wrapper })
    let returned: string | null = null
    await act(async () => {
      returned = await result.current.approve('ravenx-test')
    })
    expect(returned).toBe('0xagent')
  })

  it('throws when HL submission fails', async () => {
    const mod = await import('@/lib/hyperliquid-agent')
    ;(mod.submitApproveAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      raw: { error: 'oops' },
    })
    const { result } = renderHook(() => useAgentApproval(), { wrapper })
    await expect(
      act(async () => {
        await result.current.approve('ravenx-test')
      })
    ).rejects.toThrow()
  })

  it('skips the fee signature when no builder is configured', async () => {
    // NEXT_PUBLIC_BUILDER_ADDRESS is unset in the test env, so the fee step
    // must be skipped entirely rather than prompting a second signature.
    const mod = await import('@/lib/hyperliquid-agent')
    const { result } = renderHook(() => useAgentApproval(), { wrapper })
    await act(async () => {
      await result.current.approve('ravenx-test')
    })
    expect(mod.submitApproveBuilderFee).not.toHaveBeenCalled()
    expect(mod.fetchMaxBuilderFee).not.toHaveBeenCalled()
  })
})
