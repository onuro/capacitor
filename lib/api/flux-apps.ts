import apiClient from './client';
import axios from 'axios';

/**
 * Build a node-specific API URL
 * Transforms IP:port to Flux DNS format: https://185-209-30-228-16127.node.api.runonflux.io
 */
export function buildNodeApiUrl(ip: string, port: number = 16127): string {
  const dashedIp = ip.replace(/\./g, '-');
  return `https://${dashedIp}-${port}.node.api.runonflux.io`;
}

// Types for app management
export interface FluxApp {
  name: string;
  description: string;
  owner: string;
  hash: string;
  height: number;
  version: number;
  compose: {
    name: string;
    repotag: string;
    cpu: number;
    ram: number;
    hdd: number;
    ports: number[];
    domains?: string[];
  }[];
  instances: number;
  expire: number;
}

export interface AppLocation {
  name: string;
  hash: string;
  ip: string;
  broadcastedAt: string;
  expireAt: string;
  runningSince?: string;
  port?: number;
}

export interface RunningApp {
  name: string;
  hash: string;
  ip: string;
  containers: {
    name: string;
    status: string;
    ports: { container: number; host: number }[];
  }[];
}

export interface FluxApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

/**
 * Get list of globally registered apps
 */
export async function getGlobalApps(): Promise<FluxApiResponse<FluxApp[]>> {
  const response = await apiClient.get<FluxApiResponse<FluxApp[]>>(
    '/apps/globalappsspecifications'
  );
  return response.data;
}

/**
 * Get list of running apps for a specific owner
 */
export async function getRunningApps(
  owner?: string
): Promise<FluxApiResponse<RunningApp[]>> {
  const endpoint = owner
    ? `/apps/listrunningapps/${owner}`
    : '/apps/listrunningapps';
  const response = await apiClient.get<FluxApiResponse<RunningApp[]>>(endpoint);
  return response.data;
}

/**
 * Get app locations (where it's running)
 */
export async function getAppLocations(
  appName: string
): Promise<FluxApiResponse<AppLocation[]>> {
  const response = await apiClient.get<FluxApiResponse<AppLocation[]>>(
    `/apps/location/${appName}`
  );
  return response.data;
}

/**
 * Get specific app specification
 */
export async function getAppSpecification(
  appName: string
): Promise<FluxApiResponse<FluxApp>> {
  const response = await apiClient.get<FluxApiResponse<FluxApp>>(
    `/apps/appspecifications/${appName}`
  );
  return response.data;
}

// ============================================
// GLOBAL App Lifecycle Operations
// These affect ALL instances across the network
// Endpoint format: /apps/appstart/{appName}/true
// ============================================

/**
 * Start an application globally (all instances)
 */
export async function startAppGlobally(
  zelidauth: string,
  appName: string
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `/apps/appstart/${appName}/true`,
    {
      headers: { zelidauth },
      timeout: 120000, // Global ops take longer
    }
  );
  return response.data;
}

/**
 * Stop an application globally (all instances)
 */
export async function stopAppGlobally(
  zelidauth: string,
  appName: string
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `/apps/appstop/${appName}/true`,
    {
      headers: { zelidauth },
      timeout: 120000,
    }
  );
  return response.data;
}

/**
 * Restart an application globally (all instances)
 */
export async function restartAppGlobally(
  zelidauth: string,
  appName: string
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `/apps/apprestart/${appName}/true`,
    {
      headers: { zelidauth },
      timeout: 120000,
    }
  );
  return response.data;
}

// ============================================
// LOCAL App Lifecycle Operations
// These affect a SINGLE instance on a specific node
// Requests go directly to the node's API endpoint
// ============================================

/**
 * Start an application on a specific node
 */
export async function startAppOnNode(
  zelidauth: string,
  appName: string,
  nodeIp: string,
  nodePort: number = 16127
): Promise<FluxApiResponse<string>> {
  const nodeUrl = buildNodeApiUrl(nodeIp, nodePort);
  const response = await axios.get<FluxApiResponse<string>>(
    `${nodeUrl}/apps/appstart/${appName}`,
    {
      headers: { zelidauth },
      timeout: 60000,
    }
  );
  return response.data;
}

/**
 * Stop an application on a specific node
 */
export async function stopAppOnNode(
  zelidauth: string,
  appName: string,
  nodeIp: string,
  nodePort: number = 16127
): Promise<FluxApiResponse<string>> {
  const nodeUrl = buildNodeApiUrl(nodeIp, nodePort);
  const response = await axios.get<FluxApiResponse<string>>(
    `${nodeUrl}/apps/appstop/${appName}`,
    {
      headers: { zelidauth },
      timeout: 60000,
    }
  );
  return response.data;
}

/**
 * Restart an application on a specific node
 */
export async function restartAppOnNode(
  zelidauth: string,
  appName: string,
  nodeIp: string,
  nodePort: number = 16127
): Promise<FluxApiResponse<string>> {
  const nodeUrl = buildNodeApiUrl(nodeIp, nodePort);
  const response = await axios.get<FluxApiResponse<string>>(
    `${nodeUrl}/apps/apprestart/${appName}`,
    {
      headers: { zelidauth },
      timeout: 60000,
    }
  );
  return response.data;
}

// Legacy aliases (kept for backward compatibility, use global versions)
export const startApp = startAppGlobally;
export const stopApp = stopAppGlobally;
export const restartApp = restartAppGlobally;

/**
 * Get apps owned by a specific zelid
 * Fetches all global apps and filters by owner client-side
 */
export async function getOwnedApps(
  owner: string
): Promise<FluxApiResponse<FluxApp[]>> {
  const response = await getGlobalApps();
  if (response.status === 'success' && response.data) {
    const ownedApps = response.data.filter(
      (app) => app.owner.toLowerCase() === owner.toLowerCase()
    );
    return { status: 'success', data: ownedApps };
  }
  return response;
}

/**
 * Get permanent app messages (deployment history)
 */
export async function getAppPermanentMessages(
  appName: string
): Promise<FluxApiResponse<unknown[]>> {
  const response = await apiClient.get<FluxApiResponse<unknown[]>>(
    `/apps/apppermanentmessages/${appName}`
  );
  return response.data;
}
