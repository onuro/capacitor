import apiClient from './client';

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

/**
 * Start an application (requires authentication)
 */
export async function startApp(
  zelidauth: string,
  appName: string
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `/apps/appstart/${appName}`,
    {
      headers: { zelidauth },
      timeout: 60000,
    }
  );
  return response.data;
}

/**
 * Stop an application (requires authentication)
 */
export async function stopApp(
  zelidauth: string,
  appName: string
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `/apps/appstop/${appName}`,
    {
      headers: { zelidauth },
      timeout: 60000,
    }
  );
  return response.data;
}

/**
 * Restart an application (requires authentication)
 */
export async function restartApp(
  zelidauth: string,
  appName: string
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `/apps/apprestart/${appName}`,
    {
      headers: { zelidauth },
      timeout: 60000,
    }
  );
  return response.data;
}

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
