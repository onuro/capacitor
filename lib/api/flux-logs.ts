import apiClient from './client';
import { zelidauthToJson } from './auth';

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
 * Get application logs
 * @param appName - Name of the application
 * @param lines - Number of lines to retrieve (default 100)
 * @param zelidauth - Authentication token (colon format, will be converted to JSON)
 */
export async function getAppLogs(
  appName: string,
  lines: number = 100,
  zelidauth?: string
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `/apps/applog/${appName}/${lines}`,
    {
      timeout: 30000,
      headers: zelidauth ? { zelidauth: zelidauthToJson(zelidauth) } : undefined,
    }
  );
  return response.data;
}

/**
 * Get application logs from a specific node
 * @param nodeIp - IP address of the Flux node
 * @param appName - Name of the application
 * @param lines - Number of lines to retrieve
 */
export async function getAppLogsFromNode(
  nodeIp: string,
  appName: string,
  lines: number = 100
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `http://${nodeIp}:16127/apps/applog/${appName}/${lines}`,
    { timeout: 30000 }
  );
  return response.data;
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

/**
 * Get debug information for an app (more detailed logs)
 */
export async function getAppDebug(
  zelidauth: string,
  appName: string
): Promise<FluxApiResponse<string>> {
  const response = await apiClient.get<FluxApiResponse<string>>(
    `/apps/appdebug/${appName}`,
    {
      headers: { zelidauth },
      timeout: 30000,
    }
  );
  return response.data;
}
