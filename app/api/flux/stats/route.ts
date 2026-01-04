import { NextRequest, NextResponse } from 'next/server';
import { getMasterFromFdm, toFluxApiPort } from '@/lib/flux-fdm';

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
  disk_stats?: {
    bind?: number;
    volume?: number;
    rootfs?: number;
    status?: string;
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

// Retry helper with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  retryDelay: number = 500
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        console.log(`[Stats] Retry ${attempt + 1}/${maxRetries} for ${url} after ${retryDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 1.5; // Increase delay for next retry
      }
    }
  }

  throw lastError;
}

function transformDockerStats(rawStats: DockerStats, containerName: string, hddLimitGB?: number) {
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

  // Calculate disk usage (bind mounts are the primary persistent storage)
  const diskUsage = rawStats.disk_stats?.status !== 'error'
    ? (rawStats.disk_stats?.bind || 0) + (rawStats.disk_stats?.volume || 0)
    : 0;
  const diskLimit = hddLimitGB ? hddLimitGB * 1024 * 1024 * 1024 : 0; // Convert GB to bytes

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
    disk: {
      usage: diskUsage,
      limit: diskLimit,
      percent: diskLimit > 0 ? (diskUsage / diskLimit) * 100 : 0,
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

  // Get app specification to find component names and HDD limits
  let componentNames: string[] = [];
  const componentHddLimits: Record<string, number> = {};
  let defaultHddLimit = 0;
  try {
    const specResponse = await fetch(
      `https://api.runonflux.io/apps/appspecifications/${appName}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const specData = await specResponse.json();
    if (specData.status === 'success' && specData.data) {
      if (specData.data.compose) {
        componentNames = specData.data.compose.map((c: { name: string; hdd: number }) => {
          componentHddLimits[`${c.name}_${appName}`] = c.hdd || 0;
          return c.name;
        });
      } else {
        defaultHddLimit = specData.data.hdd || 0;
      }
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

  // Detect master node via FDM and prioritize it
  const fdmResult = await getMasterFromFdm(appName, 5000);
  if (fdmResult.masterIp) {
    const masterApiPort = toFluxApiPort(fdmResult.masterIp);
    console.log(`[Stats] Master detected via FDM: ${masterApiPort}`);

    // Check if master is already in the list
    const masterIndex = ips.findIndex(ip => ip.includes(masterApiPort.split(':')[0]));
    if (masterIndex > 0) {
      // Move master to front
      ips.splice(masterIndex, 1);
      ips.unshift(masterApiPort);
      console.log('[Stats] Moved master to front of list');
    } else if (masterIndex === -1) {
      // Master not in client list, add it first
      ips.unshift(masterApiPort);
      console.log('[Stats] Added master to front of list');
    }
  } else {
    console.log('[Stats] FDM detection failed, using client-provided order');
  }

  console.log('Node IPs after master detection:', ips);
  console.log('Container names to try:', containerNames);
  console.log('Starting node iteration...');

  // Build headers once
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

  // Try each node and container name until we get a successful response with data
  // First node (master) gets 3 retries, others get 1 retry
  for (let nodeIndex = 0; nodeIndex < ips.length; nodeIndex++) {
    const nodeIp = ips[nodeIndex];
    const maxRetries = nodeIndex === 0 ? 3 : 1; // Master node gets more retries

    for (const containerName of containerNames) {
      try {
        // Use port from location data if provided, otherwise default to 16127
        const hasPort = nodeIp.includes(':');
        const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;
        const nodeUrl = `${baseUrl}/apps/appstats/${containerName}`;

        console.log(`Trying node: ${nodeIp} -> ${nodeUrl} (max retries: ${maxRetries})`);

        const response = await fetchWithRetry(
          nodeUrl,
          {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000), // Shorter timeout per attempt
          },
          maxRetries
        );

        // Check if response is OK and is JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!response.ok || !contentType?.includes('application/json')) {
          const text = await response.text();
          console.log(`[Stats] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`);
          continue; // Try next container/node
        }

        const data = await response.json();
        console.log(`Response from ${nodeIp}:`, data.status, data.data?.name || 'no name');

        if (response.ok && data.status === 'success' && data.data) {
          console.log(`SUCCESS from ${nodeIp} - returning stats`);
          console.log('Raw data memory:', data.data.memory_stats?.usage, '/', data.data.memory_stats?.limit);
          // Transform raw Docker stats to our format
          const hddLimit = componentHddLimits[containerName] || defaultHddLimit;
          const transformedStats = transformDockerStats(data.data, containerName, hddLimit);

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
