'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Play, Square, RotateCcw, Loader2 } from 'lucide-react';
import { startApp, stopApp, restartApp } from '@/lib/api/flux-apps';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';

interface LifecycleControlsProps {
  appName: string;
}

type Action = 'start' | 'stop' | 'restart';

export function LifecycleControls({ appName }: LifecycleControlsProps) {
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const { zelidauth } = useAuthStore();
  const queryClient = useQueryClient();

  const actionConfig = {
    start: {
      label: 'Start',
      icon: Play,
      description: `This will start all instances of ${appName}.`,
      variant: 'default' as const,
      fn: startApp,
    },
    stop: {
      label: 'Stop',
      icon: Square,
      description: `This will stop all running instances of ${appName}. Users will not be able to access the app.`,
      variant: 'destructive' as const,
      fn: stopApp,
    },
    restart: {
      label: 'Restart',
      icon: RotateCcw,
      description: `This will restart all instances of ${appName}. There may be brief downtime.`,
      variant: 'outline' as const,
      fn: restartApp,
    },
  };

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (!zelidauth) throw new Error('Not authenticated');
      return actionConfig[action].fn(zelidauth, appName);
    },
    onSuccess: (_, action) => {
      toast.success(`App ${action} initiated`, {
        description: `${appName} is being ${action}ed. This may take a moment.`,
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

  const confirmAndExecute = () => {
    if (confirmAction) {
      mutation.mutate(confirmAction);
    }
  };

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

      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction && `${actionConfig[confirmAction].label} ${appName}?`}
            </DialogTitle>
            <DialogDescription>
              {confirmAction && actionConfig[confirmAction].description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction ? actionConfig[confirmAction].variant : 'default'}
              onClick={confirmAndExecute}
              disabled={mutation.isPending}
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
