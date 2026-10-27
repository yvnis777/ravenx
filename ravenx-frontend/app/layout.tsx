// app/layout.tsx
import type { Metadata } from 'next'
import { Chakra_Petch, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { NetworkBanner } from '@/components/nav/NetworkBanner'
import { Agentation } from 'agentation'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
})

// Every number in the app — prices, sizes, PnL, addresses
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono-jb',
})

// Wordmark only — its clipped corners echo the raven mark
const chakraPetch = Chakra_Petch({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-chakra',
})

const DESCRIPTION =
  "Copy any Hyperliquid wallet from your own account, at the trader's entry or within a " +
  'limit you set. Non-custodial and open source.'

export const metadata: Metadata = {
  // Preview cards need absolute URLs; app/opengraph-image.tsx is the default card
  metadataBase: new URL('https://ravenx.app'),
  title: 'RavenX — Copy the best Hyperliquid traders',
  description: DESCRIPTION,
  openGraph: { siteName: 'RavenX', type: 'website', description: DESCRIPTION },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Font variables go on <html>: the theme's --font-* tokens are resolved at :root,
    // so variables set any lower are undefined there and every font falls back.
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${jetbrainsMono.variable} ${chakraPetch.variable}`}
      suppressHydrationWarning
    >
      <body className={`${inter.className} bg-surface text-fg min-h-screen`}>
        <Providers>
          <NetworkBanner />
          {children}
        </Providers>
        {process.env.NODE_ENV === 'development' && <Agentation />}
      </body>
    </html>
  )
}
