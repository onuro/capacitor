'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Wrench,
  RefreshCw,
  AlertTriangle,
  Download,
  CheckCircle2,
  XCircle,
  Shield,
  Trash2,
  RotateCcw,
  Settings,
  Plus,
  Pencil,
  Search,
  Eye,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import {
  getCoreInfo,
  updateCore,
  verifyCoreChecksums,
  flushAllCaches,
  exportDatabase,
  resetDatabase,
  downloadCore,
  installCore,
  listConfig,
  setConfig,
  deleteConfig,
  type CoreReinstallParams,
  type WPConfigItem,
} from '@/lib/api/flux-wp-cli';
import type { BaseWpCliProps } from './types';

function generatePassword(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

type ReinstallStep = 'idle' | 'backup' | 'reset' | 'download' | 'install' | 'complete' | 'error';

export function MaintenanceManager({ appName, nodeIp }: BaseWpCliProps) {
  const { zelidauth } = useAuthStore();
  const queryClient = useQueryClient();

  // Reinstall dialog state
  const [reinstallDialogOpen, setReinstallDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reinstallStep, setReinstallStep] = useState<ReinstallStep>('idle');
  const [reinstallError, setReinstallError] = useState<string | null>(null);
  const [installParams, setInstallParams] = useState<CoreReinstallParams>({
    siteUrl: '',
    siteTitle: 'My WordPress Site',
    adminUser: 'admin',
    adminPassword: generatePassword(),
    adminEmail: '',
  });

  // Config state
  const [configSearch, setConfigSearch] = useState('');
  const [addConfigDialogOpen, setAddConfigDialogOpen] = useState(false);
  const [editConfigDialog, setEditConfigDialog] = useState<WPConfigItem | null>(null);
  const [editConfigValue, setEditConfigValue] = useState('');
  const [deleteConfigDialog, setDeleteConfigDialog] = useState<WPConfigItem | null>(null);
  const [newConfig, setNewConfig] = useState<{ name: string; value: string; type: 'constant' | 'variable'; raw: boolean }>({ name: '', value: '', type: 'constant', raw: false });

  // Query for core info
  const { data: coreInfo, isLoading: coreLoading, refetch: refetchCore, isFetching } = useQuery({
    queryKey: ['wp-core-info', appName, nodeIp],
    queryFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await getCoreInfo(zelidauth, { appName, nodeIp });
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result.data;
    },
    enabled: !!zelidauth && !!nodeIp,
    staleTime: 60000,
  });

  // Update core mutation
  const updateCoreMutation = useMutation({
    mutationFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await updateCore(zelidauth, { appName, nodeIp });
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('WordPress core updated successfully');
      refetchCore();
    },
    onError: (error: Error) => toast.error(`Failed to update core: ${error.message}`),
  });

  // Verify checksums mutation
  const verifyChecksumsMutation = useMutation({
    mutationFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await verifyCoreChecksums(zelidauth, { appName, nodeIp });
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      if (typeof result.data === 'string' && result.data.includes('Success')) {
        toast.success('Core files verified - all checksums match');
      } else {
        toast.warning('Checksum verification completed - check results');
      }
    },
    onError: (error: Error) => toast.error(`Verification failed: ${error.message}`),
  });

  // Flush caches mutation
  const flushCachesMutation = useMutation({
    mutationFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await flushAllCaches(zelidauth, { appName, nodeIp });
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('All caches flushed successfully');
    },
    onError: (error: Error) => toast.error(`Failed to flush caches: ${error.message}`),
  });

  // Query for config list
  const { data: configData, isLoading: configLoading, refetch: refetchConfig, isFetching: configFetching } = useQuery({
    queryKey: ['wp-config', appName, nodeIp],
    queryFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await listConfig(zelidauth, { appName, nodeIp });
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result.data || [];
    },
    enabled: !!zelidauth && !!nodeIp,
    staleTime: 60000,
  });

  // Set config mutation
  const setConfigMutation = useMutation({
    mutationFn: async ({ name, value, type, raw }: { name: string; value: string; type: 'constant' | 'variable'; raw: boolean }) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await setConfig(zelidauth, { appName, nodeIp }, name, value, { type, raw });
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Configuration saved');
      setAddConfigDialogOpen(false);
      setEditConfigDialog(null);
      setNewConfig({ name: '', value: '', type: 'constant', raw: false });
      queryClient.invalidateQueries({ queryKey: ['wp-config', appName] });
    },
    onError: (error: Error) => toast.error(`Failed to save config: ${error.message}`),
  });

  // Delete config mutation
  const deleteConfigMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await deleteConfig(zelidauth, { appName, nodeIp }, name);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Configuration deleted');
      setDeleteConfigDialog(null);
      queryClient.invalidateQueries({ queryKey: ['wp-config', appName] });
    },
    onError: (error: Error) => toast.error(`Failed to delete config: ${error.message}`),
  });

  // Helper to safely convert value to string for display
  const valueToString = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Format value for editing (pretty-print JSON)
  const formatValueForEdit = (value: unknown): string => {
    const str = valueToString(value);
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null) {
        return JSON.stringify(parsed, null, 2);
      }
    } catch {
      // Not valid JSON, return as-is
    }
    return str;
  };

  // Check if value is an array/object (not editable via WP-CLI)
  const isComplexValue = (value: unknown): boolean => {
    if (typeof value === 'object' && value !== null) return true;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null;
      } catch {
        return false;
      }
    }
    return false;
  };

  // Open edit dialog with formatted value
  const openEditDialog = (item: WPConfigItem) => {
    setEditConfigDialog(item);
    setEditConfigValue(formatValueForEdit(item.value));
  };

  // Filter config items
  const configItems = (configData as WPConfigItem[]) || [];
  const filteredConfig = configItems.filter(item => {
    const valueStr = valueToString(item.value);
    return item.name.toLowerCase().includes(configSearch.toLowerCase()) ||
      valueStr.toLowerCase().includes(configSearch.toLowerCase());
  });

  // Full reinstall process
  const performReinstall = async () => {
    if (!zelidauth) return;

    try {
      // Step 1: Backup database
      setReinstallStep('backup');
      const backupResult = await exportDatabase(zelidauth, { appName, nodeIp });
      if (backupResult.status === 'error') {
        throw new Error(`Backup failed: ${backupResult.message}`);
      }
      toast.success('Database backup created');

      // Step 2: Reset database
      setReinstallStep('reset');
      const resetResult = await resetDatabase(zelidauth, { appName, nodeIp });
      if (resetResult.status === 'error') {
        throw new Error(`Database reset failed: ${resetResult.message}`);
      }
      toast.success('Database reset complete');

      // Step 3: Download fresh core files
      setReinstallStep('download');
      const downloadResult = await downloadCore(zelidauth, { appName, nodeIp });
      if (downloadResult.status === 'error') {
        throw new Error(`Core download failed: ${downloadResult.message}`);
      }
      toast.success('Fresh WordPress core files downloaded');

      // Step 4: Install WordPress
      setReinstallStep('install');
      const installResult = await installCore(zelidauth, { appName, nodeIp }, installParams);
      if (installResult.status === 'error') {
        throw new Error(`Installation failed: ${installResult.message}`);
      }
      toast.success('WordPress installed successfully');

      // Complete
      setReinstallStep('complete');
      refetchCore();
    } catch (error) {
      setReinstallStep('error');
      setReinstallError(error instanceof Error ? error.message : 'Unknown error occurred');
      toast.error(error instanceof Error ? error.message : 'Reinstallation failed');
    }
  };

  const handleCloseReinstallDialog = () => {
    if (reinstallStep !== 'idle' && reinstallStep !== 'complete' && reinstallStep !== 'error') {
      // Don't allow closing during active reinstall
      return;
    }
    setReinstallDialogOpen(false);
    setConfirmText('');
    setReinstallStep('idle');
    setReinstallError(null);
    setInstallParams({
      siteUrl: '',
      siteTitle: 'My WordPress Site',
      adminUser: 'admin',
      adminPassword: generatePassword(),
      adminEmail: '',
    });
  };

  const isReinstalling = reinstallStep !== 'idle' && reinstallStep !== 'complete' && reinstallStep !== 'error';
  const canStartReinstall = confirmText === 'REINSTALL' &&
    installParams.siteUrl.trim() &&
    installParams.siteTitle.trim() &&
    installParams.adminUser.trim() &&
    installParams.adminPassword.trim() &&
    installParams.adminEmail.trim();

  const getStepStatus = (step: ReinstallStep) => {
    const steps: ReinstallStep[] = ['backup', 'reset', 'download', 'install'];
    const currentIndex = steps.indexOf(reinstallStep);
    const stepIndex = steps.indexOf(step);

    if (reinstallStep === 'complete') return 'complete';
    if (reinstallStep === 'error') {
      if (stepIndex < currentIndex) return 'complete';
      if (stepIndex === currentIndex) return 'error';
      return 'pending';
    }
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="space-y-4">
      {/* Core Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="size-5" />
                WordPress Core
              </CardTitle>
              <CardDescription>Core version and maintenance operations</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchCore()}
              disabled={isFetching}
            >
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {coreLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : coreInfo ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Current Version</p>
                  <p className="text-2xl font-bold">{coreInfo.version}</p>
                </div>
                {coreInfo.updateAvailable && (
                  <Badge variant="secondary" className="text-orange-600">
                    Update available: {coreInfo.latestVersion}
                  </Badge>
                )}
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                {coreInfo.updateAvailable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateCoreMutation.mutate()}
                    disabled={updateCoreMutation.isPending}
                  >
                    {updateCoreMutation.isPending ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="size-4 mr-2" />
                    )}
                    Update Core
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => verifyChecksumsMutation.mutate()}
                  disabled={verifyChecksumsMutation.isPending}
                >
                  {verifyChecksumsMutation.isPending ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="size-4 mr-2" />
                  )}
                  Verify Checksums
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => flushCachesMutation.mutate()}
                  disabled={flushCachesMutation.isPending}
                >
                  {flushCachesMutation.isPending ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4 mr-2" />
                  )}
                  Flush Caches
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              Could not retrieve core information
            </p>
          )}
        </CardContent>
      </Card>

      {/* Config Manager Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="size-5" />
                Configuration
              </CardTitle>
              <CardDescription>Manage wp-config.php constants and variables</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchConfig()}
                disabled={configFetching}
              >
                <RefreshCw className={`size-4 ${configFetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" onClick={() => setAddConfigDialogOpen(true)}>
                <Plus className="size-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search constants..."
                  value={configSearch}
                  onChange={(e) => setConfigSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Config List */}
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {filteredConfig.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      {configSearch ? 'No matching constants found' : 'No constants found'}
                    </p>
                  ) : (
                    filteredConfig.map((item) => {
                      const isComplex = isComplexValue(item.value);
                      return (
                        <div
                          key={item.name}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-sm font-medium">{item.name}</p>
                              <Badge variant="outline" className="text-xs">
                                {item.type}
                              </Badge>
                              {isComplex && (
                                <Badge variant="secondary" className="text-xs">
                                  array
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate font-mono">
                              {(() => {
                                const val = valueToString(item.value);
                                return val.length > 50 ? `${val.slice(0, 50)}...` : val;
                              })()}
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            {isComplex ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(item)}
                                title="View (read-only)"
                              >
                                <Eye className="size-4 text-muted-foreground" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDialog(item)}
                                  disabled={setConfigMutation.isPending || deleteConfigMutation.isPending}
                                  title="Edit"
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteConfigDialog(item)}
                                  disabled={setConfigMutation.isPending || deleteConfigMutation.isPending}
                                  title="Delete"
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Config Dialog */}
      <Dialog open={addConfigDialogOpen} onOpenChange={setAddConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Configuration</DialogTitle>
            <DialogDescription>Add a new constant or variable to wp-config.php</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="configName">Name</Label>
              <Input
                id="configName"
                placeholder="WP_DEBUG"
                value={newConfig.name}
                onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value.toUpperCase() })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="configValue">Value</Label>
              <Input
                id="configValue"
                placeholder="true"
                value={newConfig.value}
                onChange={(e) => setNewConfig({ ...newConfig, value: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={newConfig.type}
                  onValueChange={(value: 'constant' | 'variable') => setNewConfig({ ...newConfig, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="constant">Constant</SelectItem>
                    <SelectItem value="variable">Variable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Raw Value</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    checked={newConfig.raw}
                    onCheckedChange={(checked) => setNewConfig({ ...newConfig, raw: checked })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {newConfig.raw ? 'Yes (for true, false, numbers)' : 'No (string)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => setConfigMutation.mutate(newConfig)}
              disabled={!newConfig.name.trim() || setConfigMutation.isPending}
            >
              {setConfigMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Config Dialog */}
      <Dialog open={!!editConfigDialog} onOpenChange={() => setEditConfigDialog(null)}>
        <DialogContent className="max-w-2xl">
          {(() => {
            const isComplex = editConfigDialog ? isComplexValue(editConfigDialog.value) : false;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{isComplex ? 'View Configuration' : 'Edit Configuration'}</DialogTitle>
                  <DialogDescription>
                    {isComplex ? (
                      <>View value for <span className="font-mono">{editConfigDialog?.name}</span> (read-only, edit in File Browser)</>
                    ) : (
                      <>Update the value for <span className="font-mono">{editConfigDialog?.name}</span></>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="editConfigValue">Value</Label>
                    <Textarea
                      id="editConfigValue"
                      value={editConfigValue}
                      onChange={(e) => setEditConfigValue(e.target.value)}
                      className="font-mono min-h-[200px] text-sm"
                      placeholder="Enter value..."
                      readOnly={isComplex}
                    />
                  </div>
                  {!isComplex && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={(() => {
                          const val = editConfigValue.trim();
                          return val === 'true' || val === 'false' || (!isNaN(Number(val)) && val !== '');
                        })()}
                        onCheckedChange={() => {}}
                        disabled
                      />
                      <span className="text-sm text-muted-foreground">
                        Raw value will be auto-detected (for true, false, numbers)
                      </span>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditConfigDialog(null)}>
                    {isComplex ? 'Close' : 'Cancel'}
                  </Button>
                  {!isComplex && (
                    <Button
                      onClick={() => {
                        if (editConfigDialog) {
                          let finalValue = editConfigValue.trim();
                          try {
                            const parsed = JSON.parse(finalValue);
                            if (typeof parsed === 'object' && parsed !== null) {
                              finalValue = JSON.stringify(parsed);
                            }
                          } catch {
                            // Not JSON, use as-is
                          }
                          const isRaw = finalValue === 'true' || finalValue === 'false' || (!isNaN(Number(finalValue)) && finalValue !== '');
                          setConfigMutation.mutate({
                            name: editConfigDialog.name,
                            value: finalValue,
                            type: editConfigDialog.type,
                            raw: isRaw,
                          });
                        }
                      }}
                      disabled={setConfigMutation.isPending}
                    >
                      {setConfigMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                      Save
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Config Dialog */}
      <Dialog open={!!deleteConfigDialog} onOpenChange={() => setDeleteConfigDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-mono">{deleteConfigDialog?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfigDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfigDialog && deleteConfigMutation.mutate(deleteConfigDialog.name)}
              disabled={deleteConfigMutation.isPending}
            >
              {deleteConfigMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fresh Install Card */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-5" />
            Wipe & Reinstall WordPress
          </CardTitle>
          <CardDescription>
            Completely wipe the database and reinstall WordPress with a fresh installation.
            This is a destructive operation that cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Danger Zone</AlertTitle>
            <AlertDescription>
              This will delete all your posts, pages, users, plugins, themes, and settings.
              A database backup will be created before wiping, but you should also create
              your own backup if you need to restore later.
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button
              variant="destructive"
              onClick={() => setReinstallDialogOpen(true)}
            >
              <Trash2 className="size-4 mr-2" />
              Wipe & Reinstall WordPress
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reinstall Dialog */}
      <Dialog open={reinstallDialogOpen} onOpenChange={handleCloseReinstallDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Fresh WordPress Installation
            </DialogTitle>
            <DialogDescription>
              This will wipe your entire WordPress installation and create a fresh one.
            </DialogDescription>
          </DialogHeader>

          {reinstallStep === 'idle' ? (
            <>
              <Alert variant="destructive" className="my-4">
                <AlertTriangle className="size-4" />
                <AlertTitle>This action is irreversible!</AlertTitle>
                <AlertDescription>
                  All content, users, plugins, and themes will be permanently deleted.
                  A backup will be created in wp-content folder before wiping.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="siteUrl">Site URL *</Label>
                    <Input
                      id="siteUrl"
                      placeholder="https://example.com"
                      value={installParams.siteUrl}
                      onChange={(e) => setInstallParams({ ...installParams, siteUrl: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="siteTitle">Site Title *</Label>
                    <Input
                      id="siteTitle"
                      placeholder="My WordPress Site"
                      value={installParams.siteTitle}
                      onChange={(e) => setInstallParams({ ...installParams, siteTitle: e.target.value })}
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="adminUser">Admin Username *</Label>
                    <Input
                      id="adminUser"
                      placeholder="admin"
                      value={installParams.adminUser}
                      onChange={(e) => setInstallParams({ ...installParams, adminUser: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminEmail">Admin Email *</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      placeholder="admin@example.com"
                      value={installParams.adminEmail}
                      onChange={(e) => setInstallParams({ ...installParams, adminEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPassword">Admin Password *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="adminPassword"
                      type="text"
                      value={installParams.adminPassword}
                      onChange={(e) => setInstallParams({ ...installParams, adminPassword: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setInstallParams({ ...installParams, adminPassword: generatePassword() })}
                    >
                      Generate
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save this password - you&apos;ll need it to log in after reinstallation.
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="confirmText">Type REINSTALL to confirm</Label>
                  <Input
                    id="confirmText"
                    placeholder="REINSTALL"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseReinstallDialog}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={performReinstall}
                  disabled={!canStartReinstall}
                >
                  <Trash2 className="size-4 mr-2" />
                  Wipe & Reinstall
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-4 py-4">
              {/* Progress Steps */}
              <div className="space-y-3">
                <StepIndicator
                  step="backup"
                  label="Creating database backup"
                  status={getStepStatus('backup')}
                />
                <StepIndicator
                  step="reset"
                  label="Resetting database"
                  status={getStepStatus('reset')}
                />
                <StepIndicator
                  step="download"
                  label="Downloading fresh WordPress core"
                  status={getStepStatus('download')}
                />
                <StepIndicator
                  step="install"
                  label="Installing WordPress"
                  status={getStepStatus('install')}
                />
              </div>

              {reinstallStep === 'complete' && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle2 className="size-4 text-green-600" />
                  <AlertTitle className="text-green-600">Installation Complete!</AlertTitle>
                  <AlertDescription>
                    WordPress has been successfully reinstalled. You can now log in with your new admin credentials.
                  </AlertDescription>
                </Alert>
              )}

              {reinstallStep === 'error' && (
                <Alert variant="destructive">
                  <XCircle className="size-4" />
                  <AlertTitle>Installation Failed</AlertTitle>
                  <AlertDescription>{reinstallError}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                {(reinstallStep === 'complete' || reinstallStep === 'error') && (
                  <Button onClick={handleCloseReinstallDialog}>
                    Close
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepIndicator({
  label,
  status
}: {
  step: ReinstallStep;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0">
        {status === 'complete' && (
          <CheckCircle2 className="size-5 text-green-600" />
        )}
        {status === 'active' && (
          <Loader2 className="size-5 animate-spin text-blue-600" />
        )}
        {status === 'pending' && (
          <div className="size-5 rounded-full border-2 border-muted-foreground/30" />
        )}
        {status === 'error' && (
          <XCircle className="size-5 text-destructive" />
        )}
      </div>
      <span className={`text-sm ${
        status === 'active' ? 'text-blue-600 font-medium' :
        status === 'complete' ? 'text-green-600' :
        status === 'error' ? 'text-destructive' :
        'text-muted-foreground'
      }`}>
        {label}
      </span>
    </div>
  );
}
