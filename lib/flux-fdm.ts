/**
 * FDM (Flux Domain Manager) utilities for master node detection.
 * This is the authoritative source for app node locations - works for ALL apps.
 * FDM returns IPs sorted with the MASTER NODE FIRST.
 */

interface FdmAppIpsResponse {
  status: "success" | "error";
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
  {
    name: "EU",
    baseUrl: (index: number) => `http://fdm-fn-1-${index}.runonflux.io:16130`,
  },
  {
    name: "USA",
    baseUrl: (index: number) => `http://fdm-usa-1-${index}.runonflux.io:16130`,
  },
  {
    name: "ASIA",
    baseUrl: (index: number) => `http://fdm-sg-1-${index}.runonflux.io:16130`,
  },
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
  timeout = 5000,
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
        method: "GET",
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        console.log(`[FDM] ${region.name} returned ${response.status}`);
        continue;
      }

      const data: FdmAppIpsResponse = await response.json();

      if (
        data.status === "success" &&
        data.data?.ips &&
        data.data.ips.length > 0
      ) {
        // First IP in the list is the MASTER
        const masterIp = data.data.ips[0];
        console.log(
          `[FDM] Master for ${appName}: ${masterIp} (from ${region.name})`,
        );

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
  const ip = ipPort.split(":")[0];
  return `${ip}:16127`;
}

/**
 * Universal master node detection for server-side use.
 * Primary: FDM (works for ALL apps, authoritative source)
 * Fallback: HAProxy statistics (only works for apps with domains)
 *
 * This is the SINGLE SOURCE OF TRUTH for master node detection.
 * All server-side code should use this function.
 *
 * @param appName - Application name
 * @param timeout - Timeout in ms (default: 5000)
 * @returns Master node IP only (no port) - caller must match against locations for correct port
 */
export async function detectMaster(
  appName: string,
  timeout = 5000,
): Promise<string | null> {
  // Primary: Try FDM first (works for ALL apps)
  const fdmResult = await getMasterFromFdm(appName, timeout);

  if (fdmResult.masterIp) {
    // FDM returns IP:appPort - extract just the IP (like the example does)
    const masterIp = fdmResult.masterIp.split(":")[0];
    console.log(`[detectMaster] Found via FDM for ${appName}: ${masterIp}`);
    return masterIp;
  }

  // Fallback: Try HAProxy (only works for apps with domains)
  console.log(`[detectMaster] FDM failed, trying HAProxy for ${appName}...`);

  try {
    const statsUrl = `https://${appName}.app.runonflux.io/fluxstatistics?scope=${appName}apprunonfluxio;json;norefresh`;

    const response = await fetch(statsUrl, {
      method: "GET",
      signal: AbortSignal.timeout(timeout),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.log(
        `[detectMaster] HAProxy returned ${response.status} for ${appName}`,
      );
      return null;
    }

    interface HaproxyField {
      field: { name: string };
      value: { value: string | number };
    }

    const data: HaproxyField[][] = await response.json();

    // Find the server with act=1 (active/master)
    for (const server of data) {
      const actField = server.find(
        (f) => f.field.name === "act" && f.value.value === 1,
      );

      if (actField) {
        const svnameField = server.find((f) => f.field.name === "svname");
        if (svnameField && typeof svnameField.value.value === "string") {
          // HAProxy returns IP:port - extract just the IP
          const masterIpPort = svnameField.value.value;
          const masterIp = masterIpPort.split(":")[0];
          console.log(
            `[detectMaster] Found via HAProxy for ${appName}: ${masterIp}`,
          );
          return masterIp;
        }
      }
    }

    console.log(
      `[detectMaster] No active master found in HAProxy for ${appName}`,
    );
    return null;
  } catch (error) {
    console.log(
      `[detectMaster] HAProxy failed for ${appName}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Find the full IP:port for a master IP by matching against known node IPs.
 * This is needed because FDM returns just the IP, but we need the correct port.
 *
 * @param masterIp - Master IP (without port) from detectMaster
 * @param nodeIps - Array of known node IP:port strings from client
 * @returns The matching IP:port or IP:16127 as fallback
 */
export function findMasterInNodes(
  masterIp: string,
  nodeIps: string[],
): string | null {
  // Find the node that matches the master IP
  for (const nodeIpPort of nodeIps) {
    const nodeIp = nodeIpPort.split(":")[0];
    if (nodeIp === masterIp) {
      return nodeIpPort;
    }
  }
  // If no match found in provided nodes, return with default port
  return `${masterIp}:16127`;
}
