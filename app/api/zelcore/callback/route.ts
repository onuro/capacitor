import { NextRequest, NextResponse } from 'next/server';

interface SignatureData {
  signature: string;
  address: string;
  timestamp: number;
}

// In-memory store for signatures (Global variable in dev server)
declare global {
  var zelcoreSignatures: Map<string, SignatureData> | undefined;
}

const signatureStore = global.zelcoreSignatures || new Map<string, SignatureData>();
global.zelcoreSignatures = signatureStore;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(req: NextRequest) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    let body: Record<string, unknown> = {};
    const contentType = req.headers.get('content-type') || '';
    console.log('[ZelCore Callback] Content-Type:', contentType);
    
    // Robust body parsing
    try {
      if (contentType.includes('application/json')) {
        body = await req.json();
      } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        body = Object.fromEntries(formData.entries());
      } else {
        // Fallback: try reading text
        const text = await req.text();
        // Try parsing as JSON first
        try {
          body = JSON.parse(text);
        } catch {
          // Try parsing as URLSearchParams (query string format)
          try {
            const params = new URLSearchParams(text);
            const entries = Object.fromEntries(params.entries());
            if (Object.keys(entries).length > 0) {
              body = entries;
            } else {
              // If empty, maybe it's just raw text? log it
              console.log('[ZelCore Callback] Unparsable body text:', text);
            }
          } catch (e) {
            console.log('[ZelCore Callback] Failed to parse body text:', e);
          }
        }
      }
    } catch (parseError) {
      console.error('[ZelCore Callback] Body parsing error:', parseError);
    }

    // Extract fields with multiple possible names
    // zelid: standard field
    // address: fallback
    // users_zelid: seen in some legacy implementations
    const signature = (body.signature || body.sig) as string | undefined;
    const address = (body.zelid || body.address || body.users_zelid) as string | undefined;

    const flowId = body.flowId as string | undefined;
    
    // If flowId is not in body, check query param (our custom id)
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || flowId;

    if (!id) {
      return NextResponse.json({ status: 'error', message: 'Missing ID' }, { status: 400, headers });
    }

    console.log(`[ZelCore Callback] Received signature for ID: ${id}`);
    console.log('[ZelCore Callback] Body keys:', Object.keys(body));
    console.log('[ZelCore Callback] Extracted data:', { 
      address: address ? (typeof address === 'string' ? address.substring(0, 10) + '...' : 'invalid-type') : 'missing',
      signature: signature ? 'present' : 'missing' 
    });
    
    // Validate essential data
    if (!address || !signature) {
       console.warn('[ZelCore Callback] Missing address or signature in payload');
    }

    // Store the result
    signatureStore.set(id, {
      signature: signature ?? '',
      address: address?.trim() ?? '',
      timestamp: Date.now()
    });

    // Clean up old entries (simple garbage collection)
    if (signatureStore.size > 100) {
      const now = Date.now();
      for (const [key, val] of signatureStore.entries()) {
        if (now - val.timestamp > 300000) { // 5 minutes
          signatureStore.delete(key);
        }
      }
    }

    return NextResponse.json({ status: 'success', message: 'Signature received' }, { status: 200, headers });
  } catch (error) {
    console.error('[ZelCore Callback] Error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500, headers });
  }
}
