/**
 * Shared utilities for Flux app /status endpoint.
 * Used by app-status and master-node API routes.
 */

/**
 * Get the app domain for the /status endpoint.
 * Multi-component (compose) apps use: {appName}_{port}.app.runonflux.io
 * Legacy apps use: {appName}.app.runonflux.io
 */
export async function getAppStatusDomain(appName: string): Promise<string> {
  try {
    const specResponse = await fetch(
      `https://api.runonflux.io/apps/appspecifications/${appName}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const specData = await specResponse.json();

    if (specData.status === 'success' && specData.data?.compose) {
      for (const component of specData.data.compose) {
        if (component.ports && component.ports.length > 0) {
          return `${appName}_${component.ports[0]}.app.runonflux.io`;
        }
      }
    }
  } catch {
    // Fall through to default
  }
  return `${appName}.app.runonflux.io`;
}

/**
 * Build a port map from the app's /status endpoint.
 * Returns a mapping of bare IP -> Flux API port number.
 */
export function buildPortMap(
  clusterStatus: Array<{ ip?: string }>
): Record<string, number> {
  const portMap: Record<string, number> = {};
  for (const node of clusterStatus) {
    if (node.ip && typeof node.ip === 'string' && node.ip.includes(':')) {
      const [bareIp, portStr] = node.ip.split(':');
      const port = parseInt(portStr, 10);
      if (bareIp && !isNaN(port)) {
        portMap[bareIp] = port;
      }
    }
  }
  return portMap;
}

/**
 * Fetch the port map from the app's /status endpoint.
 * Returns a mapping of bare IP -> Flux API port.
 */
export async function fetchPortMap(appName: string): Promise<Record<string, number>> {
  try {
    const domain = await getAppStatusDomain(appName);
    const statusUrl = `https://${domain}/status`;
    const response = await fetch(statusUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return {};

    const data = await response.json();

    if (data.clusterStatus && Array.isArray(data.clusterStatus)) {
      return buildPortMap(data.clusterStatus);
    }

    return {};
  } catch {
    return {};
  }
}

/**
 * Resolve an IP to its correct IP:PORT using the port map.
 * Falls back to IP:16127 if not found in the map.
 */
export function resolvePort(ipPort: string, portMap: Record<string, number>): string {
  const bareIp = ipPort.split(':')[0];
  const correctPort = portMap[bareIp];
  return correctPort ? `${bareIp}:${correctPort}` : `${bareIp}:16127`;
}
