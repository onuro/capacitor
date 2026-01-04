import { NextRequest, NextResponse } from 'next/server';
import { detectMasterNode } from '@/lib/flux-haproxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface FileInfo {
  name: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  createdAt: string;
  modifiedAt: string;
}

interface TryNodeResult {
  success: boolean;
  response?: NextResponse;
  error?: string;
}

/**
 * Try to fetch files from a single node.
 */
async function tryNode(
  nodeIp: string,
  headers: Record<string, string>,
  appName: string,
  component: string,
  folder: string
): Promise<TryNodeResult> {
  try {
    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    let endpoint = `/apps/getfolderinfo/${appName}/${component}`;
    if (folder && folder !== '/') {
      const cleanFolder = folder.startsWith('/') ? folder.slice(1) : folder;
      endpoint += `/${encodeURIComponent(cleanFolder)}`;
    }

    const nodeUrl = baseUrl + endpoint;
    console.log(`[Files] Trying ${nodeIp}...`);

    const response = await fetch(nodeUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`[Files] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`);
      return { success: false, error: `Node ${nodeIp} returned ${response.status}` };
    }

    const responseText = await response.text();

    // Check for HTML response (error page)
    if (responseText.trim().startsWith('<')) {
      console.log(`[Files] ${nodeIp} returned HTML error page`);
      return { success: false, error: `Node ${nodeIp} returned error page` };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.log(`[Files] ${nodeIp} returned invalid JSON`);
      return { success: false, error: `Node ${nodeIp} returned invalid JSON` };
    }

    if (data.status === 'success') {
      console.log(`[Files] SUCCESS from ${nodeIp}`);
      const files: FileInfo[] = (data.data || []).map((file: FileInfo) => ({
        name: file.name,
        size: file.size || 0,
        isDirectory: file.isDirectory || false,
        modifiedAt: file.modifiedAt || '',
        permissions: file.isDirectory ? 'drwxr-xr-x' : '-rw-r--r--',
      }));

      return {
        success: true,
        response: NextResponse.json({
          status: 'success',
          data: { path: folder || '/', files },
          nodeIp,
        }),
      };
    }

    const errorMessage = data.message || data.data?.message || 'Unknown error';
    console.log(`[Files] ${nodeIp} returned error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  } catch (error) {
    console.log(`[Files] ${nodeIp} failed:`, error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeIpParam = searchParams.get('nodeIp') || searchParams.get('nodeIps');
  const appName = searchParams.get('appName');
  const component = searchParams.get('component');
  const folder = searchParams.get('folder') || '';
  const zelidauth = request.headers.get('zelidauth');

  if (!nodeIpParam || !appName || !component) {
    return NextResponse.json(
      { status: 'error', message: 'Missing nodeIp, appName, or component parameter' },
      { status: 400 }
    );
  }

  if (!zelidauth) {
    return NextResponse.json(
      { status: 'error', message: 'Authentication required' },
      { status: 401 }
    );
  }

  // Parse node IPs (support comma-separated list for fallback)
  const nodeIps = nodeIpParam.split(',').map(ip => ip.trim()).filter(Boolean);

  // Parse zelidauth and convert to JSON format for nodes
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

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

  // 1. Detect master node via HAProxy
  console.log(`[Files] Detecting master node for ${appName}...`);
  const masterIp = await detectMasterNode(appName);
  if (masterIp) {
    console.log(`[Files] Master node detected: ${masterIp}`);
  } else {
    console.log(`[Files] No master detected, using client-provided nodes`);
  }

  // 2. Reorder nodes: master first, then others
  const orderedNodes = masterIp
    ? [masterIp, ...nodeIps.filter(ip => ip !== masterIp)]
    : nodeIps;

  let lastError = '';

  // 3. If we have a master, try it with retries (3 attempts, 2s delay)
  if (masterIp && orderedNodes.length > 0) {
    const masterNode = orderedNodes[0];
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[Files] Master attempt ${attempt}/3 for ${masterNode}`);
      const result = await tryNode(masterNode, headers, appName, component, folder);

      if (result.success && result.response) {
        return result.response;
      }

      lastError = result.error || 'Unknown error';

      // Wait before retry (unless last attempt)
      if (attempt < 3) {
        console.log(`[Files] Retrying master in 2s...`);
        await sleep(2000);
      }
    }
    console.log(`[Files] Master exhausted after 3 attempts, trying fallback nodes...`);
  }

  // 4. Fall back to other nodes (one attempt each)
  const fallbackNodes = masterIp ? orderedNodes.slice(1) : orderedNodes;
  for (const nodeIp of fallbackNodes) {
    const result = await tryNode(nodeIp, headers, appName, component, folder);

    if (result.success && result.response) {
      return result.response;
    }

    lastError = result.error || 'Unknown error';
  }

  // All nodes failed
  return NextResponse.json(
    { status: 'error', message: `Failed to load files. ${lastError}` },
    { status: 502 }
  );
}
