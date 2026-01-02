import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Test endpoint to diagnose exec issues
 * GET /api/flux/exec-test?nodeIp=x.x.x.x&appName=xxx
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeIp = searchParams.get('nodeIp');
  const appName = searchParams.get('appName');
  const zelidauth = request.headers.get('zelidauth');

  if (!nodeIp || !appName) {
    return NextResponse.json({
      status: 'error',
      message: 'Missing nodeIp or appName',
    });
  }

  if (!zelidauth) {
    return NextResponse.json({
      status: 'error',
      message: 'Missing zelidauth header',
    });
  }

  // Parse auth
  const params = new URLSearchParams(zelidauth);
  const zelid = params.get('zelid');
  const signature = params.get('signature');
  const loginPhrase = params.get('loginPhrase');

  const authHeader = zelid && signature && loginPhrase
    ? JSON.stringify({ zelid, signature, loginPhrase })
    : zelidauth;

  // Build URLs
  const [host, port = '16127'] = nodeIp.split(':');
  const dashedHost = host.replace(/\./g, '-');
  const httpsProxyUrl = `https://${dashedHost}-${port}.node.api.runonflux.io`;
  const httpDirectUrl = `http://${nodeIp.includes(':') ? nodeIp : `${nodeIp}:16127`}`;

  const results: Record<string, unknown> = {
    nodeIp,
    appName,
    zelid,
    httpsProxyUrl,
    httpDirectUrl,
    tests: {},
  };

  // Test 1: Can we reach the node at all? (simple GET request)
  try {
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 10000);

    const resp1 = await fetch(`${httpsProxyUrl}/flux/info`, {
      signal: controller1.signal,
    });
    clearTimeout(timeout1);

    const data1 = await resp1.json();
    results.tests = {
      ...results.tests as object,
      nodeReachable: {
        success: true,
        status: resp1.status,
        fluxVersion: data1?.data?.flux?.version,
      },
    };
  } catch (e) {
    results.tests = {
      ...results.tests as object,
      nodeReachable: {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      },
    };
  }

  // Test 2: Can we get app logs? (authenticated GET)
  try {
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 15000);

    const resp2 = await fetch(`${httpsProxyUrl}/apps/applog/wp_${appName}/10`, {
      headers: { zelidauth: authHeader },
      signal: controller2.signal,
    });
    clearTimeout(timeout2);

    const data2 = await resp2.json();
    results.tests = {
      ...results.tests as object,
      appLogs: {
        success: data2.status === 'success',
        status: resp2.status,
        responseStatus: data2.status,
        message: data2.message,
        hasData: !!data2.data,
      },
    };
  } catch (e) {
    results.tests = {
      ...results.tests as object,
      appLogs: {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      },
    };
  }

  // Test 3: Try appexec with simple echo command
  try {
    const controller3 = new AbortController();
    const timeout3 = setTimeout(() => controller3.abort(), 30000);

    const execBody = {
      appname: `wp_${appName}`,
      cmd: ['echo', 'test'],
    };

    console.log('Test 3 - appexec with echo:', JSON.stringify(execBody));

    const resp3 = await fetch(`${httpsProxyUrl}/apps/appexec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        zelidauth: authHeader,
      },
      body: JSON.stringify(execBody),
      signal: controller3.signal,
    });
    clearTimeout(timeout3);

    const text3 = await resp3.text();
    console.log('Test 3 response:', text3.slice(0, 500));

    let data3;
    try {
      data3 = JSON.parse(text3);
    } catch {
      data3 = { raw: text3.slice(0, 200) };
    }

    results.tests = {
      ...results.tests as object,
      execEcho: {
        success: true,
        status: resp3.status,
        response: data3,
      },
    };
  } catch (e) {
    results.tests = {
      ...results.tests as object,
      execEcho: {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
        isTimeout: e instanceof Error && (e.message.includes('abort') || e.name === 'AbortError'),
      },
    };
  }

  return NextResponse.json(results);
}
