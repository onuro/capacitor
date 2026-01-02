'use client';

import { cookieStorage, createStorage } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { http, createConfig } from 'wagmi';

// WalletConnect project ID
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'df787edc6839c7de49d527bba9199eaa';

// Metadata for wallet connections
export const metadata = {
  name: 'Capacitor - FluxCloud',
  description: 'Deploy apps on FluxCloud',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://capacitor.runonflux.com',
  icons: ['https://cloud.runonflux.com/images/logo.png'],
};

// Wagmi config for wallet connections
export const wagmiConfig = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  },
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
});

export { projectId };
