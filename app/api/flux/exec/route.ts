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
    const { nodeIp, appName, component, cmd, env } = body;

    // Validate required fields
    if (!nodeIp || !appName || !cmd) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required parameters: nodeIp, appName, cmd' },
        { status: 400 }
      );
    }

    if (!Array.isArray(cmd)) {
      return NextResponse.json(
        { status: 'error', message: 'cmd must be an array of strings' },
        { status: 400 }
      );
    }

    // Build node URL using HTTPS DNS proxy format (required for external access)
    // Format: https://{dashed-ip}-{port}.node.api.runonflux.io
    const [host, port = '16127'] = nodeIp.split(':');
    const dashedHost = host.replace(/\./g, '-');
    const nodeUrl = `https://${dashedHost}-${port}.node.api.runonflux.io/apps/appexec`;

    // Parse zelidauth and convert to JSON format for nodes
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

    // Build appname: for compose apps, use component_appName format
    const targetAppName = component ? `${component}_${appName}` : appName;

    // Build request body for appexec
    const execBody: Record<string, unknown> = {
      appname: targetAppName,
      cmd: cmd,
    };
    if (env && Array.isArray(env)) {
      execBody.env = env;
    }

    console.log('=== Exec Debug ===', new Date().toISOString());
    console.log('App:', appName, 'Component:', component, 'Target:', targetAppName);
    console.log('Command:', JSON.stringify(cmd));
    console.log('Node URL:', nodeUrl);
    console.log('Auth zelid:', zelid);
    console.log('Auth header:', headers['zelidauth']?.slice(0, 100) + '...');
    console.log('Request body:', JSON.stringify(execBody));

    // Use AbortController for better timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('Request timed out after 120s');
      controller.abort();
    }, 120000);

    const response = await fetch(nodeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(execBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    console.log('Response status:', response.status, response.statusText);

    const responseText = await response.text();
    console.log('Raw response length:', responseText.length);
    console.log('Raw response preview:', responseText.slice(0, 1000));

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // If not valid JSON, return the raw text as the result
      // This is common for WP-CLI output (streamed output from docker exec)
      if (responseText.trim()) {
        return NextResponse.json({
          status: 'success',
          data: responseText,
          rawOutput: true,
        });
      }
      // Empty response might indicate an issue
      return NextResponse.json({
        status: 'error',
        message: 'Empty response from node',
      });
    }

    // Check for error status in Flux response
    if (data.status === 'error') {
      console.log('Flux error:', data);
      return NextResponse.json(data);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error executing command:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute command';
    const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');
    return NextResponse.json(
      {
        status: 'error',
        message: isTimeout ? 'Request timed out - node may be unreachable or command took too long' : errorMessage,
      },
      { status: 500 }
    );
  }
}
