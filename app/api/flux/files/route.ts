import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  // Support both single nodeIp and comma-separated nodeIps for fallback
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

  // Try each node until one succeeds
  let lastError = '';
  for (const nodeIp of nodeIps) {
    try {
      // Use port from location data if provided, otherwise default to 16127
      const hasPort = nodeIp.includes(':');
      const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

      // Build path: /apps/getfolderinfo/appname/component/folder
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
        signal: AbortSignal.timeout(10000), // Shorter timeout for fallback
      });

      // Check if response is OK
      if (!response.ok) {
        const text = await response.text();
        console.log(`[Files] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`);
        lastError = `Node ${nodeIp} returned ${response.status}`;
        continue; // Try next node
      }

      const responseText = await response.text();

      // Check for HTML response (error page)
      if (responseText.trim().startsWith('<')) {
        console.log(`[Files] ${nodeIp} returned HTML error page`);
        lastError = `Node ${nodeIp} returned error page`;
        continue; // Try next node
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.log(`[Files] ${nodeIp} returned invalid JSON`);
        lastError = `Node ${nodeIp} returned invalid JSON`;
        continue; // Try next node
      }

      if (data.status === 'success') {
        console.log(`[Files] SUCCESS from ${nodeIp}`);
        // Transform the response to match our interface
        const files: FileInfo[] = (data.data || []).map((file: FileInfo) => ({
          name: file.name,
          size: file.size || 0,
          isDirectory: file.isDirectory || false,
          modifiedAt: file.modifiedAt || '',
          permissions: file.isDirectory ? 'drwxr-xr-x' : '-rw-r--r--',
        }));

        return NextResponse.json({
          status: 'success',
          data: {
            path: folder || '/',
            files,
          },
          nodeIp,
        });
      }

      // Flux returned error
      const errorMessage = data.message || data.data?.message || 'Unknown error';
      console.log(`[Files] ${nodeIp} returned error: ${errorMessage}`);
      lastError = errorMessage;
      continue; // Try next node
    } catch (error) {
      console.log(`[Files] ${nodeIp} failed:`, error instanceof Error ? error.message : error);
      lastError = error instanceof Error ? error.message : 'Connection failed';
      continue; // Try next node
    }
  }

  // All nodes failed
  return NextResponse.json(
    { status: 'error', message: `Failed to load files. ${lastError}` },
    { status: 502 }
  );
}
