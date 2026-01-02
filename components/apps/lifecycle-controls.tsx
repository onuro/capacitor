'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play, Square, RotateCcw, Loader2, Globe, Server } from 'lucide-react';
import {
  startAppGlobally,
  stopAppGlobally,
  restartAppGlobally,
  startAppOnNode,
  stopAppOnNode,
  restartAppOnNode,
  type AppLocation,
} from '@/lib/api/flux-apps';
import { isZelidAuthValid } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';

interface LifecycleControlsProps {
  appName: string;
  locations?: AppLocation[];
}

type Action = 'start' | 'stop' | 'restart';
type ControlMode = 'global' | 'local';

export function LifecycleControls({ appName, locations = [] }: LifecycleControlsProps) {
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [controlMode, setControlMode] = useState<ControlMode>('global');
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const { zelidauth } = useAuthStore();
  const queryClient = useQueryClient();

  const actionConfig = {
    start: {
      label: 'Start',
      icon: Play,
      variant: 'default' as const,
    },
    stop: {
      label: 'Stop',
      icon: Square,
      variant: 'destructive' as const,
    },
    restart: {
      label: 'Restart',
      icon: RotateCcw,
      variant: 'outline' as const,
    },
  };

  const getDescription = (action: Action): string => {
    if (controlMode === 'global') {
      const actionText = action === 'start' ? 'start' : action === 'stop' ? 'stop' : 'restart';
      return `This will ${actionText} ALL instances of ${appName} across the network. This may take a while.`;
    } else {
      const instance = selectedInstance || 'the selected instance';
      return `This will ${action} ${appName} on ${instance}.`;
    }
  };

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (!zelidauth) throw new Error('Not authenticated');

      // For global operations, check session validity
      if (controlMode === 'global' && !isZelidAuthValid(zelidauth)) {
        throw new Error('Session expired. Please log in again to perform global operations.');
      }

      let response;

      if (controlMode === 'global') {
        // Global operations
        if (action === 'start') {
          response = await startAppGlobally(zelidauth, appName);
        } else if (action === 'stop') {
          response = await stopAppGlobally(zelidauth, appName);
        } else {
          response = await restartAppGlobally(zelidauth, appName);
        }
      } else {
        // Local operations - need selected instance
        if (!selectedInstance) {
          throw new Error('Please select an instance');
        }

        const [nodeIp, portStr] = selectedInstance.split(':');
        const nodePort = parseInt(portStr, 10) || 16127;

        if (action === 'start') {
          response = await startAppOnNode(zelidauth, appName, nodeIp, nodePort);
        } else if (action === 'stop') {
          response = await stopAppOnNode(zelidauth, appName, nodeIp, nodePort);
        } else {
          response = await restartAppOnNode(zelidauth, appName, nodeIp, nodePort);
        }
      }

      // Check API-level status
      if (response.status === 'error') {
        const data = response.data as unknown;
        const errorMessage =
          response.message ||
          (typeof data === 'object' && data !== null && 'message' in data
            ? (data as { message: string }).message
            : null) ||
          `Failed to ${action} app`;
        throw new Error(errorMessage);
      }

      return response;
    },
    onSuccess: (_, action) => {
      const scope = controlMode === 'global' ? 'globally' : `on ${selectedInstance}`;
      toast.success(`App ${action} initiated`, {
        description: `${appName} is being ${action}ed ${scope}. This may take a moment.`,
      });
      queryClient.invalidateQueries({ queryKey: ['appLocations', appName] });
      queryClient.invalidateQueries({ queryKey: ['appStats', appName] });
      setConfirmAction(null);
    },
    onError: (error, action) => {
      toast.error(`Failed to ${action} app`, {
        description: error instanceof Error ? error.message : 'An error occurred',
      });
    },
  });

  const handleAction = (action: Action) => {
    setConfirmAction(action);
  };

  const handleDialogClose = () => {
    setConfirmAction(null);
    // Reset to defaults when closing
    setControlMode('global');
    setSelectedInstance('');
  };

  const confirmAndExecute = () => {
    if (confirmAction) {
      mutation.mutate(confirmAction);
    }
  };

  const canConfirm = controlMode === 'global' || (controlMode === 'local' && selectedInstance);

  return (
    <>
      <div className="flex gap-2">
        {(Object.keys(actionConfig) as Action[]).map((action) => {
          const config = actionConfig[action];
          const Icon = config.icon;
          return (
            <Button
              key={action}
              variant={config.variant}
              size="sm"
              onClick={() => handleAction(action)}
              disabled={mutation.isPending}
            >
              <Icon className="h-4 w-4" />
              {config.label}
            </Button>
          );
        })}
      </div>

      <Dialog open={!!confirmAction} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction && `${actionConfig[confirmAction].label} ${appName}?`}
            </DialogTitle>
          </DialogHeader>

          {/* Mode Toggle - Button Group */}
          <div className="space-y-4">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <Button
                variant={controlMode === 'global' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => setControlMode('global')}
              >
                <Globe className="h-4 w-4 mr-2" />
                Global
              </Button>
              <Button
                variant={controlMode === 'local' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1"
                onClick={() => setControlMode('local')}
                disabled={locations.length === 0}
              >
                <Server className="h-4 w-4 mr-2" />
                Local
              </Button>
            </div>

            {/* Instance Selector (only for local mode) */}
            {controlMode === 'local' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Instance</label>
                <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an instance..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => {
                      const ipPort = loc.port ? `${loc.ip}:${loc.port}` : `${loc.ip}:16127`;
                      return (
                        <SelectItem key={ipPort} value={ipPort}>
                          {ipPort}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Description */}
            <p className="text-sm text-muted-foreground">
              {confirmAction && getDescription(confirmAction)}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleDialogClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction ? actionConfig[confirmAction].variant : 'default'}
              onClick={confirmAndExecute}
              disabled={mutation.isPending || !canConfirm}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Yes, ${confirmAction}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
