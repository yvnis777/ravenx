// lib/wagmi.ts
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { arbitrum, mainnet } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

// AppKit and the wagmi adapter must share one list: AppKit routes chain
// switches through its own networks, so a chain missing here can't be
// switched to. Arbitrum first — HL signatures are made on it.
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [arbitrum, mainnet]

export const wagmiAdapter = new WagmiAdapter({
  projectId: wcProjectId,
  networks,
})

export const wagmiConfig = wagmiAdapter.wagmiConfig
