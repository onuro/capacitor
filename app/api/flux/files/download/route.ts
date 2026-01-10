import { NextRequest, NextResponse } from 'next/server';
import { detectMasterNode } from '@/lib/flux-haproxy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TryNodeResult {
  success: boolean;
  response?: NextResponse;
  error?: string;
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try to download file from a single node
 */
async function tryNode(
  nodeIp: string,
  headers: Record<string, string>,
  appName: string,
  component: string,
  filePath: string
): Promise<TryNodeResult> {
  try {
    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    // Build the download URL - Flux uses /apps/downloadfile/:appname/:component/:file
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const endpoint = `/apps/downloadfile/${appName}/${component}/${encodeURIComponent(cleanPath)}`;
    const nodeUrl = baseUrl + endpoint;

    console.log(`[Download] Trying ${nodeIp}...`);

    const response = await fetch(nodeUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`[Download] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`);
      return { success: false, error: `Node ${nodeIp} returned ${response.status}` };
    }

    // Check if response is JSON (error) or raw file content
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      // Check if this is a Flux API response (has status field) or raw JSON file content
      if (data.status === 'error') {
        const errorMessage = data.message || data.data?.message || 'Failed to download file';
        console.log(`[Download] ${nodeIp} returned error: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
      // If it's a Flux API success response, return data.data
      // Otherwise it's a raw JSON file - stringify it back
      const isFluxResponse = typeof data.status === 'string' && 'data' in data;
      console.log(`[Download] SUCCESS from ${nodeIp}`);
      return {
        success: true,
        response: NextResponse.json({
          status: 'success',
          data: isFluxResponse ? data.data : JSON.stringify(data, null, 2),
          contentType: 'application/json',
          nodeIp,
        }),
      };
    }

    // Return raw file content as text
    const content = await response.text();
    console.log(`[Download] SUCCESS from ${nodeIp}`);
    return {
      success: true,
      response: NextResponse.json({
        status: 'success',
        data: content,
        contentType: contentType || 'text/plain',
        nodeIp,
      }),
    };
  } catch (error) {
    console.log(`[Download] ${nodeIp} failed:`, error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeIpParam = searchParams.get('nodeIp');
  const appName = searchParams.get('appName');
  const component = searchParams.get('component');
  const filePath = searchParams.get('filePath');
  const zelidauth = request.headers.get('zelidauth');

  if (!nodeIpParam || !appName || !component || !filePath) {
    return NextResponse.json(
      { status: 'error', message: 'Missing required parameters' },
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
  console.log(`[Download] Detecting master node for ${appName}...`);
  const masterIp = await detectMasterNode(appName);
  if (masterIp) {
    console.log(`[Download] Master node detected: ${masterIp}`);
  } else {
    console.log(`[Download] No master detected, using client-provided nodes`);
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
      console.log(`[Download] Master attempt ${attempt}/3 for ${masterNode}`);
      const result = await tryNode(masterNode, headers, appName, component, filePath);

      if (result.success && result.response) {
        return result.response;
      }

      lastError = result.error || 'Unknown error';

      // Wait before retry (unless last attempt)
      if (attempt < 3) {
        console.log(`[Download] Retrying master in 2s...`);
        await sleep(2000);
      }
    }
    console.log(`[Download] Master exhausted after 3 attempts, trying fallback nodes...`);
  }

  // 4. Fall back to other nodes (one attempt each)
  const fallbackNodes = masterIp ? orderedNodes.slice(1) : orderedNodes;
  for (const nodeIp of fallbackNodes) {
    const result = await tryNode(nodeIp, headers, appName, component, filePath);

    if (result.success && result.response) {
      return result.response;
    }

    lastError = result.error || 'Unknown error';
  }

  // All nodes failed
  return NextResponse.json(
    { status: 'error', message: `Failed to download file. ${lastError}` },
    { status: 502 }
  );
}
