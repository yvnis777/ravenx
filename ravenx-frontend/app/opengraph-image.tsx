import { ImageResponse } from 'next/og'
import { C, CardFrame, loadLogo, OG_SIZE } from '@/lib/og'

export const alt = 'RavenX: copy any Hyperliquid wallet'
export const size = OG_SIZE
export const contentType = 'image/png'

/** The site-wide preview card, for links to any page without its own. */
export default async function Image() {
  const logo = await loadLogo()
  return new ImageResponse(
    (
      <CardFrame logo={logo}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
            Copy any Hyperliquid wallet
          </span>
          <span style={{ fontSize: 34, color: C.muted }}>
            Trades land on your own account, at the trader&apos;s entry or within a limit you set.
          </span>
        </div>
      </CardFrame>
    ),
    OG_SIZE
  )
}
