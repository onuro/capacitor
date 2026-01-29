import { NextRequest, NextResponse } from 'next/server';
import { getMasterFromFdm } from '@/lib/flux-fdm';
import { detectMasterNode } from '@/lib/flux-haproxy';
import { fetchPortMap, resolvePort } from '@/lib/flux-status';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Get the master node IP for a Flux app.
 * Primary: FDM (Flux Domain Manager) - works for ALL apps
 * Fallback: HAProxy statistics - only works for apps with domains
 *
 * Uses the app's /status endpoint to resolve correct Flux API ports.
 */
export async function GET(request: NextRequest) {
  const appName = request.nextUrl.searchParams.get('appName');

  if (!appName) {
    return NextResponse.json(
      { status: 'error', message: 'Missing required parameter: appName' },
      { status: 400 }
    );
  }

  try {
    console.log(`[master-node] Detecting master for ${appName}...`);

    // Fetch FDM and port map in parallel
    const [fdmResult, portMap] = await Promise.all([
      getMasterFromFdm(appName, 8000),
      fetchPortMap(appName),
    ]);

    if (fdmResult.masterIp) {
      const masterResolved = resolvePort(fdmResult.masterIp, portMap);
      console.log(`[master-node] Found master via FDM for ${appName}: ${masterResolved}`);
      return NextResponse.json({
        status: 'success',
        data: {
          masterIp: masterResolved,
          allIps: fdmResult.allIps.map((ip) => resolvePort(ip, portMap)),
          appName,
          region: fdmResult.region,
          source: 'fdm',
        },
      });
    }

    // Fallback: Try HAProxy (only works for apps with domains)
    console.log(`[master-node] FDM failed, trying HAProxy for ${appName}...`);
    const haproxyMaster = await detectMasterNode(appName, 8000);

    if (haproxyMaster) {
      const masterResolved = resolvePort(haproxyMaster, portMap);
      console.log(`[master-node] Found master via HAProxy for ${appName}: ${masterResolved}`);
      return NextResponse.json({
        status: 'success',
        data: {
          masterIp: masterResolved,
          allIps: [masterResolved],
          appName,
          source: 'haproxy',
        },
      });
    }

    console.log(`[master-node] No master found for ${appName}`);
    return NextResponse.json({
      status: 'error',
      message: 'Could not detect master node from FDM or HAProxy',
    });
  } catch (error) {
    console.error(`[master-node] Error:`, error);

    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to detect master node',
    });
  }
}
