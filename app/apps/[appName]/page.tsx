'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LifecycleControls } from '@/components/apps/lifecycle-controls';
import { LogViewer } from '@/components/apps/log-viewer';
import { MetricsDashboard } from '@/components/apps/metrics-dashboard';
import { FileBrowser } from '@/components/apps/file-browser';
import { WPCliDashboard, isWordPressApp } from '@/components/apps/wp-cli';
import { getAppSpecification, getAppLocations } from '@/lib/api/flux-apps';
import {
  ArrowLeft,
  Box,
  ExternalLink,
  Loader2,
  AlertCircle,
  Cpu,
  MemoryStick,
  HardDrive,
  Globe,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ appName: string }>;
}

export default function AppDetailPage({ params }: PageProps) {
  const { appName } = use(params);

  const {
    data: specData,
    isLoading: specLoading,
    isError: specError,
  } = useQuery({
    queryKey: ['appSpec', appName],
    queryFn: () => getAppSpecification(appName),
    staleTime: 60000,
  });

  const { data: locationsData } = useQuery({
    queryKey: ['appLocations', appName],
    queryFn: () => getAppLocations(appName),
    refetchInterval: 30000,
  });

  const app = specData?.data;
  const locations = locationsData?.data || [];
  const isRunning = locations.length > 0;

  if (specLoading) {
    return (
      <main className="container py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </main>
    );
  }

  if (specError || !app) {
    return (
      <main className="container py-8">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">App Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The application &quot;{appName}&quot; could not be found.
          </p>
          <Button asChild variant="outline">
            <Link href="/apps">
              <ArrowLeft className="h-4 w-4" />
              Back to Apps
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  const totalCpu = app.compose.reduce((sum, c) => sum + c.cpu, 0);
  const totalRam = app.compose.reduce((sum, c) => sum + c.ram, 0);
  const totalHdd = app.compose.reduce((sum, c) => sum + c.hdd, 0);
  const showWpTab = isWordPressApp(app);

  return (
    <main className="container py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/apps">
            <ArrowLeft className="h-4 w-4" />
            Back to Apps
          </Link>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
              <Box className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{app.name}</h1>
                <Badge variant={isRunning ? 'default' : 'secondary'}>
                  {isRunning ? `${locations.length} Running` : 'Stopped'}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {app.description || 'No description'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <LifecycleControls appName={appName} locations={locations} />
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://home.runonflux.io/apps/globalapps/${appName}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                View on Flux
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="metrics" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            {showWpTab && <TabsTrigger value="wordpress">WordPress</TabsTrigger>}
          </TabsList>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Globe className="h-4 w-4" />
              <span className="font-medium text-foreground">{app.instances}</span>
              <span>instances</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Cpu className="h-4 w-4" />
              <span className="font-medium text-foreground">{totalCpu}</span>
              <span>CPU</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MemoryStick className="h-4 w-4" />
              <span className="font-medium text-foreground">{totalRam}</span>
              <span>MB</span>
            </div>
            <div className="flex items-center gap-1.5">
              <HardDrive className="h-4 w-4" />
              <span className="font-medium text-foreground">{totalHdd}</span>
              <span>GB</span>
            </div>
          </div>
        </div>

        <TabsContent value="metrics">
          <MetricsDashboard appName={appName} />
        </TabsContent>

        <TabsContent value="logs">
          <LogViewer appName={appName} />
        </TabsContent>

        <TabsContent value="files">
          <FileBrowser appName={appName} />
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>App Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Owner</h4>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {app.owner}
                  </code>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Containers</h4>
                  <div className="space-y-3">
                    {app.compose.map((component, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg border bg-muted/30"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{component.name}</span>
                          <Badge variant="outline">{component.repotag}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">CPU:</span>{' '}
                            {component.cpu} cores
                          </div>
                          <div>
                            <span className="text-muted-foreground">RAM:</span>{' '}
                            {component.ram} MB
                          </div>
                          <div>
                            <span className="text-muted-foreground">HDD:</span>{' '}
                            {component.hdd} GB
                          </div>
                        </div>
                        {component.ports.length > 0 && (
                          <div className="mt-2 text-sm">
                            <span className="text-muted-foreground">Ports:</span>{' '}
                            {component.ports.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Raw Specification</h4>
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[300px]">
                    {JSON.stringify(app, null, 2)}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {showWpTab && (
          <TabsContent value="wordpress">
            <WPCliDashboard appName={appName} />
          </TabsContent>
        )}
      </Tabs>
    </main>
  );
}
