'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAppLogs, parseLogEntries } from '@/lib/api/flux-logs';
import { useAuthStore } from '@/stores/auth';
import { Loader2, Search, Download, RefreshCw, Terminal } from 'lucide-react';

interface LogViewerProps {
  appName: string;
}

export function LogViewer({ appName }: LogViewerProps) {
  const [lines, setLines] = useState('100');
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zelidauth = useAuthStore((state) => state.zelidauth);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['appLogs', appName, lines],
    queryFn: () => getAppLogs(appName, parseInt(lines), zelidauth || undefined),
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !!zelidauth,
  });

  const logEntries = data?.data ? parseLogEntries(data.data) : [];
  const filteredLogs = filter
    ? logEntries.filter((log) =>
        log.message.toLowerCase().includes(filter.toLowerCase())
      )
    : logEntries;

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const handleDownload = () => {
    const logText = logEntries.map((l) => `${l.timestamp} ${l.message}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Application Logs
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={lines} onValueChange={setLines}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 lines</SelectItem>
                <SelectItem value="100">100 lines</SelectItem>
                <SelectItem value="500">500 lines</SelectItem>
                <SelectItem value="1000">1000 lines</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {!zelidauth ? (
          <div className="text-center py-8 text-muted-foreground">
            Please log in to view application logs.
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="text-center py-8 text-muted-foreground">
            Failed to load logs. Make sure the app is running.
          </div>
        ) : (
          <ScrollArea className="h-[400px] rounded-md border bg-muted/50" ref={scrollRef}>
            <div className="p-4 font-mono text-xs space-y-1">
              {filteredLogs.length === 0 ? (
                <p className="text-muted-foreground">No logs available</p>
              ) : (
                filteredLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className="flex gap-2 hover:bg-muted rounded px-1"
                  >
                    <span className="text-muted-foreground shrink-0 w-[180px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        )}
        <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
          <span>
            Showing {filteredLogs.length} of {logEntries.length} entries
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            className={autoScroll ? 'text-primary' : ''}
          >
            Auto-scroll {autoScroll ? 'ON' : 'OFF'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
