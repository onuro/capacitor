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
import { Loader2, Palette, Plus, RefreshCw, Check, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import {
  listThemes,
  installTheme,
  activateTheme,
  deleteTheme,
  type WPTheme,
} from '@/lib/api/flux-wp-cli';
import type { BaseWpCliProps } from './types';

export function ThemeManager({ appName, nodeIp }: BaseWpCliProps) {
  const { zelidauth } = useAuthStore();
  const [installSlug, setInstallSlug] = useState('');
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Query for theme list
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wp-themes', appName, nodeIp],
    queryFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await listThemes(zelidauth, { appName, nodeIp });
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
      const result = await activateTheme(zelidauth, { appName, nodeIp }, slug);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Theme activated');
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to activate: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await deleteTheme(zelidauth, { appName, nodeIp }, slug);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Theme deleted');
      setConfirmDelete(null);
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to delete: ${error.message}`),
  });

  const installMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await installTheme(zelidauth, { appName, nodeIp }, slug);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Theme installed');
      setInstallDialogOpen(false);
      setInstallSlug('');
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to install: ${error.message}`),
  });

  const themes = Array.isArray(data) ? data : [];
  const isAnyMutating =
    activateMutation.isPending || deleteMutation.isPending || installMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-5" />
            Themes ({themes.length})
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
        ) : themes.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No themes found</p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="grid gap-2 md:grid-cols-2">
              {themes.map((theme) => (
                <div
                  key={theme.name}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{theme.title || theme.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>v{theme.version}</span>
                      <Badge
                        variant={theme.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {theme.status}
                      </Badge>
                      {theme.update === 'available' && (
                        <Badge variant="outline" className="text-xs text-yellow-600">
                          Update available
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {theme.status !== 'active' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => activateMutation.mutate(theme.name)}
                        disabled={isAnyMutating}
                        title="Activate"
                      >
                        <Check className="size-4" />
                      </Button>
                    )}
                    {theme.status !== 'active' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(theme.name)}
                        disabled={isAnyMutating}
                        title="Delete"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Install Theme Dialog */}
      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install Theme</DialogTitle>
            <DialogDescription>
              Enter the theme slug from wordpress.org (e.g., &quot;twentytwentyfour&quot;,
              &quot;astra&quot;)
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Theme slug"
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

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Theme</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{confirmDelete}&quot;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
