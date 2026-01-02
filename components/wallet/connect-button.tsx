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
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 shrink-0">
                <path d="M19.9005 39.8011C30.8913 39.8011 39.8011 30.8913 39.8011 19.9005C39.8011 8.90977 30.8913 0 19.9005 0C8.90977 0 0 8.90977 0 19.9005C0 30.8913 8.90977 39.8011 19.9005 39.8011Z" fill="#1B63EF"/>
                <path d="M18.8432 20.9422L19.2291 20.7195C19.5815 20.5159 20.1532 20.5159 20.5056 20.7195L20.8914 20.9422L19.8673 21.5335L18.8432 20.9422Z" fill="white"/>
                <path d="M18.8471 20.9444L19.8712 21.5357V30.5231L18.8471 29.9318V20.9444Z" fill="white"/>
                <path d="M19.8403 21.5391L20.8644 20.9479V29.9353L19.8403 30.5265V21.5391Z" fill="white"/>
                <path d="M19.8874 30.4974L25.008 27.5411V29.1691C25.008 29.5761 24.7221 30.0711 24.3697 30.2747L19.8874 32.8625V30.4974Z" fill="white"/>
                <path d="M14.779 27.5411L19.8995 30.4974V32.8625L15.4173 30.2747C15.0648 30.0711 14.779 29.5761 14.779 29.1691V27.5411Z" fill="white"/>
                <path d="M20.5496 17.9632L21.5737 18.5545V19.737L21.1879 19.5143C20.8353 19.3107 20.5496 18.8157 20.5496 18.4087V17.9632Z" fill="white"/>
                <path d="M20.5496 17.9629L27.7184 13.824L28.7425 14.4153L21.5737 18.5542L20.5496 17.9629Z" fill="white"/>
                <path d="M23.5293 11.4587L24.9391 10.6447C25.2918 10.4412 25.8632 10.4412 26.2158 10.6447L30.6981 13.2326L28.6498 14.4151L23.5293 11.4587Z" fill="white"/>
                <path d="M21.5428 18.5529L28.7116 14.4141V15.5966L21.5428 19.7355V18.5529Z" fill="white"/>
                <path d="M28.6383 14.3915L30.6866 13.2089V18.3845C30.6866 18.7915 30.4007 19.2865 30.0483 19.4901L28.6383 20.3041V14.3915Z" fill="white"/>
                <path d="M9.10252 13.1855L13.5848 10.5976C13.9373 10.3941 14.5088 10.3941 14.8614 10.5976L16.2712 11.4116L11.1507 14.368L9.10252 13.1855Z" fill="white"/>
                <path d="M18.2791 18.4834L19.3032 17.8921V18.3376C19.3032 18.7446 19.0175 19.2396 18.6649 19.4432L18.2791 19.6659V18.4834Z" fill="white"/>
                <path d="M11.1366 14.3449L18.3054 18.4839V19.6664L11.1366 15.5274V14.3449Z" fill="white"/>
                <path d="M9.10252 13.1618L11.1507 14.3444V20.2571L9.74082 19.4431C9.3883 19.2395 9.10252 18.7445 9.10252 18.3375V13.1618Z" fill="white"/>
                <path d="M11.1684 14.3861C11.1508 14.3759 11.1508 14.3594 11.1684 14.3493L12.1287 13.7948C12.1464 13.7847 12.1749 13.7847 12.1926 13.7948L19.2975 17.8969C19.3152 17.9071 19.3152 17.9235 19.2975 17.9337L18.3372 18.4881C18.3196 18.4984 18.2911 18.4984 18.2734 18.4881L11.1684 14.3861Z" fill="white"/>
                <path d="M28.6383 21.467C28.6383 21.06 28.924 20.565 29.2765 20.3615L30.6864 19.5475V24.2777L28.6383 25.4602V21.467Z" fill="white"/>
                <path d="M25.5634 27.9487C25.5634 27.5415 25.8491 27.0467 26.2017 26.8431L30.6838 24.2553V25.8833C30.6838 26.2903 30.3981 26.7853 30.0456 26.9889L25.5634 29.5767V27.9487Z" fill="white"/>
                <path d="M9.10252 24.2773L13.5848 26.8651C13.9373 27.0686 14.2231 27.5636 14.2231 27.9707V29.5987L9.74082 27.0109C9.3883 26.8073 9.10252 26.3124 9.10252 25.9053V24.2773Z" fill="white"/>
                <path d="M9.10252 19.5475L10.5124 20.3615C10.8649 20.5651 11.1507 21.0601 11.1507 21.4671V25.4602L9.10252 24.2777V19.5475Z" fill="white"/>
                <path d="M14.6843 9.94493L17.9614 8.05287L20.0096 9.23541L17.3708 10.7589C17.0184 10.9625 16.4467 10.9625 16.0942 10.7589L14.6843 9.94493Z" fill="white"/>
                <path d="M17.8063 8.14792L19.2161 7.33391C19.5687 7.13039 20.1403 7.13039 20.4928 7.33391L25.1798 10.04L23.7699 10.854C23.4175 11.0575 22.8459 11.0575 22.4932 10.854L17.8063 8.14792Z" fill="white"/>
              </svg>
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
