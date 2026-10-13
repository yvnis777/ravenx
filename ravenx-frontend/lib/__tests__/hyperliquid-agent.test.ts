import { describe, it, expect } from 'vitest'
import {
  buildApproveAgentTypedData,
  buildApproveBuilderFeeTypedData,
} from '@/lib/hyperliquid-agent'

describe('buildApproveAgentTypedData', () => {
  it('produces the expected domain and types for mainnet', () => {
    const td = buildApproveAgentTypedData({
      agentAddress: '0xagent',
      agentName: 'ravenx-1',
      nonce: 1700000000000,
      signatureChainId: 42161,
      isMainnet: true,
    })
    expect(td.domain).toEqual({
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 42161,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    })
    expect(td.primaryType).toBe('HyperliquidTransaction:ApproveAgent')
    expect(td.message.hyperliquidChain).toBe('Mainnet')
    expect(td.message.signatureChainId).toBe('0xa4b1') // 42161 hex
    expect(td.message.agentAddress).toBe('0xagent')
    expect(td.message.agentName).toBe('ravenx-1')
    expect(td.message.nonce).toBe(1700000000000)
  })

  it('uses Testnet hyperliquidChain when isMainnet=false', () => {
    const td = buildApproveAgentTypedData({
      agentAddress: '0xagent',
      agentName: 'ravenx-1',
      nonce: 1,
      signatureChainId: 421614,
      isMainnet: false,
    })
    expect(td.message.hyperliquidChain).toBe('Testnet')
  })
})

describe('buildApproveBuilderFeeTypedData', () => {
  it('matches the field order Hyperliquid signs over', () => {
    const td = buildApproveBuilderFeeTypedData({
      builder: '0xbuilder',
      maxFeeRate: '0.03%',
      nonce: 1700000000000,
      signatureChainId: 42161,
      isMainnet: true,
    })
    expect(td.primaryType).toBe('HyperliquidTransaction:ApproveBuilderFee')
    // Order matters — EIP-712 hashes the struct in this exact sequence
    expect(td.types['HyperliquidTransaction:ApproveBuilderFee'].map((f) => f.name)).toEqual([
      'hyperliquidChain',
      'maxFeeRate',
      'builder',
      'nonce',
    ])
    expect(td.message.maxFeeRate).toBe('0.03%')
    expect(td.message.builder).toBe('0xbuilder')
    expect(td.message.hyperliquidChain).toBe('Mainnet')
    expect(td.message.signatureChainId).toBe('0xa4b1')
  })

  it('shares the signing domain with ApproveAgent', () => {
    const fee = buildApproveBuilderFeeTypedData({
      builder: '0xbuilder',
      maxFeeRate: '0.03%',
      nonce: 1,
      signatureChainId: 42161,
      isMainnet: true,
    })
    const agent = buildApproveAgentTypedData({
      agentAddress: '0xagent',
      agentName: 'x',
      nonce: 1,
      signatureChainId: 42161,
      isMainnet: true,
    })
    expect(fee.domain).toEqual(agent.domain)
  })
})
