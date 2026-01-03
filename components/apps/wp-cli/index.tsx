'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNodeAddress } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useNodeSelection } from '@/hooks/use-node-selection';
import { Loader2, Server, AlertCircle, Plug, Palette, Users, FileWarning } from 'lucide-react';
import { PluginManager } from './plugin-manager';
import { ThemeManager } from './theme-manager';
import { UserManager } from './user-manager';
import { ErrorLogsViewer } from './error-logs';

interface WPCliDashboardProps {
  appName: string;
}

export function WPCliDashboard({ appName }: WPCliDashboardProps) {
  const { zelidauth } = useAuthStore();

  // Use unified node selection hook with 'wp' as preferred component for domain extraction
  const {
    selectedNode,
    setSelectedNode,
    sortedLocations,
    isLoading: nodesLoading,
    getNodeLabel,
  } = useNodeSelection({ appName });

  // Not authenticated
  if (!zelidauth) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="size-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Please connect your wallet to manage WordPress.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading
  if (nodesLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // No running instances
  if (sortedLocations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="size-12 text-muted-foreground mb-4" />
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
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl font-bold text-blue-600">WP</span>
              WordPress Management
            </CardTitle>
            <Select value={selectedNode} onValueChange={setSelectedNode}>
              <SelectTrigger>
                <Server className="size-4 mr-2" />
                <SelectValue placeholder="Select node" />
              </SelectTrigger>
              <SelectContent>
                {sortedLocations.map((loc, idx) => {
                  const ipPort = formatNodeAddress(loc);
                  const label = getNodeLabel(loc, idx);
                  return (
                    <SelectItem key={ipPort} value={ipPort}>
                      {ipPort} {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        {/* {locations.length > 1 && (
          <CardContent className="pt-0">
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                This app has {locations.length} instances. Changes made here only affect the
                selected node and won&apos;t automatically sync to other instances.
              </AlertDescription>
            </Alert>
          </CardContent>
        )} */}
      </Card>

      {/* Management Tabs */}
      {selectedNode && (
        <Tabs defaultValue="plugins" className="space-y-4">
          <TabsList>
            <TabsTrigger value="plugins" className="flex items-center gap-2">
              <Plug className="size-4" />
              Plugins
            </TabsTrigger>
            <TabsTrigger value="themes" className="flex items-center gap-2">
              <Palette className="size-4" />
              Themes
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="size-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <FileWarning className="size-4" />
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
