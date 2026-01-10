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
 * Try to upload binary file to a single node
 */
async function tryNode(
  nodeIp: string,
  authHeader: string,
  appName: string,
  component: string,
  folder: string,
  contentType: string,
  body: ArrayBuffer
): Promise<TryNodeResult> {
  try {
    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    let endpoint = `/ioutils/fileupload/volume/${appName}/${component}`;
    if (folder) {
      endpoint += `/${encodeURIComponent(folder)}`;
    }
    const nodeUrl = baseUrl + endpoint;

    console.log(`[UploadBinary] Trying ${nodeIp}...`);

    const response = await fetch(nodeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'zelidauth': authHeader,
      },
      body: body,
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`[UploadBinary] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`);
      return { success: false, error: `Node ${nodeIp} returned ${response.status}` };
    }

    const responseText = await response.text();
    console.log(`[UploadBinary] ${nodeIp} response:`, responseText.slice(0, 200));

    // Check if response contains error indication
    if (responseText.includes('"status":"error"')) {
      try {
        const data = JSON.parse(responseText);
        const errorMessage = data.message || data.data?.message || 'Failed to upload file';
        console.log(`[UploadBinary] ${nodeIp} returned error: ${errorMessage}`);
        return { success: false, error: errorMessage };
      } catch {
        // Continue - might be false positive
      }
    }

    console.log(`[UploadBinary] SUCCESS from ${nodeIp}`);
    return {
      success: true,
      response: NextResponse.json({
        status: 'success',
        message: 'File uploaded successfully',
        nodeIp,
      }),
    };
  } catch (error) {
    console.log(`[UploadBinary] ${nodeIp} failed:`, error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

export async function POST(request: NextRequest) {
  const zelidauth = request.headers.get('zelidauth');

  if (!zelidauth) {
    return NextResponse.json(
      { status: 'error', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    // Get parameters from query string (to avoid parsing FormData body)
    const { searchParams } = new URL(request.url);
    const nodeIpParam = searchParams.get('nodeIp');
    const appName = searchParams.get('appName');
    const component = searchParams.get('component') || 'wp';
    const folder = searchParams.get('folder') || '';

    if (!nodeIpParam || !appName) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required parameters (nodeIp, appName)' },
        { status: 400 }
      );
    }

    // Parse node IPs (support comma-separated list for fallback)
    const nodeIps = nodeIpParam.split(',').map(ip => ip.trim()).filter(Boolean);

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

    // Get the raw body and content-type to pass through as-is
    const contentType = request.headers.get('content-type') || '';
    const body = await request.arrayBuffer();

    console.log(`[UploadBinary] Body size: ${body.byteLength}, Content-Type: ${contentType}`);

    // 1. Detect master node via HAProxy
    console.log(`[UploadBinary] Detecting master node for ${appName}...`);
    const masterIp = await detectMasterNode(appName);
    if (masterIp) {
      console.log(`[UploadBinary] Master node detected: ${masterIp}`);
    } else {
      console.log(`[UploadBinary] No master detected, using client-provided nodes`);
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
        console.log(`[UploadBinary] Master attempt ${attempt}/3 for ${masterNode}`);
        const result = await tryNode(masterNode, authHeader, appName, component, folder, contentType, body);

        if (result.success && result.response) {
          return result.response;
        }

        lastError = result.error || 'Unknown error';

        // Wait before retry (unless last attempt)
        if (attempt < 3) {
          console.log(`[UploadBinary] Retrying master in 2s...`);
          await sleep(2000);
        }
      }
      console.log(`[UploadBinary] Master exhausted after 3 attempts, trying fallback nodes...`);
    }

    // 4. Fall back to other nodes (one attempt each)
    const fallbackNodes = masterIp ? orderedNodes.slice(1) : orderedNodes;
    for (const nodeIp of fallbackNodes) {
      const result = await tryNode(nodeIp, authHeader, appName, component, folder, contentType, body);

      if (result.success && result.response) {
        return result.response;
      }

      lastError = result.error || 'Unknown error';
    }

    // All nodes failed
    return NextResponse.json(
      { status: 'error', message: `Failed to upload file. ${lastError}` },
      { status: 502 }
    );
  } catch (error) {
    console.error('Error uploading binary file:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to upload file' },
      { status: 500 }
    );
  }
}
