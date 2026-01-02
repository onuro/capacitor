'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAppLocations, type AppLocation } from '@/lib/api/flux-apps';
import { useAuthStore } from '@/stores/auth';
import { Loader2, Server, AlertCircle, Plug, Palette, Users, AlertTriangle, FileWarning } from 'lucide-react';
import { PluginManager } from './plugin-manager';
import { ThemeManager } from './theme-manager';
import { UserManager } from './user-manager';
import { ErrorLogsViewer } from './error-logs';

interface WPCliDashboardProps {
  appName: string;
}

export function WPCliDashboard({ appName }: WPCliDashboardProps) {
  const { zelidauth } = useAuthStore();
  const [selectedNode, setSelectedNode] = useState<string>('');

  // Fetch app locations
  const { data: locationsData, isLoading: locationsLoading } = useQuery({
    queryKey: ['appLocations', appName],
    queryFn: () => getAppLocations(appName),
    staleTime: 30000,
  });

  const locations: AppLocation[] = locationsData?.data || [];

  // Auto-select first node when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedNode) {
      setSelectedNode(locations[0].ip);
    }
  }, [locations, selectedNode]);

  // Not authenticated
  if (!zelidauth) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Please connect your wallet to manage WordPress.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading
  if (locationsLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // No running instances
  if (locations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No running instances found. Start the app to manage WordPress.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with node selection */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl font-bold text-blue-600">WP</span>
              WordPress Management
            </CardTitle>
            <Select value={selectedNode} onValueChange={setSelectedNode}>
              <SelectTrigger className="w-[220px]">
                <Server className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Select node" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc, idx) => (
                  <SelectItem key={loc.ip} value={loc.ip}>
                    {loc.ip} {idx === 0 ? '(primary)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        {locations.length > 1 && (
          <CardContent className="pt-0">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This app has {locations.length} instances. Changes made here only affect the
                selected node and won&apos;t automatically sync to other instances.
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {/* Management Tabs */}
      {selectedNode && (
        <Tabs defaultValue="plugins" className="space-y-4">
          <TabsList>
            <TabsTrigger value="plugins" className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              Plugins
            </TabsTrigger>
            <TabsTrigger value="themes" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Themes
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <FileWarning className="h-4 w-4" />
              Error Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plugins">
            <PluginManager appName={appName} nodeIp={selectedNode} />
          </TabsContent>

          <TabsContent value="themes">
            <ThemeManager appName={appName} nodeIp={selectedNode} />
          </TabsContent>

          <TabsContent value="users">
            <UserManager appName={appName} nodeIp={selectedNode} />
          </TabsContent>

          <TabsContent value="logs">
            <ErrorLogsViewer appName={appName} nodeIp={selectedNode} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// Re-export for convenience
export { isWordPressApp } from './wp-detection';
