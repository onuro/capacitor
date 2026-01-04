import apiClient from './client';

export interface FluxApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

export interface ContainerStats {
  name: string;
  cpu: number; // CPU percentage
  memory: {
    usage: number;
    limit: number;
    percent: number;
  };
  network: {
    rx_bytes: number;
    tx_bytes: number;
  };
  block: {
    read_bytes: number;
    write_bytes: number;
  };
  disk: {
    usage: number;
    limit: number;
    percent: number;
  };
}

export interface AppStats {
  appName: string;
  containers: ContainerStats[];
}

export interface NodeInfo {
  version: string;
  tier: string;
  ip: string;
  status: string;
  benchmark: {
    cpu: number;
    ram: number;
    hdd: number;
  };
}

export interface FluxInfo {
  version: string;
  protocolVersion: number;
  walletVersion: number;
  blocks: number;
  timeOffset: number;
  connections: number;
  difficulty: number;
  testnet: boolean;
  keypoolSize: number;
  paytxfee: number;
  relayfee: number;
  errors: string;
}

/**
 * Get application statistics (CPU, memory, network usage)
 * Requires zelidauth for authenticated access
 */
export async function getAppStats(
  appName: string,
  zelidauth?: string
): Promise<FluxApiResponse<AppStats>> {
  const response = await apiClient.get<FluxApiResponse<AppStats>>(
    `/apps/appstats/${appName}`,
    {
      timeout: 30000,
      headers: zelidauth ? { zelidauth } : undefined,
    }
  );
  return response.data;
}

/**
 * Get app stats from nodes (proxied through Next.js API to avoid CORS)
 * Tries multiple nodes until one returns valid stats
 */
export async function getAppStatsFromNodes(
  nodeIps: string[],
  appName: string,
  zelidauth?: string
): Promise<FluxApiResponse<AppStats> & { nodeIp?: string }> {
  const headers: Record<string, string> = {};
  if (zelidauth) {
    headers['zelidauth'] = zelidauth;
  }

  const response = await fetch(
    `/api/flux/stats?nodeIps=${encodeURIComponent(nodeIps.join(','))}&appName=${encodeURIComponent(appName)}`,
    {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(60000),
    }
  );
  return response.json();
}

/**
 * Get Flux node information
 */
export async function getFluxInfo(): Promise<FluxApiResponse<FluxInfo>> {
  const response = await apiClient.get<FluxApiResponse<FluxInfo>>(
    '/daemon/getinfo'
  );
  return response.data;
}

/**
 * Get node benchmark/tier information
 */
export async function getNodeInfo(): Promise<FluxApiResponse<NodeInfo>> {
  const response = await apiClient.get<FluxApiResponse<NodeInfo>>(
    '/benchmark/getinfo'
  );
  return response.data;
}

/**
 * Get flux network statistics
 */
export async function getFluxNetworkInfo(): Promise<FluxApiResponse<{
  total: number;
  online: number;
  stable: number;
}>> {
  const response = await apiClient.get<FluxApiResponse<{
    total: number;
    online: number;
    stable: number;
  }>>('/daemon/getzelnodecount');
  return response.data;
}

/**
 * Get app hashes (for checking deployment status)
 */
export async function getAppHashes(
  appName: string
): Promise<FluxApiResponse<{ hash: string; height: number; txid: string }[]>> {
  const response = await apiClient.get<FluxApiResponse<{ hash: string; height: number; txid: string }[]>>(
    `/apps/apphashes/${appName}`
  );
  return response.data;
}

/**
 * Check if app is running on a specific node
 */
export async function checkAppRunning(
  nodeIp: string,
  appName: string
): Promise<boolean> {
  try {
    const response = await apiClient.get<FluxApiResponse<boolean>>(
      `http://${nodeIp}:16127/apps/checkrunning/${appName}`,
      { timeout: 10000 }
    );
    return response.data.status === 'success' && response.data.data === true;
  } catch {
    return false;
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format CPU percentage
 */
export function formatCpu(percent: number): string {
  return `${percent.toFixed(2)}%`;
}

/**
 * Format memory usage
 */
export function formatMemory(usage: number, limit: number): string {
  return `${formatBytes(usage)} / ${formatBytes(limit)}`;
}
