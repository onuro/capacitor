/**
 * HAProxy utilities for Flux node detection.
 * Shared logic used by API routes.
 */

interface HaproxyField {
  objType: string;
  proxyId: number;
  id: number;
  field: { pos: number; name: string };
  processNum: number;
  tags: Record<string, string>;
  value: { type: string; value: string | number };
}

/**
 * Detect the master node for a Flux app via HAProxy statistics.
 * The master is the server with act=1 (active).
 *
 * @param appName - The app name
 * @param timeout - Timeout in ms (default: 5000)
 * @returns The master node IP:port or null if not found
 */
export async function detectMasterNode(
  appName: string,
  timeout = 5000
): Promise<string | null> {
  const statsUrl = `https://${appName}.app.runonflux.io/fluxstatistics?scope=${appName}apprunonfluxio;json;norefresh`;

  try {
    const response = await fetch(statsUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout),
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.log(`[HAProxy] Stats returned ${response.status} for ${appName}`);
      return null;
    }

    const data: HaproxyField[][] = await response.json();

    // Find the server with act=1 (active/master)
    for (const server of data) {
      const actField = server.find(
        (f) => f.field.name === 'act' && f.value.value === 1
      );

      if (actField) {
        const svnameField = server.find((f) => f.field.name === 'svname');
        if (svnameField && typeof svnameField.value.value === 'string') {
          return svnameField.value.value;
        }
      }
    }

    console.log(`[HAProxy] No active master found for ${appName}`);
    return null;
  } catch (error) {
    console.log(
      `[HAProxy] Detection failed for ${appName}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
