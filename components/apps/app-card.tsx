'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Box, Cpu, HardDrive, MemoryStick, ExternalLink } from 'lucide-react';
import type { FluxApp } from '@/lib/api/flux-apps';

interface AppCardProps {
  app: FluxApp;
}

export function AppCard({ app }: AppCardProps) {
  const totalCpu = app.compose.reduce((sum, c) => sum + c.cpu, 0);
  const totalRam = app.compose.reduce((sum, c) => sum + c.ram, 0);
  const totalHdd = app.compose.reduce((sum, c) => sum + c.hdd, 0);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Box className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{app.name}</CardTitle>
              <CardDescription className="text-sm">
                {app.compose.length} component{app.compose.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {app.instances} instances
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Cpu className="h-4 w-4" />
            <span>{totalCpu} CPU</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MemoryStick className="h-4 w-4" />
            <span>{totalRam} MB RAM</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-4 w-4" />
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
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href={`/apps/${app.name}`}>
              Manage
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <a
              href={`https://home.runonflux.io/apps/globalapps/${app.name}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
