import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeIp = searchParams.get('nodeIp');
  const appName = searchParams.get('appName');
  const component = searchParams.get('component');
  const filePath = searchParams.get('filePath');
  const zelidauth = request.headers.get('zelidauth');

  if (!nodeIp || !appName || !component || !filePath) {
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

  try {
    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    // Build the download URL - Flux uses /apps/downloadfile/:appname/:component/:file
    // The file path must be URL encoded as a single parameter
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const endpoint = `/apps/downloadfile/${appName}/${component}/${encodeURIComponent(cleanPath)}`;
    const nodeUrl = baseUrl + endpoint;

    // Parse zelidauth and convert to JSON format for nodes
    const headers: Record<string, string> = {};
    const parts = zelidauth.split(':');
    if (parts.length >= 3) {
      const authObj = {
        zelid: parts[0],
        signature: parts[1],
        loginPhrase: parts.slice(2).join(':'),
      };
      headers['zelidauth'] = JSON.stringify(authObj);
    } else {
      headers['zelidauth'] = zelidauth;
    }

    console.log('=== File Download Debug ===', new Date().toISOString());
    console.log('Fetching from:', nodeUrl);

    const response = await fetch(nodeUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(60000),
    });

    // Check if response is JSON (error) or raw file content
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data.status === 'error') {
        return NextResponse.json({
          status: 'error',
          message: data.message || data.data?.message || 'Failed to download file',
        });
      }
      // If it's JSON success, return the data
      return NextResponse.json({
        status: 'success',
        data: data.data,
        contentType: 'application/json',
      });
    }

    // Return raw file content as text
    const content = await response.text();
    return NextResponse.json({
      status: 'success',
      data: content,
      contentType: contentType || 'text/plain',
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to download file' },
      { status: 500 }
    );
  }
}
