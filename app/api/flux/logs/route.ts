import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeIp = searchParams.get('nodeIp');
  const appName = searchParams.get('appName');
  const lines = searchParams.get('lines') || '100';
  const zelidauth = request.headers.get('zelidauth');

  if (!nodeIp || !appName) {
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

  try {
    const hasPort = nodeIp.includes(':');
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;
    // Use applogpolling endpoint which returns logs as an array
    const nodeUrl = `${baseUrl}/apps/applogpolling/${appName}/${lines}`;

    // Parse zelidauth and convert to JSON format for nodes
    // Supports both query string format (zelid=xxx&...) and colon format (zelid:sig:phrase)
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

    console.log('=== Logs Debug ===', new Date().toISOString());
    console.log('Fetching logs from:', nodeUrl);

    const response = await fetch(nodeUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();
    console.log('Logs response status:', data.status);

    // Convert applogpolling format (logs array) to string format expected by frontend
    // Response structure: { status, logs: [...], logCount, lineCount, ... }
    if (data.status === 'success' && Array.isArray(data.logs)) {
      return NextResponse.json({
        status: 'success',
        data: data.logs.join('\n'),
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
