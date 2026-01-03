'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  ArrowUp,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import {
  listPlugins,
  installPlugin,
  activatePlugin,
  deactivatePlugin,
  updatePlugin,
  deletePlugin,
  type WPPlugin,
} from '@/lib/api/flux-wp-cli';
import type { BaseWpCliProps } from './types';

export function PluginManager({ appName, nodeIp }: BaseWpCliProps) {
  const { zelidauth } = useAuthStore();
  const [installSlug, setInstallSlug] = useState('');
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'deactivate';
    plugin: string;
  } | null>(null);

  // Query for plugin list
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wp-plugins', appName, nodeIp],
    queryFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await listPlugins(zelidauth, { appName, nodeIp });
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result.data || [];
    },
    enabled: !!zelidauth && !!nodeIp,
    staleTime: 30000,
  });

  // Mutations
  const activateMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await activatePlugin(zelidauth, { appName, nodeIp }, slug);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Plugin activated');
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to activate: ${error.message}`),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await deactivatePlugin(zelidauth, { appName, nodeIp }, slug);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Plugin deactivated');
      setConfirmAction(null);
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to deactivate: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await updatePlugin(zelidauth, { appName, nodeIp }, slug);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Plugin updated');
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to update: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await deletePlugin(zelidauth, { appName, nodeIp }, slug);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Plugin deleted');
      setConfirmAction(null);
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to delete: ${error.message}`),
  });

  const installMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await installPlugin(zelidauth, { appName, nodeIp }, slug);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Plugin installed');
      setInstallDialogOpen(false);
      setInstallSlug('');
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to install: ${error.message}`),
  });

  const plugins = Array.isArray(data) ? data : [];
  const isAnyMutating =
    activateMutation.isPending ||
    deactivateMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    installMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-5" />
            Plugins ({plugins.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={() => setInstallDialogOpen(true)}>
              <Plus className="size-4 mr-1" />
              Install
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : plugins.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No plugins found</p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="grid gap-2 md:grid-cols-2">
              {plugins.map((plugin) => (
                <div
                  key={plugin.name}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{plugin.title || plugin.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>v{plugin.version}</span>
                      <Badge
                        variant={plugin.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {plugin.status}
                      </Badge>
                      {plugin.update === 'available' && (
                        <Badge variant="outline" className="text-xs text-yellow-600">
                          Update available
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {plugin.status === 'inactive' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => activateMutation.mutate(plugin.name)}
                        disabled={isAnyMutating}
                        title="Activate"
                      >
                        <Play className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfirmAction({ type: 'deactivate', plugin: plugin.name })
                        }
                        disabled={isAnyMutating}
                        title="Deactivate"
                      >
                        <Pause className="size-4" />
                      </Button>
                    )}
                    {plugin.update === 'available' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateMutation.mutate(plugin.name)}
                        disabled={isAnyMutating}
                        title="Update"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setConfirmAction({ type: 'delete', plugin: plugin.name })
                      }
                      disabled={isAnyMutating}
                      title="Delete"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Install Plugin Dialog */}
      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install Plugin</DialogTitle>
            <DialogDescription>
              Enter the plugin slug from wordpress.org (e.g., &quot;akismet&quot;,
              &quot;contact-form-7&quot;)
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Plugin slug"
            value={installSlug}
            onChange={(e) => setInstallSlug(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && installSlug.trim()) {
                installMutation.mutate(installSlug.trim());
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => installMutation.mutate(installSlug.trim())}
              disabled={!installSlug.trim() || installMutation.isPending}
            >
              {installMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              Install
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Action Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === 'delete' ? 'Delete Plugin' : 'Deactivate Plugin'}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {confirmAction?.type} &quot;{confirmAction?.plugin}
              &quot;?
              {confirmAction?.type === 'delete' &&
                ' This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === 'delete' ? 'destructive' : 'default'}
              onClick={() => {
                if (confirmAction?.type === 'delete') {
                  deleteMutation.mutate(confirmAction.plugin);
                } else if (confirmAction?.type === 'deactivate') {
                  deactivateMutation.mutate(confirmAction.plugin);
                }
              }}
              disabled={deleteMutation.isPending || deactivateMutation.isPending}
            >
              {(deleteMutation.isPending || deactivateMutation.isPending) && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              {confirmAction?.type === 'delete' ? 'Delete' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
