export interface FluxApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

export interface AppLogEntry {
  timestamp: string;
  message: string;
}

/**
 * Get application logs from Flux nodes via proxy
 * @param nodeIps - IP address(es) of the Flux node(s) - will try each until one succeeds
 * @param appName - Name of the application
 * @param lines - Number of lines to retrieve (default 100)
 * @param zelidauth - Authentication token
 */
export async function getAppLogs(
  nodeIps: string | string[],
  appName: string,
  lines: number = 100,
  zelidauth?: string
): Promise<FluxApiResponse<string>> {
  if (!zelidauth) {
    return { status: 'error', message: 'Authentication required' };
  }

  // Support both single IP and array of IPs for fallback
  const nodeIpParam = Array.isArray(nodeIps) ? nodeIps.join(',') : nodeIps;

  const params = new URLSearchParams({
    nodeIp: nodeIpParam,
    appName,
    lines: String(lines),
  });

  const response = await fetch(`/api/flux/logs?${params}`, {
    headers: { zelidauth },
  });

  return response.json();
}

/**
 * Parse raw log string into structured entries
 */
export function parseLogEntries(rawLogs: string | unknown): AppLogEntry[] {
  if (!rawLogs || typeof rawLogs !== 'string') return [];

  const lines = rawLogs.split('\n').filter(line => line.trim());
  return lines.map(line => {
    // Try to extract timestamp if present (common Docker log format)
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(.*)$/);
    if (timestampMatch) {
      return {
        timestamp: timestampMatch[1],
        message: timestampMatch[2],
      };
    }
    return {
      timestamp: new Date().toISOString(),
      message: line,
    };
  });
}

