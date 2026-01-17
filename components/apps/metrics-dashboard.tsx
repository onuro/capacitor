"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsageBarChart } from "@/components/ui/usage-bar-chart";
import {
  getAppStatsFromNodes,
  formatBytes,
  formatCpu,
} from "@/lib/api/flux-metrics";
import { formatNodeAddress, isSameNodeIp } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useNodeSelection } from "@/hooks/use-node-selection";
import { useResolvedNode } from "@/components/apps/node-picker";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  // Network,
  Server,
  RefreshCw,
  Loader2,
  Activity,
  Globe,
} from "lucide-react";

interface MetricsDashboardProps {
  appName: string;
  selectedNode: string;
}

function formatDuration(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "less than a minute";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"}`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"}`;
  } else {
    return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  /** Optional usage percentage for bar chart (0-100) */
  percentage?: number;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  percentage,
}: MetricCardProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
            {icon}
          </div>
        </div>
        {percentage !== undefined && (
          <div className="mt-3">
            <UsageBarChart value={percentage} height={31} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricsDashboard({
  appName,
  selectedNode,
}: MetricsDashboardProps) {
  const { zelidauth } = useAuthStore();

  // Use unified node selection hook for locations and master detection
  const {
    sortedLocations,
    masterNodeAddress,
    isLoading: nodesLoading,
  } = useNodeSelection({ appName, autoSelectMaster: false });

  // Resolve "auto" to actual node
  const { resolvedNode } = useResolvedNode(appName, selectedNode);

  const nodeIps = sortedLocations.map((l) => formatNodeAddress(l));

  // Determine which nodes to query based on selection
  // Always prioritize master node when known, even if not the "resolved" selection
  // This ensures stats come from the responsive master node
  const nodesToQuery = useMemo(() => {
    const priorityNode = resolvedNode || masterNodeAddress;
    if (priorityNode) {
      return [priorityNode, ...nodeIps.filter((ip) => ip !== priorityNode)];
    }
    return nodeIps;
  }, [resolvedNode, masterNodeAddress, nodeIps]);

  // Fetch stats from nodes - tries each until one returns valid data
  const {
    data: statsResponse,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
    isFetching: statsFetching,
  } = useQuery({
    queryKey: ["appStats", appName, nodesToQuery.join(","), zelidauth],
    queryFn: async () => {
      if (nodesToQuery.length === 0) return null;
      const response = await getAppStatsFromNodes(
        nodesToQuery,
        appName,
        zelidauth || undefined,
      );
      return response;
    },
    enabled: nodesToQuery.length > 0,
    refetchInterval: 3000,
    staleTime: 10000,
    retry: 1,
  });

  const statsData = statsResponse?.data || null;
  const statsNodeIp = statsResponse?.nodeIp;

  const isLoading = nodesLoading;
  const stats = statsData;
  const hasStats = stats?.containers && stats.containers.length > 0;
  const isStatsLoading =
    (statsLoading && !statsData) ||
    (nodeIps.length === 0 && sortedLocations.length > 0);

  const totalCpu = stats?.containers?.reduce((sum, c) => sum + c.cpu, 0) || 0;
  const totalMemoryUsage =
    stats?.containers?.reduce((sum, c) => sum + c.memory.usage, 0) || 0;
  const totalMemoryLimit =
    stats?.containers?.reduce((sum, c) => sum + c.memory.limit, 0) || 0;
  // Network stats (commented out for now)
  // const totalNetworkRx =
  //   stats?.containers?.reduce((sum, c) => sum + c.network.rx_bytes, 0) || 0;
  // const totalNetworkTx =
  //   stats?.containers?.reduce((sum, c) => sum + c.network.tx_bytes, 0) || 0;
  const totalDiskUsage =
    stats?.containers?.reduce((sum, c) => sum + (c.disk?.usage || 0), 0) || 0;
  const totalDiskLimit =
    stats?.containers?.reduce((sum, c) => sum + (c.disk?.limit || 0), 0) || 0;

  // Calculate percentages for bar charts
  const cpuPercent = Math.min(100, totalCpu);
  const memoryPercent =
    totalMemoryLimit > 0 ? (totalMemoryUsage / totalMemoryLimit) * 100 : 0;
  const diskPercent =
    totalDiskLimit > 0 ? (totalDiskUsage / totalDiskLimit) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="size-5" />
            Resource Metrics
          </h3>
          {statsNodeIp && hasStats && (
            <p className="text-xs text-muted-foreground mt-1">
              Source: {statsNodeIp}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchStats()}
          disabled={statsFetching}
        >
          <RefreshCw
            className={`size-4 ${statsFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {isStatsLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <p className="text-sm text-muted-foreground">
                Loading metrics...
              </p>
            </div>
          </CardContent>
        </Card>
      ) : statsError || !hasStats ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground text-center">
              Container stats not available. The app may still be starting up.
              <br />
              <span className="text-xs">
                View detailed metrics on{" "}
                <a
                  href={`https://home.runonflux.io/apps/globalapps/${appName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Flux Dashboard
                </a>
              </span>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="CPU Usage"
            value={formatCpu(totalCpu)}
            subtitle="Total across containers"
            icon={<Cpu className="size-5 text-primary" />}
            percentage={cpuPercent}
          />
          <MetricCard
            title="Memory"
            value={formatBytes(totalMemoryUsage)}
            subtitle={`of ${formatBytes(totalMemoryLimit)}`}
            icon={<MemoryStick className="size-5 text-primary" />}
            percentage={memoryPercent}
          />
          {/* <MetricCard
            title="Network In"
            value={formatBytes(totalNetworkRx)}
            subtitle="Total received"
            icon={<Network className="size-5 text-primary" />}
          />
          <MetricCard
            title="Network Out"
            value={formatBytes(totalNetworkTx)}
            subtitle="Total sent"
            icon={<HardDrive className="size-5 text-primary" />}
          /> */}
          <MetricCard
            title="Disk Usage"
            value={formatBytes(totalDiskUsage)}
            subtitle={`of ${formatBytes(totalDiskLimit)}`}
            icon={<HardDrive className="size-5 text-primary" />}
            percentage={diskPercent}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-5" />
            Running Instances ({sortedLocations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedLocations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No running instances found. The app may be stopped or still
              deploying.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sortedLocations.map((location, idx) => {
                const nodeAddress = formatNodeAddress(location);
                const isMaster =
                  masterNodeAddress &&
                  isSameNodeIp(nodeAddress, masterNodeAddress);
                const isStatsSource =
                  statsNodeIp &&
                  location.ip.startsWith(statsNodeIp.split(":")[0]);
                const isHighlighted = isMaster || isStatsSource;
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isHighlighted ? "bg-primary/10" : "bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Server
                        className={`size-4 ${isHighlighted ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <div>
                        <p className="font-medium text-sm">{location.ip}</p>
                        {location.runningSince && (
                          <p className="text-xs text-muted-foreground">
                            Up for{" "}
                            {formatDuration(new Date(location.runningSince))}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isMaster && (
                        <Badge variant="default" className="text-xs">
                          Master
                        </Badge>
                      )}
                      {isStatsSource && (
                        <Badge variant="secondary" className="text-xs">
                          Stats Source
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        Active
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {stats?.containers && stats.containers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Container Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.containers.map((container, idx) => (
                <div key={idx} className="p-4 rounded-lg border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{container.name}</span>
                    <Badge>Running</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">CPU</p>
                      <p className="font-medium">{formatCpu(container.cpu)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Memory</p>
                      <p className="font-medium">
                        {formatBytes(container.memory.usage)} /{" "}
                        {formatBytes(container.memory.limit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Network RX</p>
                      <p className="font-medium">
                        {formatBytes(container.network.rx_bytes)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Network TX</p>
                      <p className="font-medium">
                        {formatBytes(container.network.tx_bytes)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
