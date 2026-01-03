import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  const statsUrl = `https://${appName}.app.runonflux.io/fluxstatistics?scope=${appName}apprunonfluxio;json;norefresh`;

  try {
    console.log(`[master-node] Fetching HAProxy stats: ${statsUrl}`);

    const response = await fetch(statsUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[master-node] HAProxy stats returned ${response.status}`);
      return NextResponse.json({
        status: 'error',
        message: `HAProxy stats returned ${response.status}`,
      });
    }

    const data: HaproxyField[][] = await response.json();

    // Find the server with act=1 (active/master)
    for (const server of data) {
      const actField = server.find(
        (f) => f.field.name === 'act' && f.value.value === 1
      );

      if (actField) {
        // Found active server, get its svname (IP:port)
        const svnameField = server.find((f) => f.field.name === 'svname');
        if (svnameField && typeof svnameField.value.value === 'string') {
          const masterIp = svnameField.value.value;
          console.log(`[master-node] Found master for ${appName}: ${masterIp} (act=1)`);

          return NextResponse.json({
            status: 'success',
            data: {
              masterIp,
              appName,
              source: 'haproxy',
            },
          });
        }
      }
    }

    // No active server found
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
