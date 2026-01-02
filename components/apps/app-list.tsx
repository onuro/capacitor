'use client';

import { useQuery } from '@tanstack/react-query';
import { AppCard } from './app-card';
import { getOwnedApps, type FluxApp } from '@/lib/api/flux-apps';
import { useAuthStore } from '@/stores/auth';
import { Loader2, AlertCircle, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectButton } from '@/components/wallet/connect-button';
import Link from 'next/link';

export function AppList() {
  const { zelid, isAuthenticated } = useAuthStore();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ownedApps', zelid],
    queryFn: () => getOwnedApps(zelid!),
    enabled: isAuthenticated && !!zelid,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Box className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
        <p className="text-muted-foreground max-w-md mb-6">
          Connect your wallet to view and manage your deployed applications.
        </p>
        <ConnectButton />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading your apps...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Apps</h3>
        <p className="text-muted-foreground max-w-md mb-4">
          {error instanceof Error ? error.message : 'An error occurred while fetching your apps.'}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  const apps = data?.data || [];

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Box className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Apps Yet</h3>
        <p className="text-muted-foreground max-w-md mb-4">
          You haven&apos;t deployed any applications to FluxCloud yet.
        </p>
        <Button asChild>
          <Link href="/register">Deploy Your First App</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {apps.map((app: FluxApp) => (
        <AppCard key={app.name} app={app} />
      ))}
    </div>
  );
}
