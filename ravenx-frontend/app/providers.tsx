// app/providers.tsx
'use client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { networks, wagmiAdapter, wagmiConfig } from '@/lib/wagmi'
import { useState } from 'react'

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: networks[0],
  projectId: wcProjectId,
  metadata: {
    name: 'RavenX',
    description: 'Copy-trading platform for Hyperliquid',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://ravenx.app',
    icons: [`${typeof window !== 'undefined' ? window.location.origin : 'https://ravenx.app'}/ravenx-icon-512.png`],
  },
  themeMode: 'dark',
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  }))
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
