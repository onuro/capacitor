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
 * Try to delete file from a single node
 */
async function tryNode(
  nodeIp: string,
  authHeader: string,
  appName: string,
  component: string,
  filePath: string
): Promise<TryNodeResult> {
  try {
    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    // Flux uses GET /apps/removeobject/:appname/:component/:filepath
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const encodedPath = encodeURIComponent(cleanPath);
    const endpoint = `/apps/removeobject/${appName}/${component}/${encodedPath}`;
    const nodeUrl = baseUrl + endpoint;

    console.log(`[Delete] Trying ${nodeIp}...`);

    const response = await fetch(nodeUrl, {
      method: 'GET',
      headers: {
        'zelidauth': authHeader,
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`[Delete] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`);
      return { success: false, error: `Node ${nodeIp} returned ${response.status}` };
    }

    const responseText = await response.text();
    console.log(`[Delete] ${nodeIp} response:`, responseText.slice(0, 200));

    // Try to parse as JSON for error checking
    try {
      const data = JSON.parse(responseText);
      if (data.status === 'error') {
        const errorMessage = data.message || data.data?.message || 'Failed to delete';
        console.log(`[Delete] ${nodeIp} returned error: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
      console.log(`[Delete] SUCCESS from ${nodeIp}`);
      return {
        success: true,
        response: NextResponse.json({
          status: 'success',
          message: data.message || 'Deleted successfully',
          nodeIp,
        }),
      };
    } catch {
      // Non-JSON response with 2xx status is success
      console.log(`[Delete] SUCCESS from ${nodeIp}`);
      return {
        success: true,
        response: NextResponse.json({
          status: 'success',
          message: 'Deleted successfully',
          nodeIp,
        }),
      };
    }
  } catch (error) {
    console.log(`[Delete] ${nodeIp} failed:`, error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

export async function DELETE(request: NextRequest) {
  const zelidauth = request.headers.get('zelidauth');

  if (!zelidauth) {
    return NextResponse.json(
      { status: 'error', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { nodeIp: nodeIpParam, appName, component, filePath } = body;

    if (!nodeIpParam || !appName || !component || !filePath) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Parse node IPs (support comma-separated list for fallback)
    const nodeIps = nodeIpParam.split(',').map((ip: string) => ip.trim()).filter(Boolean);

    // Parse zelidauth and convert to JSON format for nodes
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

    let authHeader: string;
    if (zelid && signature && loginPhrase) {
      authHeader = JSON.stringify({ zelid, signature, loginPhrase });
    } else {
      authHeader = zelidauth;
    }

    // 1. Detect master node via HAProxy
    console.log(`[Delete] Detecting master node for ${appName}...`);
    const masterIp = await detectMasterNode(appName);
    if (masterIp) {
      console.log(`[Delete] Master node detected: ${masterIp}`);
    } else {
      console.log(`[Delete] No master detected, using client-provided nodes`);
    }

    // 2. Reorder nodes: master first, then others
    const orderedNodes = masterIp
      ? [masterIp, ...nodeIps.filter((ip: string) => ip !== masterIp)]
      : nodeIps;

    let lastError = '';

    // 3. If we have a master, try it with retries (3 attempts, 2s delay)
    if (masterIp && orderedNodes.length > 0) {
      const masterNode = orderedNodes[0];
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`[Delete] Master attempt ${attempt}/3 for ${masterNode}`);
        const result = await tryNode(masterNode, authHeader, appName, component, filePath);

        if (result.success && result.response) {
          return result.response;
        }

        lastError = result.error || 'Unknown error';

        // Wait before retry (unless last attempt)
        if (attempt < 3) {
          console.log(`[Delete] Retrying master in 2s...`);
          await sleep(2000);
        }
      }
      console.log(`[Delete] Master exhausted after 3 attempts, trying fallback nodes...`);
    }

    // 4. Fall back to other nodes (one attempt each)
    const fallbackNodes = masterIp ? orderedNodes.slice(1) : orderedNodes;
    for (const nodeIp of fallbackNodes) {
      const result = await tryNode(nodeIp, authHeader, appName, component, filePath);

      if (result.success && result.response) {
        return result.response;
      }

      lastError = result.error || 'Unknown error';
    }

    // All nodes failed
    return NextResponse.json(
      { status: 'error', message: `Failed to delete. ${lastError}` },
      { status: 502 }
    );
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to delete' },
      { status: 500 }
    );
  }
}
