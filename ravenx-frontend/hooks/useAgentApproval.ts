'use client'
import { useCallback, useState } from 'react'
import { useAccount, useSignTypedData } from 'wagmi'
import { api } from '@/lib/api'
import {
  buildApproveAgentTypedData,
  submitApproveAgent,
  buildApproveBuilderFeeTypedData,
  submitApproveBuilderFee,
  fetchMaxBuilderFee,
} from '@/lib/hyperliquid-agent'

import { BUILDER_ADDRESS, BUILDER_FEE_TENTHS_BPS, feeRateLabel } from '@/lib/fee'
import { IS_MAINNET } from '@/lib/hl-env'

const ARBITRUM_MAINNET_CHAIN_ID = 42161

/**
 * Every wallet approves a single RavenX agent, always under this name. HL
 * replaces a named agent when the same name is approved again, so renewing
 * it never uses another of the account's few named-agent slots.
 */
export const AGENT_NAME = 'ravenx'

// Re-exported so existing importers keep working.
export { BUILDER_ADDRESS, BUILDER_FEE_TENTHS_BPS, feeRateLabel }

export type AgentApprovalStep =
  | { kind: 'idle' }
  | { kind: 'awaiting-fee-signature' }
  | { kind: 'submitting-fee' }
  | { kind: 'generating' }
  | { kind: 'awaiting-signature'; agentAddress: string }
  | { kind: 'submitting'; agentAddress: string }
  | { kind: 'done'; agentAddress: string }
  | { kind: 'error'; message: string }

export function useAgentApproval() {
  const { signTypedDataAsync } = useSignTypedData()
  const { address } = useAccount()
  const [step, setStep] = useState<AgentApprovalStep>({ kind: 'idle' })

  /**
   * Approve RavenX's builder fee, unless this account already approved at
   * least the rate we charge. Skipped entirely when no builder is configured.
   */
  const approveFeeIfNeeded = useCallback(async () => {
    if (!BUILDER_ADDRESS || !address) return

    const approved = await fetchMaxBuilderFee(address, BUILDER_ADDRESS)
    if (approved >= BUILDER_FEE_TENTHS_BPS) return

    setStep({ kind: 'awaiting-fee-signature' })
    const nonce = Date.now()
    const maxFeeRate = feeRateLabel()
    const td = buildApproveBuilderFeeTypedData({
      builder: BUILDER_ADDRESS,
      maxFeeRate,
      nonce,
      signatureChainId: ARBITRUM_MAINNET_CHAIN_ID,
      isMainnet: IS_MAINNET,
    })
    const signature = (await signTypedDataAsync({
      domain: td.domain,
      types: td.types,
      primaryType: td.primaryType,
      message: td.message,
    } as Parameters<typeof signTypedDataAsync>[0])) as `0x${string}`

    setStep({ kind: 'submitting-fee' })
    const result = await submitApproveBuilderFee({
      signature,
      builder: BUILDER_ADDRESS,
      maxFeeRate,
      nonce,
      signatureChainId: ARBITRUM_MAINNET_CHAIN_ID,
      isMainnet: IS_MAINNET,
    })
    if (!result.ok) {
      const raw = result.raw as { error?: string; response?: string }
      throw new Error(raw.error ?? raw.response ?? 'Hyperliquid rejected the fee approval')
    }
  }, [address, signTypedDataAsync])

  /**
   * The agent to copy with. Reuses the wallet's RavenX agent while Hyperliquid
   * still lists it (no signature); otherwise asks the user to approve a new one.
   */
  const approve = useCallback(
    async (): Promise<string> => {
      try {
        // Fee first: if the user declines it, no agent has been created yet.
        await approveFeeIfNeeded()

        setStep({ kind: 'generating' })
        const { data } = await api.post<{ agent_address: string; needs_approval: boolean }>(
          '/agent/generate',
          {}
        )
        const agentAddress = data.agent_address
        if (!data.needs_approval) {
          setStep({ kind: 'done', agentAddress })
          return agentAddress
        }

        setStep({ kind: 'awaiting-signature', agentAddress })
        const nonce = Date.now()
        const td = buildApproveAgentTypedData({
          agentAddress,
          agentName: AGENT_NAME,
          nonce,
          signatureChainId: ARBITRUM_MAINNET_CHAIN_ID,
          isMainnet: IS_MAINNET,
        })
        const signature = (await signTypedDataAsync({
          domain: td.domain,
          types: td.types,
          primaryType: td.primaryType,
          message: td.message,
        } as Parameters<typeof signTypedDataAsync>[0])) as `0x${string}`

        setStep({ kind: 'submitting', agentAddress })
        const result = await submitApproveAgent({
          signature,
          agentAddress,
          agentName: AGENT_NAME,
          nonce,
          signatureChainId: ARBITRUM_MAINNET_CHAIN_ID,
          isMainnet: IS_MAINNET,
        })
        if (!result.ok) {
          const raw = result.raw as { error?: string; response?: string }
          const msg = raw.error ?? raw.response ?? 'Hyperliquid rejected the agent approval'
          throw new Error(msg)
        }
        setStep({ kind: 'done', agentAddress })
        return agentAddress
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setStep({ kind: 'error', message })
        throw e
      }
    },
    [approveFeeIfNeeded, signTypedDataAsync]
  )

  return { approve, step }
}
