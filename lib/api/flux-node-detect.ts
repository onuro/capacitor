import type { FluxApiResponse } from './flux-apps';

interface DetectNodeResponse {
  nodeIp: string | null;
  domain: string;
  message?: string;
}

interface MasterNodeResponse {
  masterIp: string;
  allIps: string[];
  region: string;
  appName: string;
}

/**
 * Detect which Flux node is serving a given domain by checking the FDMSERVERID cookie.
 * Makes a request to the app domain and extracts FDMSERVERID from Set-Cookie header.
 *
 * @param domain - The domain to check (e.g., "myapp.app.runonflux.io")
 * @returns The IP:port of the serving node, or null if not detected
 */
export async function detectServingNode(
  domain: string
): Promise<FluxApiResponse<DetectNodeResponse>> {
  try {
    const response = await fetch(
      `/api/flux/detect-node?domain=${encodeURIComponent(domain)}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      }
    );

    return response.json();
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to detect serving node',
    };
  }
}

/**
 * Extract the primary domain from an app's compose specification.
 * For WordPress apps, looks for the 'wp' component's domain.
 * Falls back to any component's first domain.
 *
 * @param compose - The compose array from the app specification
 * @param preferredComponent - Optional component name to prefer (e.g., 'wp')
 * @returns The domain string or null if none found
 */
export function extractAppDomain(
  compose: Array<{ name: string; domains?: string[] }> | undefined,
  preferredComponent?: string
): string | null {
  if (!compose || compose.length === 0) {
    return null;
  }

  // Try to find the preferred component first
  if (preferredComponent) {
    const preferred = compose.find((c) => c.name === preferredComponent);
    if (preferred?.domains?.[0]) {
      return preferred.domains[0];
    }
  }

  // Fall back to the first component with a domain
  for (const component of compose) {
    if (component.domains?.[0]) {
      return component.domains[0];
    }
  }

  return null;
}

/**
 * Get the master node IP for a Flux app from the FDM (Flux Daemon Master) service.
 * This is the authoritative source for which node is the primary/master.
 *
 * @param appName - The app name
 * @returns The master node IP:port and list of all node IPs
 */
export async function getMasterNode(
  appName: string
): Promise<FluxApiResponse<MasterNodeResponse>> {
  try {
    const response = await fetch(
      `/api/flux/master-node?appName=${encodeURIComponent(appName)}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      }
    );

    return response.json();
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get master node',
    };
  }
}
