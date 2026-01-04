import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Footer } from '@/components/layout/footer';
import { WalletProvider } from '@/components/wallet/providers';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { Toaster } from '@/components/ui/sonner';

const figtree = Figtree({
  variable: '--font-figtree',
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
      <body className={`${figtree.variable} font-sans antialiased`}>
        <ThemeProvider>
          <WalletProvider>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <AppHeader />
                <main className="flex-1 flex flex-col min-h-full bg-muted">{children}</main>
                <Footer />
              </SidebarInset>
            </SidebarProvider>
            <Toaster />
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
