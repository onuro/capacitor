'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, type State } from 'wagmi';
import { wagmiConfig } from '@/lib/wallet/config';
import { useState, type ReactNode } from 'react';

interface WalletProviderProps {
  children: ReactNode;
  initialState?: State;
}

export function WalletProvider({ children, initialState }: WalletProviderProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
