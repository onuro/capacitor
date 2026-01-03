import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Detect which Flux node is serving a given domain by checking the FDMSERVERID cookie.
 * This cookie is set by the Flux load balancer and contains the actual node IP:port.
 * Format: FDMSERVERID=IP:PORT|hash|hash
 */
export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get('domain');

  if (!domain) {
    return NextResponse.json(
      { status: 'error', message: 'Missing required parameter: domain' },
      { status: 400 }
    );
  }

  try {
    console.log(`[detect-node] Checking domain: ${domain}`);

    // Make a GET request (not HEAD) to get the FDMSERVERID cookie
    // HEAD requests might not return Set-Cookie headers from some servers
    const response = await fetch(`https://${domain}`, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Capacitor/1.0)',
      },
    });

    console.log(`[detect-node] Response status: ${response.status}`);

    // Parse Set-Cookie header for FDMSERVERID
    // Note: headers.get('set-cookie') only returns the first cookie
    // We need to use getSetCookie() or iterate through all headers
    const setCookie = response.headers.get('set-cookie');

    console.log(`[detect-node] Set-Cookie header: ${setCookie?.substring(0, 100)}...`);

    if (setCookie) {
      // FDMSERVERID format: IP:PORT|hash|hash
      const match = setCookie.match(/FDMSERVERID=([^|;\s]+)/);

      if (match && match[1]) {
        const nodeIp = match[1];
        console.log(`[detect-node] Detected node for ${domain}: ${nodeIp}`);

        return NextResponse.json({
          status: 'success',
          data: {
            nodeIp,
            domain,
          },
        });
      }
    }

    // No FDMSERVERID found - might be a direct connection or different load balancer
    console.log(`[detect-node] No FDMSERVERID found for ${domain}`);
    return NextResponse.json({
      status: 'success',
      data: {
        nodeIp: null,
        domain,
        message: 'No FDMSERVERID cookie found',
      },
    });
  } catch (error) {
    console.error(`[detect-node] Error for ${domain}:`, error);

    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to detect serving node',
    });
  }
}
