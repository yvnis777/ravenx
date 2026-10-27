import type { Metadata } from 'next'
import { truncateAddress } from '@/lib/format'

/** A shared wallet link names the wallet; the card is opengraph-image.tsx beside this. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>
}): Promise<Metadata> {
  const { address } = await params
  const title = /^0x[0-9a-fA-F]{40}$/.test(address)
    ? `Copy ${truncateAddress(address)} on RavenX`
    : 'Copy a Hyperliquid wallet on RavenX'
  const description =
    'Live stats for this Hyperliquid wallet. Copy its trades from your own account, ' +
    "at its entry price or within a limit you set."
  return {
    title,
    description,
    openGraph: { title, description, url: `/traders/${address}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default function TraderLayout({ children }: { children: React.ReactNode }) {
  return children
}
