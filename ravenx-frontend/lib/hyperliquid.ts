import { HL_INFO_URL as HL_API } from '@/lib/hl-env'

export async function hlPost(body: Record<string, unknown>) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Hyperliquid API error: ${res.status}`)
  return res.json()
}

export interface HLPosition {
  coin: string
  szi: string
  entryPx: string
  positionValue: string
  unrealizedPnl: string
  returnOnEquity: string
  leverage: { type: string; value: number }
  liquidationPx: string | null
  marginUsed: string
}

export interface HLUserState {
  marginSummary: {
    accountValue: string
    totalMarginUsed: string
    totalNtlPos: string
    totalRawUsd: string
  }
  assetPositions: {
    type: string
    position: HLPosition
  }[]
  crossMarginSummary: {
    accountValue: string
    totalMarginUsed: string
    totalNtlPos: string
    totalRawUsd: string
  }
}

export interface HLFill {
  coin: string
  px: string
  sz: string
  side: string
  time: number
  startPosition: string
  dir: string
  closedPnl: string
  hash: string
  oid: number
  crossed: boolean
  fee: string
  feeToken: string
}

export async function fetchUserState(address: string): Promise<HLUserState> {
  return hlPost({ type: 'clearinghouseState', user: address })
}

export interface HLSpotState {
  balances: { coin: string; total: string }[]
}

/**
 * HL account modes where spot and perps share one USDC balance. For these the
 * perps state's accountValue is only the collateral held for open positions;
 * the real equity is the spot USDC total (uPnL included). The backend reads
 * equity the same way (copy_service._equity).
 */
const SHARED_COLLATERAL_MODES = ['unifiedAccount', 'portfolioMargin']

/** The USDC backing this account's perps, given its mode and both states. */
export function accountEquity(mode: unknown, perps: HLUserState, spot?: HLSpotState): number {
  if (typeof mode === 'string' && SHARED_COLLATERAL_MODES.includes(mode)) {
    return (spot?.balances ?? [])
      .filter((b) => b.coin === 'USDC')
      .reduce((sum, b) => sum + parseFloat(b.total), 0)
  }
  return parseFloat(perps.marginSummary.accountValue)
}

/** Equity for any account mode; asks HL for the spot state only when it matters. */
export async function fetchAccountEquity(address: string, perps: HLUserState): Promise<number> {
  const mode = await hlPost({ type: 'userAbstraction', user: address })
  const shared = typeof mode === 'string' && SHARED_COLLATERAL_MODES.includes(mode)
  const spot = shared ? await hlPost({ type: 'spotClearinghouseState', user: address }) : undefined
  return accountEquity(mode, perps, spot)
}

/** One portfolio window: [timestamp ms, value] pairs, as HL sends them. */
export interface HLPortfolioWindow {
  accountValueHistory: [number, string][]
  pnlHistory: [number, string][]
  vlm: string
}

/** Keyed by window: day, week, month, allTime, and perp-only perpDay … perpAllTime. */
export type HLPortfolio = Record<string, HLPortfolioWindow>

/** PnL and account value history per window — computed by HL, not capped by fill limits. */
export async function fetchPortfolio(address: string): Promise<HLPortfolio> {
  const pairs: [string, HLPortfolioWindow][] = await hlPost({ type: 'portfolio', user: address })
  return Object.fromEntries(pairs)
}

const FILLS_PAGE_SIZE = 2000
// HL serves only a wallet's 10,000 most recent fills, so this is all there is to fetch.
const MAX_FILL_PAGES = 5

/**
 * Every fill since `startTime`, oldest first, paging past HL's 2,000-per-request limit.
 * HL keeps only a wallet's newest 10,000 fills and pages oldest-first, so five pages
 * always reach the present; for very active wallets they start after `startTime`.
 */
export async function fetchFillsSince(address: string, startTime: number): Promise<HLFill[]> {
  const fills: HLFill[] = []
  let cursor = startTime
  for (let page = 0; page < MAX_FILL_PAGES; page++) {
    const batch: HLFill[] = await hlPost({
      type: 'userFillsByTime',
      user: address,
      startTime: cursor,
      aggregateByTime: true,
    })
    fills.push(...batch)
    if (batch.length < FILLS_PAGE_SIZE) break
    cursor = batch[batch.length - 1].time + 1
  }
  return fills
}
