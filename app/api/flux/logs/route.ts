import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  // Support both single nodeIp and comma-separated nodeIps for fallback
  const nodeIpParam = searchParams.get('nodeIp') || searchParams.get('nodeIps');
  const appName = searchParams.get('appName');
  const lines = searchParams.get('lines') || '100';
  const zelidauth = request.headers.get('zelidauth');

  if (!nodeIpParam || !appName) {
    return NextResponse.json(
      { status: 'error', message: 'Missing nodeIp or appName parameter' },
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

  // Try each node until one succeeds
  let lastError = '';
  for (const nodeIp of nodeIps) {
    try {
      // Use port from location data if provided, otherwise default to 16127
      const hasPort = nodeIp.includes(':');
      const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;
      const nodeUrl = `${baseUrl}/apps/applogpolling/${appName}/${lines}`;

      console.log(`[Logs] Trying ${nodeIp}...`);

      const response = await fetch(nodeUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000), // Shorter timeout for fallback
      });

      // Check if response is OK and is JSON
      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) {
        const text = await response.text();
        console.log(`[Logs] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`);
        lastError = `Node ${nodeIp} returned ${response.status}`;
        continue; // Try next node
      }

      const data = await response.json();

      // Convert applogpolling format (logs array) to string format expected by frontend
      if (data.status === 'success' && Array.isArray(data.logs)) {
        console.log(`[Logs] SUCCESS from ${nodeIp}`);
        return NextResponse.json({
          status: 'success',
          data: data.logs.join('\n'),
          nodeIp,
        });
      }

      if (data.status === 'error') {
        console.log(`[Logs] ${nodeIp} returned error: ${data.message}`);
        lastError = data.message || 'Unknown error';
        continue; // Try next node
      }

      return NextResponse.json({ ...data, nodeIp });
    } catch (error) {
      console.log(`[Logs] ${nodeIp} failed:`, error instanceof Error ? error.message : error);
      lastError = error instanceof Error ? error.message : 'Connection failed';
      continue; // Try next node
    }
  }

  // All nodes failed
  return NextResponse.json(
    { status: 'error', message: `All nodes failed. Last error: ${lastError}` },
    { status: 502 }
  );
}
