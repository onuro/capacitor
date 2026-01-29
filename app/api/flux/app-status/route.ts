import { NextRequest, NextResponse } from 'next/server';
import { getAppStatusDomain, buildPortMap } from '@/lib/flux-status';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ClusterStatusNode {
  ip: string;
  active: boolean;
  seqNo?: number;
  staticIp?: boolean;
  osUptime?: number;
  masterIP?: string;
}

interface FluxAppStatusResponse {
  status: string;
  masterIP?: string;
  clusterStatus?: ClusterStatusNode[];
}

/**
 * Proxy for Flux app /status endpoint.
 * Returns the cluster status with correct IP:PORT for each node,
 * plus a portMap for easy lookup.
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
    const domain = await getAppStatusDomain(appName);
    const statusUrl = `https://${domain}/status`;

    const response = await fetch(statusUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({
        status: 'error',
        message: `Status endpoint returned ${response.status}`,
      });
    }

    const data: FluxAppStatusResponse = await response.json();

    if (!data.clusterStatus || data.clusterStatus.length === 0) {
      return NextResponse.json({
        status: 'error',
        message: 'No cluster status data available',
      });
    }

    const portMap = buildPortMap(data.clusterStatus);

    return NextResponse.json({
      status: 'success',
      data: {
        appName,
        masterIP: data.masterIP || null,
        portMap,
        clusterStatus: data.clusterStatus,
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch app status',
    });
  }
}
