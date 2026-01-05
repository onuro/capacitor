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
import { getAppSpecification } from '@/lib/api/flux-apps';
import { formatNodeAddress } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useNodeSelection } from '@/hooks/use-node-selection';
import { useResolvedNode } from '@/components/apps/node-picker';
import { Loader2, Search, Download, RefreshCw, Terminal, Box } from 'lucide-react';

interface LogViewerProps {
  appName: string;
  selectedNode: string;
}

// Format timestamp with relative date (Today, Yesterday, X days ago) + time
function formatLogTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();

  // Reset time to midnight for date comparison
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = todayOnly.getTime() - dateOnly.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString();

  if (diffDays === 0) {
    return `Today ${timeStr}`;
  } else if (diffDays === 1) {
    return `Yesterday ${timeStr}`;
  } else {
    return `${diffDays}d ago ${timeStr}`;
  }
}

// Helper component to colorize HTTP status codes in log messages
function LogMessage({ message }: { message: string }) {
  // Match HTTP status codes (3-digit numbers at end of line or before whitespace)
  const statusCodeRegex = /\s(\d{3})(\s|$)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = statusCodeRegex.exec(message)) !== null) {
    const statusCode = parseInt(match[1], 10);
    const matchStart = match.index + 1; // +1 to skip the leading space
    const matchEnd = matchStart + 3;

    // Add text before the status code
    if (matchStart > lastIndex) {
      parts.push(message.slice(lastIndex, matchStart));
    }

    // Determine color based on status code range
    let colorClass = '';
    if (statusCode >= 200 && statusCode < 300) {
      colorClass = 'text-green-600';
    } else if (statusCode >= 300 && statusCode < 400) {
      colorClass = 'text-blue-400';
    } else if (statusCode >= 400 && statusCode < 500) {
      colorClass = 'text-yellow-500';
    } else if (statusCode >= 500) {
      colorClass = 'text-red-500';
    }

    // Add the colorized status code
    parts.push(
      <span key={matchStart} className={`font-semibold ${colorClass}`}>
        {match[1]}
      </span>
    );

    lastIndex = matchEnd;
  }

  // Add remaining text
  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex));
  }

  // If no status codes found, return plain message
  if (parts.length === 0) {
    return <span className="break-all">{message}</span>;
  }

  return <span className="break-all">{parts}</span>;
}

export function LogViewer({ appName, selectedNode }: LogViewerProps) {
  const [lines, setLines] = useState('100');
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const zelidauth = useAuthStore((state) => state.zelidauth);

  // Use unified node selection hook for locations
  const { sortedLocations } = useNodeSelection({ appName, autoSelectMaster: false });

  // Resolve "auto" to actual node
  const { resolvedNode } = useResolvedNode(appName, selectedNode);

  // Build fallback list: resolved node first, then others
  const allNodeIps = sortedLocations.map((l) => formatNodeAddress(l));
  const nodeIpsForQuery = resolvedNode
    ? [resolvedNode, ...allNodeIps.filter(ip => ip !== resolvedNode)]
    : allNodeIps;

  // Fetch app specification to get compose info
  const { data: appSpecData } = useQuery({
    queryKey: ['appSpecification', appName],
    queryFn: () => getAppSpecification(appName),
    staleTime: 60000,
  });

  const appSpec = appSpecData?.data;
  const isComposeApp = appSpec && appSpec.version >= 4 && appSpec.compose?.length > 0;
  const components = appSpec?.compose?.map((c) => c.name) || [];

  // Auto-select first component for compose apps
  useEffect(() => {
    if (isComposeApp && components.length > 0 && !selectedComponent) {
      setSelectedComponent(components[0]);
    }
  }, [isComposeApp, components, selectedComponent]);

  // Build container name: componentName_appName for compose apps, appName for v3 and below
  const containerName = isComposeApp && selectedComponent
    ? `${selectedComponent}_${appName}`
    : appName;

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['appLogs', containerName, resolvedNode, lines],
    queryFn: () => getAppLogs(nodeIpsForQuery, containerName, parseInt(lines), zelidauth || undefined),
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !!zelidauth && nodeIpsForQuery.length > 0 && (!isComposeApp || !!selectedComponent),
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
    a.download = `${containerName}-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="size-5" />
            Application Logs
          </CardTitle>
          <div className="flex items-center gap-2">
            {isComposeApp && components.length > 1 && (
              <Select value={selectedComponent} onValueChange={setSelectedComponent}>
                <SelectTrigger>
                  <Box className="size-4 mr-2" />
                  <SelectValue placeholder="Component" />
                </SelectTrigger>
                <SelectContent>
                  {components.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={lines} onValueChange={setLines}>
              <SelectTrigger>
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
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="icon" onClick={handleDownload}>
              <Download className="size-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
        ) : nodeIpsForQuery.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No running instances found. Start the app to view logs.
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="text-center py-8 text-muted-foreground">
            Failed to load logs. Make sure the app is running.
          </div>
        ) : (
          <ScrollArea className="h-[400px] rounded-md border bg-muted/50" ref={scrollRef}>
            <div className="p-4 font-mono text-sm space-y-1">
              {filteredLogs.length === 0 ? (
                <p className="text-muted-foreground">No logs available yet. Will refresh shortly.</p>
              ) : (
                filteredLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className="flex gap-2 hover:bg-muted rounded px-1"
                  >
                    <span className="text-muted-foreground shrink-0 min-w-[150px]">
                      {formatLogTimestamp(log.timestamp)}
                    </span>
                    <LogMessage message={log.message} />
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
