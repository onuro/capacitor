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
import { getAppLocations, getAppSpecification } from '@/lib/api/flux-apps';
import { useAuthStore } from '@/stores/auth';
import { Loader2, Search, Download, RefreshCw, Terminal, Server, Box } from 'lucide-react';

interface LogViewerProps {
  appName: string;
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
      colorClass = 'text-green-500';
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

export function LogViewer({ appName }: LogViewerProps) {
  const [lines, setLines] = useState('100');
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const zelidauth = useAuthStore((state) => state.zelidauth);

  // Fetch app specification to get compose info
  const { data: appSpecData } = useQuery({
    queryKey: ['appSpecification', appName],
    queryFn: () => getAppSpecification(appName),
    staleTime: 60000,
  });

  const appSpec = appSpecData?.data;
  const isComposeApp = appSpec && appSpec.version >= 4 && appSpec.compose?.length > 0;
  const components = appSpec?.compose?.map((c) => c.name) || [];

  // Fetch app locations (instances)
  const { data: locationsData } = useQuery({
    queryKey: ['appLocations', appName],
    queryFn: () => getAppLocations(appName),
    staleTime: 30000,
  });

  const locations = locationsData?.data || [];
  const nodeIp = selectedNode || locations[0]?.ip;

  // Auto-select first node when locations load
  useEffect(() => {
    if (locations.length > 0 && !selectedNode) {
      setSelectedNode(locations[0].ip);
    }
  }, [locations, selectedNode]);

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
    queryKey: ['appLogs', containerName, nodeIp, lines],
    queryFn: () => getAppLogs(nodeIp!, containerName, parseInt(lines), zelidauth || undefined),
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !!zelidauth && !!nodeIp && (!isComposeApp || !!selectedComponent),
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
            <Terminal className="h-5 w-5" />
            Application Logs
          </CardTitle>
          <div className="flex items-center gap-2">
            {isComposeApp && components.length > 1 && (
              <Select value={selectedComponent} onValueChange={setSelectedComponent}>
                <SelectTrigger className="w-40">
                  <Box className="h-4 w-4 mr-2" />
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
            {locations.length > 1 && (
              <Select value={selectedNode} onValueChange={setSelectedNode}>
                <SelectTrigger className="w-48">
                  <Server className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Select node" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc, idx) => (
                    <SelectItem key={loc.ip} value={loc.ip}>
                      {loc.ip} {idx === 0 ? '(primary)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
        ) : !nodeIp ? (
          <div className="text-center py-8 text-muted-foreground">
            No running instances found. Start the app to view logs.
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
