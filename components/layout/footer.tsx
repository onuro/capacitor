import { Zap } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t py-6 md:py-8">
      <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-medium">Capacitor</span>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Deploy your apps on{' '}
          <a
            href="https://runonflux.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            FluxCloud
          </a>
          {' '}- Decentralized Infrastructure
        </p>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/runonflux"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://discord.gg/runonflux"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Discord
          </a>
        </div>
      </div>
    </footer>
  );
}
