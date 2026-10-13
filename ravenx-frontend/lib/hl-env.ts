import { api } from '@/lib/api'

/**
 * Which Hyperliquid network the app talks to — the single switch.
 * Must match HL_ENV in the backend .env; assertBackendNetwork() enforces it
 * before any signature is requested.
 */
export type HlEnv = 'mainnet' | 'testnet'

const API_URLS: Record<HlEnv, string> = {
  mainnet: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz',
}

export function resolveHlEnv(raw: string | undefined): HlEnv {
  const value = (raw ?? '').trim().toLowerCase() || 'mainnet'
  if (value !== 'mainnet' && value !== 'testnet') {
    throw new Error(`NEXT_PUBLIC_HL_ENV must be 'mainnet' or 'testnet', got '${raw}'`)
  }
  return value
}

export const HL_ENV: HlEnv = resolveHlEnv(process.env.NEXT_PUBLIC_HL_ENV)
export const IS_MAINNET = HL_ENV === 'mainnet'
const API_URL = API_URLS[HL_ENV]
export const HL_INFO_URL = `${API_URL}/info`
export const HL_EXCHANGE_URL = `${API_URL}/exchange`
export const HL_WS_URL = `${API_URL.replace('https://', 'wss://')}/ws`

/**
 * Refuse to start a copy when the backend talks to a different network. A
 * mismatch would otherwise surface as "Agent is not approved on Hyperliquid",
 * which points nowhere near the cause.
 */
export async function assertBackendNetwork(): Promise<void> {
  let backend: string | undefined
  try {
    const { data } = await api.get<{ hl_env?: string }>('/health')
    backend = data.hl_env
  } catch {
    backend = undefined
  }
  if (backend !== HL_ENV) {
    throw new Error(
      `Network mismatch: this app is on ${HL_ENV} but the RavenX server is on ${backend ?? 'an unknown network'}. Copying is disabled until they match.`
    )
  }
}
