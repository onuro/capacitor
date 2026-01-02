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
  const nodeIp = searchParams.get('nodeIp');
  const appName = searchParams.get('appName');
  const component = searchParams.get('component');
  const folder = searchParams.get('folder') || '';
  const zelidauth = request.headers.get('zelidauth');

  if (!nodeIp || !appName || !component) {
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

  try {
    // Build the URL - folder path goes as URL segment, not encoded
    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort
      ? `http://${nodeIp}`
      : `http://${nodeIp}:16127`;

    // Build path: /apps/getfolderinfo/appname/component/folder
    // Folder must be URL-encoded as a single parameter (like download endpoint)
    let endpoint = `/apps/getfolderinfo/${appName}/${component}`;
    if (folder && folder !== '/') {
      // Remove leading slash if present and URL-encode the path
      const cleanFolder = folder.startsWith('/') ? folder.slice(1) : folder;
      endpoint += `/${encodeURIComponent(cleanFolder)}`;
    }

    const nodeUrl = baseUrl + endpoint;

    // Parse zelidauth and convert to JSON format for nodes
    // Supports both query string format (zelid=xxx&...) and colon format (zelid:sig:phrase)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Try query string format first
    const params = new URLSearchParams(zelidauth);
    let zelid = params.get('zelid');
    let signature = params.get('signature');
    let loginPhrase = params.get('loginPhrase');

    // Fallback to colon-separated format
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

    console.log('=== Files Debug ===', new Date().toISOString());
    console.log('Params - nodeIp:', nodeIp, 'appName:', appName, 'component:', component, 'folder:', folder);
    console.log('Fetching from:', nodeUrl);

    const response = await fetch(nodeUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    const responseText = await response.text();
    console.log('Raw response:', responseText.slice(0, 1000));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse JSON response');
      return NextResponse.json({
        status: 'error',
        message: 'Invalid response from Flux node',
      });
    }

    console.log('Response status:', data.status);
    console.log('Response message:', data.message);
    console.log('Response data keys:', data.data ? Object.keys(data.data) : 'no data');

    if (data.status === 'success') {
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

    // Return error with the actual message from Flux
    // Error can be in data.message or data.data.message
    const errorMessage = data.message || data.data?.message || 'Failed to list files';
    console.log('Flux API error:', errorMessage);
    return NextResponse.json({
      status: 'error',
      message: errorMessage,
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to fetch files' },
      { status: 500 }
    );
  }
}
