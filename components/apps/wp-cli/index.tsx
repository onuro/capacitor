'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth';
import { useNodeSelection } from '@/hooks/use-node-selection';
import { useResolvedNode } from '@/components/apps/node-picker';
import { Loader2, AlertCircle, Plug, Palette, Users, FileWarning, Wrench, Image } from 'lucide-react';
import { PluginManager } from './plugin-manager';
import { ThemeManager } from './theme-manager';
import { UserManager } from './user-manager';
import { ErrorLogsViewer } from './error-logs';
import { MaintenanceManager } from './maintenance-manager';
import { MediaManager } from './media-manager';

interface WPCliDashboardProps {
  appName: string;
  selectedNode: string;
}

export function WPCliDashboard({ appName, selectedNode }: WPCliDashboardProps) {
  const { zelidauth } = useAuthStore();

  // Use unified node selection hook for locations
  const { sortedLocations, isLoading: nodesLoading } = useNodeSelection({ appName, autoSelectMaster: false });

  // Resolve "auto" to actual node
  const { resolvedNode } = useResolvedNode(appName, selectedNode);

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
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl font-bold text-blue-600">WP</span>
            WordPress Management
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Management Tabs */}
      {resolvedNode && (
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
            <TabsTrigger value="media" className="flex items-center gap-2">
              <Image className="size-4" />
              Media
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="size-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <FileWarning className="size-4" />
              Error Logs
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center gap-2">
              <Wrench className="size-4" />
              Maintenance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plugins">
            <PluginManager appName={appName} nodeIp={resolvedNode} />
          </TabsContent>

          <TabsContent value="themes">
            <ThemeManager appName={appName} nodeIp={resolvedNode} />
          </TabsContent>

          <TabsContent value="media">
            <MediaManager appName={appName} nodeIp={resolvedNode} />
          </TabsContent>

          <TabsContent value="users">
            <UserManager appName={appName} nodeIp={resolvedNode} />
          </TabsContent>

          <TabsContent value="logs">
            <ErrorLogsViewer appName={appName} nodeIp={resolvedNode} />
          </TabsContent>

          <TabsContent value="maintenance">
            <MaintenanceManager appName={appName} nodeIp={resolvedNode} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// Re-export for convenience
export { isWordPressApp } from './wp-detection';
