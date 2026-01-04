/**
 * FDM (Flux Domain Manager) utilities for master node detection.
 * This is the authoritative source for app node locations - works for ALL apps.
 * FDM returns IPs sorted with the MASTER NODE FIRST.
 */

interface FdmAppIpsResponse {
  status: 'success' | 'error';
  data?: {
    ips: string[];
  };
  message?: string;
}

/**
 * Get FDM server index based on app name's first letter.
 * Apps are distributed across 4 FDM servers by first letter.
 * @param appName - Application name
 * @returns FDM index (1-4)
 */
function getFdmIndex(appName: string): number {
  const firstLetter = appName.substring(0, 1).toLowerCase();
  if (firstLetter.match(/[h-n]/)) return 2;
  if (firstLetter.match(/[o-u]/)) return 3;
  if (firstLetter.match(/[v-z]/)) return 4;
  return 1; // a-g or any other character
}

/**
 * FDM regional servers to try in order.
 */
const FDM_REGIONS = [
  { name: 'EU', baseUrl: (index: number) => `http://fdm-fn-1-${index}.runonflux.io:16130` },
  { name: 'USA', baseUrl: (index: number) => `http://fdm-usa-1-${index}.runonflux.io:16130` },
  { name: 'ASIA', baseUrl: (index: number) => `http://fdm-sg-1-${index}.runonflux.io:16130` },
];

/**
 * Get master node IP for a Flux app from FDM.
 * The FDM /appips endpoint returns IPs sorted with MASTER FIRST.
 * Tries EU, USA, and ASIA FDM servers in order until one succeeds.
 *
 * @param appName - Application name
 * @param timeout - Timeout in ms (default: 5000)
 * @returns Object with masterIp (IP:port), allIps, and region used
 */
export async function getMasterFromFdm(
  appName: string,
  timeout = 5000
): Promise<{
  masterIp: string | null;
  allIps: string[];
  region: string | null;
}> {
  const fdmIndex = getFdmIndex(appName);

  for (const region of FDM_REGIONS) {
    try {
      const baseUrl = region.baseUrl(fdmIndex);
      const url = `${baseUrl}/appips/${appName}`;

      console.log(`[FDM] Trying ${region.name}: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        console.log(`[FDM] ${region.name} returned ${response.status}`);
        continue;
      }

      const data: FdmAppIpsResponse = await response.json();

      if (data.status === 'success' && data.data?.ips && data.data.ips.length > 0) {
        // First IP in the list is the MASTER
        const masterIp = data.data.ips[0];
        console.log(`[FDM] Master for ${appName}: ${masterIp} (from ${region.name})`);

        return {
          masterIp,
          allIps: data.data.ips,
          region: region.name,
        };
      }

      console.log(`[FDM] ${region.name} returned no IPs for ${appName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[FDM] ${region.name} failed for ${appName}: ${message}`);
    }
  }

  // All regions failed
  console.log(`[FDM] All regions failed for ${appName}`);
  return { masterIp: null, allIps: [], region: null };
}

/**
 * Convert FDM IP format (IP:port or just IP) to the correct Flux API port.
 * FDM returns app ports, but we need the Flux API port (16xxx).
 *
 * @param ipPort - IP:port string from FDM
 * @returns IP:16127 format for Flux API access
 */
export function toFluxApiPort(ipPort: string): string {
  const ip = ipPort.split(':')[0];
  return `${ip}:16127`;
}
