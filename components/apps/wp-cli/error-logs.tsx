'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  FileWarning,
  RefreshCw,
  Trash2,
  Download,
  Search,
  FileCode,
  Server,
  Bug,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import {
  getErrorLog,
  clearErrorLog,
  type LogType,
  LOG_PATHS,
} from '@/lib/api/flux-wp-cli';
import type { BaseWpCliProps } from './types';

const LOG_TABS: { id: LogType; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'php', label: 'PHP Errors', icon: <FileCode className="size-4" />, description: 'PHP-FPM error log' },
  { id: 'nginx', label: 'Nginx', icon: <Server className="size-4" />, description: 'Nginx error log' },
  { id: 'wordpress', label: 'WP Debug', icon: <Bug className="size-4" />, description: 'WordPress debug.log' },
];

const LINE_OPTIONS = [50, 100, 200, 500];

export function ErrorLogsViewer({ appName, nodeIp }: BaseWpCliProps) {
  const { zelidauth } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeLog, setActiveLog] = useState<LogType>('php');
  const [lineCount, setLineCount] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // Query for log content
  const { data: logContent, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wp-error-log', appName, nodeIp, activeLog, lineCount],
    queryFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await getErrorLog(zelidauth, { appName, nodeIp }, activeLog, lineCount);
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result.data || '';
    },
    enabled: !!zelidauth && !!nodeIp,
    staleTime: 30000,
  });

  // Clear log mutation
  const clearMutation = useMutation({
    mutationFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await clearErrorLog(zelidauth, { appName, nodeIp }, activeLog);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Log cleared successfully');
      setClearDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['wp-error-log', appName, nodeIp, activeLog] });
    },
    onError: (error: Error) => toast.error(`Failed to clear log: ${error.message}`),
  });

  // Filter log lines by search term
  const filteredLines = logContent
    ? logContent
      .split('\n')
      .filter((line) => !searchTerm || line.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  // Colorize log lines based on level
  const getLineClass = (line: string): string => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('fatal') || lowerLine.includes('critical')) {
      return 'text-red-500';
    }
    if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
      return 'text-yellow-700';
    }
    if (lowerLine.includes('notice') || lowerLine.includes('info')) {
      return 'text-amber-900';
    }
    if (lowerLine.includes('debug')) {
      return 'text-gray-500';
    }
    return 'text-foreground';
  };

  // Download log file
  const handleDownload = () => {
    if (!logContent) return;
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeLog}-error.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Log downloaded');
  };

  const activeTabInfo = LOG_TABS.find((t) => t.id === activeLog);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="size-5 text-orange-500" />
            Error Logs
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={lineCount.toString()}
              onValueChange={(v) => setLineCount(parseInt(v))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Lines" />
              </SelectTrigger>
              <SelectContent>
                {LINE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={n.toString()}>
                    {n} lines
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Log Type Tabs */}
        <Tabs value={activeLog} onValueChange={(v) => setActiveLog(v as LogType)}>
          <TabsList className="">
            {LOG_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Search and Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!logContent}
            >
              <Download className="size-4 mr-1" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        {/* Log Path Info */}
        <div className="text-xs text-muted-foreground">
          Path: <code className="bg-muted px-1 rounded">{LOG_PATHS[activeLog]}</code>
          {searchTerm && (
            <span className="ml-2">
              Showing {filteredLines.length} of {logContent?.split('\n').length || 0} lines
            </span>
          )}
        </div>

        {/* Log Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : !logContent || logContent.trim() === '' ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileWarning className="size-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No {activeTabInfo?.label.toLowerCase() || 'error'} logs found
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              The log file may not exist or is empty
            </p>
          </div>
        ) : filteredLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="size-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No matching log entries</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try a different search term
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] rounded-md border bg-muted/30">
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-all">
              {filteredLines.map((line, i) => (
                <div key={i} className={`${getLineClass(line)} hover:bg-muted py-0.5`}>
                  {line || '\u00A0'}
                </div>
              ))}
            </pre>
          </ScrollArea>
        )}

        {/* Clear Confirmation Dialog */}
        <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear {activeTabInfo?.label}?</DialogTitle>
              <DialogDescription>
                This will permanently delete all entries in the{' '}
                {activeTabInfo?.label.toLowerCase()} log file. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClearDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
              >
                {clearMutation.isPending && (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                )}
                Clear Log
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
