import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    const { nodeIp, appName, component, filePath } = body;

    if (!nodeIp || !appName || !component || !filePath) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Extract IP and port, use Flux DNS format for reliable connectivity
    const [ip, port = '16127'] = nodeIp.split(':');
    const dashedIp = ip.replace(/\./g, '-');
    const baseUrl = `https://${dashedIp}-${port}.node.api.runonflux.io`;

    // Flux uses GET /apps/removeobject/:appname/:component/:filepath
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const encodedPath = encodeURIComponent(cleanPath);
    const endpoint = `/apps/removeobject/${appName}/${component}/${encodedPath}`;
    const nodeUrl = baseUrl + endpoint;

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

    console.log('=== File Delete Debug ===', new Date().toISOString());
    console.log('Deleting:', nodeUrl);
    console.log('Path:', cleanPath);

    const response = await fetch(nodeUrl, {
      method: 'GET',
      headers: {
        'zelidauth': authHeader,
      },
      signal: AbortSignal.timeout(60000),
    });

    const responseText = await response.text();
    console.log('Delete response status:', response.status);
    console.log('Delete response:', responseText.slice(0, 500));

    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        if (data.status === 'error') {
          return NextResponse.json({
            status: 'error',
            message: data.message || data.data?.message || 'Failed to delete',
          });
        }
        return NextResponse.json({
          status: 'success',
          message: data.message || 'Deleted successfully',
        });
      } catch {
        // Non-JSON response with 2xx status is success
        return NextResponse.json({
          status: 'success',
          message: 'Deleted successfully',
        });
      }
    }

    return NextResponse.json({
      status: 'error',
      message: `Delete failed with status ${response.status}`,
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to delete' },
      { status: 500 }
    );
  }
}
