/** Money for small accounts too: cents under $1,000, then K / M. */
export function fmtMoney(n: number | null | undefined, signed = false): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(2)}`
}

/** A price with 5 significant figures, like HL shows them. */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '—'
  return Number(n.toPrecision(5)).toLocaleString('en-US', { maximumFractionDigits: 6 })
}

/** A position size without trailing zeros. */
export function fmtSize(n: number): string {
  return Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function timeAgo(dateStr: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Must match the backend's DEFAULT_PRICE_TOLERANCE_PCT / MAX_PRICE_TOLERANCE_PCT. */
export const DEFAULT_ENTRY_TOLERANCE_PCT = 0.5
export const MAX_ENTRY_TOLERANCE_PCT = 10

/** A copy's entry rule in a few words; -1 is market, unset is the default. */
export function fmtEntryRule(tolerancePct: number | undefined): string {
  const tol = tolerancePct ?? DEFAULT_ENTRY_TOLERANCE_PCT
  if (tol === -1) return 'Market'
  if (tol === 0) return 'Entry same or better'
  return `Entry ≤ +${tol}%`
}
