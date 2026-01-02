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
    const body = await request.json();
    const { nodeIp, appName, component, filePath, content } = body;

    if (!nodeIp || !appName || !component || !filePath || content === undefined) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    // Flux uses POST /ioutils/fileupload/volume/:appname/:component/:folder
    // The folder is the directory path (URL encoded), filename goes in FormData
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const pathParts = cleanPath.split('/');
    const fileName = pathParts.pop() || cleanPath; // Get the filename
    const folder = pathParts.join('/'); // Get the directory path

    let endpoint = `/ioutils/fileupload/volume/${appName}/${component}`;
    if (folder) {
      endpoint += `/${encodeURIComponent(folder)}`;
    }
    const nodeUrl = baseUrl + endpoint;

    // Parse zelidauth and convert to JSON format for nodes
    const parts = zelidauth.split(':');
    let authHeader: string;
    if (parts.length >= 3) {
      const authObj = {
        zelid: parts[0],
        signature: parts[1],
        loginPhrase: parts.slice(2).join(':'),
      };
      authHeader = JSON.stringify(authObj);
    } else {
      authHeader = zelidauth;
    }

    // Create form data with the file content
    // The key is the filename (as Flux expects)
    const formData = new FormData();
    const blob = new Blob([content], { type: 'text/plain' });
    formData.append(fileName, blob);

    console.log('=== File Upload Debug ===', new Date().toISOString());
    console.log('Uploading to:', nodeUrl);
    console.log('Folder:', folder);
    console.log('Filename:', fileName);

    const response = await fetch(nodeUrl, {
      method: 'POST',
      headers: {
        'zelidauth': authHeader,
      },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    const responseText = await response.text();
    console.log('Upload response status:', response.status);
    console.log('Upload response:', responseText.slice(0, 500));

    // Flux upload uses streaming response (progress updates)
    // A 2xx status means the upload was successful
    if (response.ok) {
      // Try to parse as JSON for error checking
      try {
        const data = JSON.parse(responseText);
        if (data.status === 'error') {
          return NextResponse.json({
            status: 'error',
            message: data.message || data.data?.message || 'Failed to save file',
          });
        }
      } catch {
        // Non-JSON response with 2xx status is success (streaming progress data)
      }

      return NextResponse.json({
        status: 'success',
        message: 'File saved successfully',
      });
    }

    // Non-2xx status is an error
    return NextResponse.json({
      status: 'error',
      message: `Upload failed with status ${response.status}`,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to save file' },
      { status: 500 }
    );
  }
}
