'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Box, Cpu, HardDrive, MemoryStick, ExternalLink, Globe } from 'lucide-react';
import type { FluxApp } from '@/lib/api/flux-apps';

interface AppCardProps {
  app: FluxApp;
}

// Get the first domain from any component, if available
function getFirstDomain(app: FluxApp): string | null {
  for (const component of app.compose) {
    if (component.domains && component.domains.length > 0) {
      return component.domains[0];
    }
  }
  return null;
}

// Get favicon URL - try direct favicon first
function getFaviconUrl(domain: string): string {
  return `https://${domain}/favicon.ico`;
}

// Fallback favicon URL using DuckDuckGo's service (more reliable than Google for new sites)
function getFallbackFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

export function AppCard({ app }: AppCardProps) {
  const totalCpu = app.compose.reduce((sum, c) => sum + c.cpu, 0);
  const totalRam = app.compose.reduce((sum, c) => sum + c.ram, 0);
  const totalHdd = app.compose.reduce((sum, c) => sum + c.hdd, 0);
  const domain = getFirstDomain(app);
  // 0 = direct, 1 = fallback (DuckDuckGo), 2 = give up (show Box icon)
  const [faviconStage, setFaviconStage] = useState(0);

  const handleFaviconError = () => {
    setFaviconStage((prev) => prev + 1);
  };

  const getFaviconSrc = () => {
    if (!domain) return null;
    if (faviconStage === 0) return getFaviconUrl(domain);
    if (faviconStage === 1) return getFallbackFaviconUrl(domain);
    return null;
  };

  const faviconSrc = getFaviconSrc();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
              {faviconSrc ? (
                <img
                  src={faviconSrc}
                  alt={`${app.name} favicon`}
                  width={24}
                  height={24}
                  className="size-6 rounded"
                  onError={handleFaviconError}
                />
              ) : (
                <Box className="size-5 text-primary" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">{app.description}</CardTitle>
              <CardDescription className="text-sm">
                {domain ? (
                  <a
                    href={`https://${domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:underline text-primary"
                  >
                    <Globe className="size-3" />
                    {domain}
                  </a>
                ) : (
                  `${app.compose.length} component${app.compose.length !== 1 ? 's' : ''}`
                )}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {app.instances}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Cpu className="size-4" />
            <span>{totalCpu} CPU</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MemoryStick className="size-4" />
            <span>{(totalRam / 1024).toFixed(1)} GB RAM</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HardDrive className="size-4" />
            <span>{totalHdd} GB SSD</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {app.compose.map((component) => (
            <Badge key={component.name} variant="secondary" className="text-xs">
              {component.repotag.split(':')[0].split('/').pop()}
            </Badge>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Button asChild className="flex-1">
            <Link href={`/apps/${app.name}`}>
              Manage
            </Link>
          </Button>
          {/* <Button variant="ghost" size="icon-sm" asChild>
            <a
              href={`https://home.runonflux.io/apps/globalapps/${app.name}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4" />
            </a>
          </Button> */}
        </div>
      </CardContent>
    </Card>
  );
}
