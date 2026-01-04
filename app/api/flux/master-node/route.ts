import { NextRequest, NextResponse } from 'next/server';
import { detectMasterNode } from '@/lib/flux-haproxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Get the master node IP for a Flux app by checking HAProxy statistics.
 * The master is the server with act=1 (active), backups have bck=1.
 * This returns the correct Flux API port (not app port).
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

    const masterIp = await detectMasterNode(appName, 10000);

    if (masterIp) {
      console.log(`[master-node] Found master for ${appName}: ${masterIp}`);
      return NextResponse.json({
        status: 'success',
        data: {
          masterIp,
          appName,
          source: 'haproxy',
        },
      });
    }

    console.log(`[master-node] No active server found for ${appName}`);
    return NextResponse.json({
      status: 'error',
      message: 'No active master node found in HAProxy stats',
    });
  } catch (error) {
    console.error(`[master-node] Error:`, error);

    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to detect master node',
    });
  }
}
