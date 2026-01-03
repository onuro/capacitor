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
    // Extract just the IP and use Flux DNS format for reliable connectivity
    const ip = nodeIp.split(':')[0];
    const dashedIp = ip.replace(/\./g, '-');
    const baseUrl = `https://${dashedIp}-16127.node.api.runonflux.io`;

    // Build the download URL - Flux uses /apps/downloadfile/:appname/:component/:file
    // The file path must be URL encoded as a single parameter
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const endpoint = `/apps/downloadfile/${appName}/${component}/${encodeURIComponent(cleanPath)}`;
    const nodeUrl = baseUrl + endpoint;

    // Parse zelidauth and convert to JSON format for nodes
    // Supports both query string format (zelid=xxx&...) and colon format (zelid:sig:phrase)
    const headers: Record<string, string> = {};

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
      // Check if this is a Flux API response (has status field) or raw JSON file content
      if (data.status === 'error') {
        return NextResponse.json({
          status: 'error',
          message: data.message || data.data?.message || 'Failed to download file',
        });
      }
      // If it's a Flux API success response, return data.data
      // Otherwise it's a raw JSON file - stringify it back
      const isFluxResponse = typeof data.status === 'string' && 'data' in data;
      return NextResponse.json({
        status: 'success',
        data: isFluxResponse ? data.data : JSON.stringify(data, null, 2),
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
