import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * FDM (Flux Daemon Master) regions to try in order
 */
const FDM_REGIONS = ['eu', 'usa', 'asia'];

/**
 * Get FDM index based on app name's first letter
 * a-g or other: 1, h-n: 2, o-u: 3, v-z: 4
 */
function getFdmIndex(appName: string): number {
  const firstChar = appName.charAt(0).toLowerCase();
  if (firstChar >= 'h' && firstChar <= 'n') return 2;
  if (firstChar >= 'o' && firstChar <= 'u') return 3;
  if (firstChar >= 'v' && firstChar <= 'z') return 4;
  return 1;
}

/**
 * Build FDM URL for a given region and app name
 */
function buildFdmUrl(region: string, appName: string): string {
  const index = getFdmIndex(appName);
  return `http://fdm-${region}-1-${index}.runonflux.io:16130/appips/${appName}`;
}

/**
 * Get the master node IP for a Flux app from FDM service.
 * The first IP in the response is the primary/master node.
 */
export async function GET(request: NextRequest) {
  const appName = request.nextUrl.searchParams.get('appName');

  if (!appName) {
    return NextResponse.json(
      { status: 'error', message: 'Missing required parameter: appName' },
      { status: 400 }
    );
  }

  // Try each FDM region until one succeeds
  for (const region of FDM_REGIONS) {
    const fdmUrl = buildFdmUrl(region, appName);

    try {
      console.log(`[master-node] Trying FDM ${region}: ${fdmUrl}`);

      const response = await fetch(fdmUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.log(`[master-node] FDM ${region} returned ${response.status}`);
        continue;
      }

      const data = await response.json();

      // FDM returns { data: { ips: ["IP:port", ...] } } or { ips: [...] }
      const ips = data?.data?.ips || data?.ips || [];

      if (ips.length > 0) {
        const masterIp = ips[0];
        console.log(`[master-node] Found master for ${appName}: ${masterIp} (via ${region})`);

        return NextResponse.json({
          status: 'success',
          data: {
            masterIp,
            allIps: ips,
            region,
            appName,
          },
        });
      }

      console.log(`[master-node] FDM ${region} returned empty IPs`);
    } catch (error) {
      console.log(`[master-node] FDM ${region} failed:`, error instanceof Error ? error.message : error);
      continue;
    }
  }

  // All FDM regions failed
  return NextResponse.json({
    status: 'error',
    message: 'Could not determine master node from FDM service',
  });
}
