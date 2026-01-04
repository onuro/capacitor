import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    const nodeIp = searchParams.get('nodeIp');
    const appName = searchParams.get('appName');
    const component = searchParams.get('component') || 'wp';
    const folder = searchParams.get('folder') || '';

    if (!nodeIp || !appName) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required parameters (nodeIp, appName)' },
        { status: 400 }
      );
    }

    // Build Flux node URL - use direct HTTP like the file listing API
    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    let endpoint = `${baseUrl}/ioutils/fileupload/volume/${appName}/${component}`;
    if (folder) {
      // URL encode the folder so slashes aren't treated as path separators
      endpoint += `/${encodeURIComponent(folder)}`;
    }

    // Also build HTTPS fallback URL for retry
    const [ip, port = '16127'] = nodeIp.split(':');
    const dashedIp = ip.replace(/\./g, '-');
    const httpsEndpoint = `https://${dashedIp}-${port}.node.api.runonflux.io/ioutils/fileupload/volume/${appName}/${component}${folder ? `/${encodeURIComponent(folder)}` : ''}`;

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

    console.log('=== Binary File Upload Debug ===', new Date().toISOString());
    console.log('Uploading to (HTTP):', endpoint);
    console.log('Fallback (HTTPS):', httpsEndpoint);
    console.log('Content-Type:', contentType);
    console.log('Body size:', body.byteLength);

    // Try HTTP first (direct connection like file listing API)
    let response: Response;
    let responseText: string;
    let usedEndpoint = endpoint;

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'zelidauth': authHeader,
        },
        body: body,
        signal: AbortSignal.timeout(60000),
      });
      responseText = await response.text();
      console.log('HTTP upload response status:', response.status);
      console.log('HTTP upload response:', responseText.slice(0, 500));
    } catch (httpError) {
      console.log('HTTP upload failed, trying HTTPS fallback:', httpError instanceof Error ? httpError.message : httpError);
      usedEndpoint = httpsEndpoint;

      // Fallback to HTTPS via Flux DNS
      response = await fetch(httpsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'zelidauth': authHeader,
        },
        body: body,
        signal: AbortSignal.timeout(120000),
      });
      responseText = await response.text();
      console.log('HTTPS upload response status:', response.status);
      console.log('HTTPS upload response:', responseText.slice(0, 500));
    }

    console.log('Used endpoint:', usedEndpoint);

    if (response.ok) {
      // Check if response contains error
      if (responseText.includes('error') || responseText.includes('Error')) {
        console.log('Response contains error indication');
        return NextResponse.json({
          status: 'error',
          message: `Upload may have failed: ${responseText.slice(0, 300)}`,
        });
      }

      // Try to parse as JSON for error checking
      try {
        const data = JSON.parse(responseText);
        if (data.status === 'error') {
          return NextResponse.json({
            status: 'error',
            message: data.message || data.data?.message || 'Failed to upload file',
          });
        }
      } catch {
        // Non-JSON response - check if it looks like streaming progress
        console.log('Non-JSON response, treating as streaming progress');
      }

      // Verify file exists after upload using same baseUrl format
      try {
        const verifyEndpoint = `${baseUrl}/apps/getfolderinfo/${appName}/${component}/${encodeURIComponent(folder)}`;
        console.log('Verifying file at:', verifyEndpoint);

        const verifyResponse = await fetch(verifyEndpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            zelidauth: authHeader,
          },
          signal: AbortSignal.timeout(10000),
        });

        const verifyText = await verifyResponse.text();
        console.log('Verify response:', verifyText.slice(0, 500));

        if (verifyResponse.ok) {
          try {
            const verifyData = JSON.parse(verifyText);
            if (verifyData.status === 'success' && Array.isArray(verifyData.data)) {
              console.log('Files in folder:', verifyData.data.map((f: { name: string }) => f.name));
            }
          } catch {
            console.log('Could not parse verify response');
          }
        }
      } catch (verifyError) {
        console.warn('File verification failed:', verifyError);
      }

      return NextResponse.json({
        status: 'success',
        message: 'File uploaded successfully',
      });
    }

    return NextResponse.json({
      status: 'error',
      message: `Upload failed with status ${response.status}: ${responseText.slice(0, 200)}`,
    });
  } catch (error) {
    console.error('Error uploading binary file:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to upload file' },
      { status: 500 }
    );
  }
}
