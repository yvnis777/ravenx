import { ImageResponse } from 'next/og'
import { fetchAccountEquity, fetchPortfolio, fetchUserState } from '@/lib/hyperliquid'
import { C, CardFrame, loadLogo, OG_SIZE, withTimeout } from '@/lib/og'
import { fmtMoney, truncateAddress } from '@/lib/format'
import { periodPnl } from '@/lib/trader-stats'

export const alt = 'Copy this Hyperliquid wallet on RavenX'
export const size = OG_SIZE
export const contentType = 'image/png'
// Stats are read live from Hyperliquid; a card shared widely is drawn at most
// every 10 minutes, not once per crawler hit.
export const revalidate = 600

/** How long X's crawler waits for us is short; past this the card has no stats. */
const HL_TIMEOUT_MS = 3_000

interface Stats {
  equity: number
  pnl30d: number
  pnlAll: number
  positions: number
}

async function readStats(address: string): Promise<Stats | null> {
  try {
    return await withTimeout(
      (async () => {
        const [state, portfolio] = await Promise.all([
          fetchUserState(address),
          fetchPortfolio(address),
        ])
        return {
          equity: await fetchAccountEquity(address, state),
          pnl30d: periodPnl(portfolio, '30d').pnl,
          pnlAll: periodPnl(portfolio, 'all').pnl,
          positions: state.assetPositions.filter((p) => parseFloat(p.position.szi) !== 0).length,
        }
      })(),
      HL_TIMEOUT_MS
    )
  } catch {
    return null
  }
}

function Stat({ label, value, color = C.fg }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 22, color: C.faint, textTransform: 'uppercase', letterSpacing: 2 }}>
        {label}
      </span>
      <span style={{ fontSize: 44, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

const tone = (n: number) => (n > 0 ? C.profit : n < 0 ? C.loss : C.fg)

/** The card for a shared wallet link: who it is, how it's done, and that it's copyable. */
export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const valid = /^0x[0-9a-fA-F]{40}$/.test(address)
  const [logo, stats] = await Promise.all([
    loadLogo(),
    valid ? readStats(address.toLowerCase()) : Promise.resolve(null),
  ])

  return new ImageResponse(
    (
      <CardFrame logo={logo}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 30, color: C.accent }}>Copy this wallet</span>
            <span style={{ fontSize: 68, fontWeight: 700 }}>
              {valid ? truncateAddress(address) : 'Hyperliquid wallet'}
            </span>
          </div>
          {stats ? (
            <div style={{ display: 'flex', gap: 72 }}>
              <Stat label="Equity" value={fmtMoney(stats.equity)} />
              <Stat label="30D PnL" value={fmtMoney(stats.pnl30d, true)} color={tone(stats.pnl30d)} />
              <Stat label="All-time PnL" value={fmtMoney(stats.pnlAll, true)} color={tone(stats.pnlAll)} />
              <Stat label="Open" value={String(stats.positions)} />
            </div>
          ) : (
            <span style={{ fontSize: 32, color: C.muted }}>Live stats and one-click copy on RavenX</span>
          )}
        </div>
      </CardFrame>
    ),
    OG_SIZE
  )
}
