'use client';

import Link from 'next/link';
import { ConnectButton } from '@/components/wallet/connect-button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="size-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">Capacitor</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Home
          </Link>
          <Link
            href="/apps"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            My Apps
          </Link>
          <Link
            href="/register"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Deploy App
          </Link>
          <a
            href="https://runonflux.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Learn More
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
