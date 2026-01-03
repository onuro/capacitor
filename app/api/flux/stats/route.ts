import { NextRequest, NextResponse } from 'next/server';

// Disable caching for this API route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Transform raw Docker stats to our AppStats format
interface DockerStats {
  name: string;
  id: string;
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
  };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{ op: string; value: number }>;
  };
}

function calculateCpuPercent(stats: DockerStats): number {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;

  if (systemDelta > 0 && cpuDelta > 0) {
    return (cpuDelta / systemDelta) * cpuCount * 100;
  }
  return 0;
}

function transformDockerStats(rawStats: DockerStats, containerName: string) {
  // Calculate network totals
  let rxBytes = 0;
  let txBytes = 0;
  if (rawStats.networks) {
    Object.values(rawStats.networks).forEach((net) => {
      rxBytes += net.rx_bytes || 0;
      txBytes += net.tx_bytes || 0;
    });
  }

  // Calculate block I/O
  let readBytes = 0;
  let writeBytes = 0;
  if (rawStats.blkio_stats?.io_service_bytes_recursive) {
    rawStats.blkio_stats.io_service_bytes_recursive.forEach((stat) => {
      if (stat.op === 'read' || stat.op === 'Read') readBytes += stat.value;
      if (stat.op === 'write' || stat.op === 'Write') writeBytes += stat.value;
    });
  }

  const memoryUsage = rawStats.memory_stats?.usage || 0;
  const memoryLimit = rawStats.memory_stats?.limit || 0;

  return {
    name: containerName,
    cpu: calculateCpuPercent(rawStats),
    memory: {
      usage: memoryUsage,
      limit: memoryLimit,
      percent: memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0,
    },
    network: {
      rx_bytes: rxBytes,
      tx_bytes: txBytes,
    },
    block: {
      read_bytes: readBytes,
      write_bytes: writeBytes,
    },
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeIps = searchParams.get('nodeIps'); // comma-separated list of IPs
  const appName = searchParams.get('appName');
  const zelidauth = request.headers.get('zelidauth');

  if (!nodeIps || !appName) {
    return NextResponse.json(
      { status: 'error', message: 'Missing nodeIps or appName parameter' },
      { status: 400 }
    );
  }

  const ips = nodeIps.split(',').filter(Boolean);

  // Get app specification to find component names
  let componentNames: string[] = [];
  try {
    const specResponse = await fetch(
      `https://api.runonflux.io/apps/appspecifications/${appName}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const specData = await specResponse.json();
    if (specData.status === 'success' && specData.data?.compose) {
      componentNames = specData.data.compose.map((c: { name: string }) => c.name);
    }
  } catch (error) {
    console.error('Error fetching app spec:', error);
  }

  // Build list of container names to try (componentname_appname format per Flux convention)
  const containerNames = componentNames.length > 0
    ? componentNames.map(c => `${c}_${appName}`)
    : [appName];

  console.log('=== Stats Debug ===', new Date().toISOString());
  console.log('Node IPs received:', ips);
  console.log('Container names to try:', containerNames);
  console.log('Starting node iteration...');

  // Try each node and container name until we get a successful response with data
  for (const nodeIp of ips) {
    for (const containerName of containerNames) {
      try {
        // Use port from location data if provided, otherwise default to 16127
        const hasPort = nodeIp.includes(':');
        const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;
        const nodeUrl = `${baseUrl}/apps/appstats/${containerName}`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (zelidauth) {
          // Parse zelidauth and convert to JSON for nodes
          // Supports both query string format (zelid=xxx&...) and colon format (zelid:sig:phrase)
          const params = new URLSearchParams(zelidauth);
          let zelid = params.get('zelid');
          let signature = params.get('signature');
          let loginPhrase = params.get('loginPhrase');

          if (!zelid || !signature || !loginPhrase) {
            const parts = zelidauth.split(':');
            if (parts.length >= 3) {
              zelid = parts[0];
              signature = parts[1];
              loginPhrase = parts.slice(2).join(':');
            }
          }

          if (zelid && signature && loginPhrase) {
            headers['zelidauth'] = JSON.stringify({ zelid, signature, loginPhrase });
          } else {
            headers['zelidauth'] = zelidauth;
          }
        }

        console.log(`Trying node: ${nodeIp} -> ${nodeUrl}`);

        const response = await fetch(nodeUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(10000),
        });

        // Check if response is OK and is JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!response.ok || !contentType?.includes('application/json')) {
          const text = await response.text();
          console.log(`[Stats] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`);
          continue; // Try next node
        }

        const data = await response.json();
        console.log(`Response from ${nodeIp}:`, data.status, data.data?.name || 'no name');

        if (response.ok && data.status === 'success' && data.data) {
          console.log(`SUCCESS from ${nodeIp} - returning stats`);
          console.log('Raw data memory:', data.data.memory_stats?.usage, '/', data.data.memory_stats?.limit);
          // Transform raw Docker stats to our format
          const transformedStats = transformDockerStats(data.data, containerName);

          return NextResponse.json({
            status: 'success',
            data: {
              appName,
              containers: [transformedStats],
            },
            nodeIp,
            containerName,
            // Debug: include raw data for verification
            _debug: {
              rawMemoryUsage: data.data.memory_stats?.usage,
              rawMemoryLimit: data.data.memory_stats?.limit,
              rawContainerName: data.data.name,
              queriedUrl: nodeUrl,
            },
          });
        }
      } catch (error) {
        console.error(`Error fetching stats from ${nodeIp}/${containerName}:`, error);
      }
    }
  }

  return NextResponse.json(
    { status: 'error', message: 'Failed to fetch stats from any node' },
    { status: 502 }
  );
}
