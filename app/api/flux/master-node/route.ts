import { NextRequest, NextResponse } from 'next/server';
import { getMasterFromFdm, toFluxApiPort } from '@/lib/flux-fdm';
import { detectMasterNode } from '@/lib/flux-haproxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Get the master node IP for a Flux app.
 * Primary: FDM (Flux Domain Manager) - works for ALL apps
 * Fallback: HAProxy statistics - only works for apps with domains
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

    // Primary: Try FDM first (works for ALL apps)
    const fdmResult = await getMasterFromFdm(appName, 8000);

    if (fdmResult.masterIp) {
      // Convert app port to Flux API port
      const masterApiPort = toFluxApiPort(fdmResult.masterIp);
      console.log(`[master-node] Found master via FDM for ${appName}: ${masterApiPort}`);
      return NextResponse.json({
        status: 'success',
        data: {
          masterIp: masterApiPort,
          allIps: fdmResult.allIps.map(toFluxApiPort),
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
      console.log(`[master-node] Found master via HAProxy for ${appName}: ${haproxyMaster}`);
      return NextResponse.json({
        status: 'success',
        data: {
          masterIp: haproxyMaster,
          allIps: [haproxyMaster],
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
