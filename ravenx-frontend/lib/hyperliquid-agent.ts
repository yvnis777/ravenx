/**
 * Hyperliquid user-signed action helpers (EIP-712).
 *
 * Two actions are used by the copy flow, both signed by the user's MAIN
 * wallet (an agent/API wallet cannot sign either):
 *
 *  - ApproveAgent      — authorizes a separate agent address to place trades
 *                        on the user's account. It can never withdraw.
 *  - ApproveBuilderFee — authorizes RavenX to attach its builder fee to the
 *                        orders it places for the user.
 *
 * The signed payload is submitted to HL's /exchange endpoint.
 */

import { HL_EXCHANGE_URL, HL_INFO_URL } from '@/lib/hl-env'

/**
 * The builder fee this user has already approved for `builder`, in tenths of
 * a basis point (30 = 0.03%). Returns 0 when nothing is approved, which is
 * also the safe answer if the call fails — the user is simply asked to sign.
 */
export async function fetchMaxBuilderFee(user: string, builder: string): Promise<number> {
  try {
    const resp = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'maxBuilderFee',
        user: user.toLowerCase(),
        builder: builder.toLowerCase(),
      }),
    })
    if (!resp.ok) return 0
    const raw = await resp.json()
    return typeof raw === 'number' ? raw : 0
  } catch {
    return 0
  }
}

export interface TypedDataPayload {
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: `0x${string}`
  }
  types: Record<string, { name: string; type: string }[]>
  primaryType: string
  message: Record<string, string | number>
}

function domainFor(signatureChainId: number): TypedDataPayload['domain'] {
  return {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: signatureChainId,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  }
}

/** Split a 65-byte signature into HL's {r, s, v} form. */
function splitSignature(signature: `0x${string}`) {
  const sig = signature.slice(2)
  return {
    r: ('0x' + sig.slice(0, 64)) as `0x${string}`,
    s: ('0x' + sig.slice(64, 128)) as `0x${string}`,
    v: parseInt(sig.slice(128, 130), 16),
  }
}

async function postAction(
  action: Record<string, unknown>,
  signature: `0x${string}`,
  nonce: number
): Promise<{ ok: boolean; raw: unknown }> {
  const resp = await fetch(HL_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      nonce,
      signature: splitSignature(signature),
      vaultAddress: null,
    }),
  })
  const raw = await resp.json().catch(() => ({}))
  return { ok: resp.ok && (raw as { status?: string }).status === 'ok', raw }
}

/* ── ApproveAgent ─────────────────────────────────────────────────── */

export interface ApproveAgentArgs {
  agentAddress: string
  agentName: string
  nonce: number
  signatureChainId: number
  isMainnet: boolean
}

const AGENT_TYPES = {
  'HyperliquidTransaction:ApproveAgent': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'agentAddress', type: 'address' },
    { name: 'agentName', type: 'string' },
    { name: 'nonce', type: 'uint64' },
  ],
}

export function buildApproveAgentTypedData(args: ApproveAgentArgs): TypedDataPayload {
  return {
    domain: domainFor(args.signatureChainId),
    types: AGENT_TYPES,
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    message: {
      hyperliquidChain: args.isMainnet ? 'Mainnet' : 'Testnet',
      signatureChainId: `0x${args.signatureChainId.toString(16)}`,
      agentAddress: args.agentAddress,
      agentName: args.agentName,
      nonce: args.nonce,
    },
  }
}

export interface SubmitApproveAgentArgs extends ApproveAgentArgs {
  signature: `0x${string}`
}

export async function submitApproveAgent(
  args: SubmitApproveAgentArgs
): Promise<{ ok: boolean; raw: unknown }> {
  return postAction(
    {
      type: 'approveAgent',
      hyperliquidChain: args.isMainnet ? 'Mainnet' : 'Testnet',
      signatureChainId: `0x${args.signatureChainId.toString(16)}`,
      agentAddress: args.agentAddress,
      agentName: args.agentName,
      nonce: args.nonce,
    },
    args.signature,
    args.nonce
  )
}

/* ── ApproveBuilderFee ────────────────────────────────────────────── */

export interface ApproveBuilderFeeArgs {
  builder: string
  /** Percent string, exactly as HL expects it — e.g. "0.03%". */
  maxFeeRate: string
  nonce: number
  signatureChainId: number
  isMainnet: boolean
}

const BUILDER_FEE_TYPES = {
  'HyperliquidTransaction:ApproveBuilderFee': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'maxFeeRate', type: 'string' },
    { name: 'builder', type: 'address' },
    { name: 'nonce', type: 'uint64' },
  ],
}

export function buildApproveBuilderFeeTypedData(args: ApproveBuilderFeeArgs): TypedDataPayload {
  return {
    domain: domainFor(args.signatureChainId),
    types: BUILDER_FEE_TYPES,
    primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
    message: {
      hyperliquidChain: args.isMainnet ? 'Mainnet' : 'Testnet',
      signatureChainId: `0x${args.signatureChainId.toString(16)}`,
      maxFeeRate: args.maxFeeRate,
      builder: args.builder,
      nonce: args.nonce,
    },
  }
}

export interface SubmitApproveBuilderFeeArgs extends ApproveBuilderFeeArgs {
  signature: `0x${string}`
}

export async function submitApproveBuilderFee(
  args: SubmitApproveBuilderFeeArgs
): Promise<{ ok: boolean; raw: unknown }> {
  return postAction(
    {
      type: 'approveBuilderFee',
      hyperliquidChain: args.isMainnet ? 'Mainnet' : 'Testnet',
      signatureChainId: `0x${args.signatureChainId.toString(16)}`,
      maxFeeRate: args.maxFeeRate,
      builder: args.builder,
      nonce: args.nonce,
    },
    args.signature,
    args.nonce
  )
}
