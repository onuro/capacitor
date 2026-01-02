import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { WalletProvider } from '@/components/wallet/providers';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Capacitor - Deploy Apps on FluxCloud',
  description:
    'Deploy Docker containers on FluxCloud decentralized infrastructure. Simple, secure, and globally distributed.',
  keywords: ['FluxCloud', 'Flux', 'Docker', 'Decentralized', 'Cloud', 'Deploy'],
  openGraph: {
    title: 'Capacitor - Deploy Apps on FluxCloud',
    description:
      'Deploy Docker containers on FluxCloud decentralized infrastructure.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <WalletProvider>
            <div className="relative flex min-h-screen flex-col">
              <Header />
              <main className="flex-1 flex flex-col min-h-full bg-muted">{children}</main>
              <Footer />
            </div>
            <Toaster />
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
