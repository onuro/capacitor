'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/auth';
import { isSSPAvailable, signWithSSP } from '@/lib/wallet/ssp';
import { isZelcoreAvailable, signWithZelcore } from '@/lib/wallet/zelcore';
import { Loader2, Wallet, LogOut, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

type WalletOption = 'metamask' | 'walletconnect' | 'ssp' | 'zelcore';

export function ConnectButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const { isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const {
    zelid,
    isAuthenticated,
    fetchLoginPhrase,
    login,
    logout,
    clearError,
    error,
  } = useAuthStore();

  const handleWalletConnect = async (wallet: WalletOption) => {
    setSelectedWallet(wallet);
    setIsConnecting(true);
    clearError();

    try {
      // Get login phrase from API
      const loginPhrase = await fetchLoginPhrase();

      let walletAddress: string;
      let signature: string;

      if (wallet === 'metamask' || wallet === 'walletconnect') {
        // Find the appropriate connector
        const connector = connectors.find((c) => {
          if (wallet === 'metamask') {
            return c.id === 'injected' || c.name.toLowerCase().includes('metamask');
          }
          return c.id === 'walletConnect' || c.name.toLowerCase().includes('walletconnect');
        });

        if (!connector) {
          throw new Error(`${wallet} connector not found`);
        }

        // Connect wallet
        const result = await connectAsync({ connector });
        walletAddress = result.accounts[0];

        // Sign the login phrase
        signature = await signMessageAsync({ message: loginPhrase });
      } else if (wallet === 'ssp') {
        if (!isSSPAvailable()) {
          throw new Error('SSP Wallet is not installed');
        }

        const result = await signWithSSP(loginPhrase);
        walletAddress = result.address;
        signature = result.signature;
      } else if (wallet === 'zelcore') {
        if (!isZelcoreAvailable()) {
           throw new Error('Zelcore wallet is not available.');
        }

        toast.info('Please sign the message in your Zelcore app', {
          duration: 10000,
        });

        const result = await signWithZelcore(loginPhrase, '');
        if (!result) {
          throw new Error('Zelcore signing was cancelled or failed');
        }
        if (!result.address) {
          throw new Error('Zelcore did not return a valid address');
        }
        walletAddress = result.address;
        signature = result.signature;
      } else {
        throw new Error('Unknown wallet type');
      }

      // Login with the API
      console.log('[ConnectButton] Attempting login with:', { walletAddress, signature, loginPhrase, wallet });
      await login(walletAddress, signature, loginPhrase, wallet);
      setIsOpen(false);
      toast.success('Successfully connected wallet');
    } catch (err) {
      console.error('Wallet connection error:', err);
      // Error is already set in the store by login/fetchLoginPhrase
      toast.error(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
      setSelectedWallet(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (isConnected) {
        await disconnectAsync();
      }
      logout();
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Show connected state
  if (isAuthenticated && zelid) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-md">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-sm font-medium">{truncateAddress(zelid)}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDisconnect}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Disconnect</span>
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Wallet className="h-4 w-4" />
          Connect Wallet
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Your Wallet</DialogTitle>
          <DialogDescription>
            Choose a wallet to connect and sign in to Capacitor
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950/20 rounded-md">
            {error}
          </div>
        )}

        <div className="grid gap-3 py-4">
          {/* MetaMask */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleWalletConnect('metamask')}
            disabled={isConnecting}
          >
            {isConnecting && selectedWallet === 'metamask' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Image
                src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
                alt="MetaMask"
                width={24}
                height={24}
                className="h-6 w-6"
              />
            )}
            <div className="flex flex-col items-start">
              <span className="font-medium">MetaMask</span>
              <span className="text-xs text-muted-foreground">
                Browser extension
              </span>
            </div>
          </Button>

          {/* WalletConnect */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleWalletConnect('walletconnect')}
            disabled={isConnecting}
          >
            {isConnecting && selectedWallet === 'walletconnect' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Image
                src="https://avatars.githubusercontent.com/u/37784886"
                alt="WalletConnect"
                width={24}
                height={24}
                className="h-6 w-6 rounded"
              />
            )}
            <div className="flex flex-col items-start">
              <span className="font-medium">WalletConnect</span>
              <span className="text-xs text-muted-foreground">
                Mobile & desktop wallets
              </span>
            </div>
          </Button>

          {/* SSP Wallet */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleWalletConnect('ssp')}
            disabled={isConnecting || !isSSPAvailable()}
          >
            {isConnecting && selectedWallet === 'ssp' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="h-6 w-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                SSP
              </div>
            )}
            <div className="flex flex-col items-start">
              <span className="font-medium">SSP Wallet</span>
              <span className="text-xs text-muted-foreground">
                {isSSPAvailable() ? 'Browser extension' : 'Not installed'}
              </span>
            </div>
          </Button>

          {/* Zelcore */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleWalletConnect('zelcore')}
            disabled={isConnecting}
          >
            {isConnecting && selectedWallet === 'zelcore' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Image
                src="https://raw.githubusercontent.com/ArkaneNetwork/arkane-connect/master/assets/wallets/zelcore.png"
                alt="Zelcore"
                width={24}
                height={24}
                className="h-6 w-6"
              />
            )}
            <div className="flex flex-col items-start">
              <span className="font-medium">
                {isConnecting && selectedWallet === 'zelcore' ? 'Check Zelcore App' : 'Zelcore'}
              </span>
              <span className="text-xs text-muted-foreground">
                {isConnecting && selectedWallet === 'zelcore' ? 'Waiting for signature...' : 'Multi-asset wallet'}
              </span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
