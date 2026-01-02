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
 * Get application logs from a specific node via proxy
 * @param nodeIp - IP address of the Flux node
 * @param appName - Name of the application
 * @param lines - Number of lines to retrieve (default 100)
 * @param zelidauth - Authentication token
 */
export async function getAppLogs(
  nodeIp: string,
  appName: string,
  lines: number = 100,
  zelidauth?: string
): Promise<FluxApiResponse<string>> {
  if (!zelidauth) {
    return { status: 'error', message: 'Authentication required' };
  }

  const params = new URLSearchParams({
    nodeIp,
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

