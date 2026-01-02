import { NextRequest, NextResponse } from 'next/server';

interface SignatureData {
  signature: string;
  address: string;
  timestamp: number;
}

// We need to access the SAME store.
// In Next.js dev mode, creating a separate file for store might be better to ensure singleton?
// But `global` object is safer for hot reload.

declare global {
  var zelcoreSignatures: Map<string, SignatureData> | undefined;
}

const signatureStore = global.zelcoreSignatures || new Map<string, SignatureData>();
if (process.env.NODE_ENV !== 'production') global.zelcoreSignatures = signatureStore;

// Sync with the callback route logic (re-implementing store access here as they might run in different contexts in some setups, 
// but in standard Next.js Node server they share memory if global is used)
// Actually, let's update callback/route.ts to use the global store too to be safe.

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ status: 'error', message: 'Missing ID' }, { status: 400 });
  }

  const data = signatureStore.get(id);

  if (data) {
    // Return data and optionally clear it? 
    // Maybe keep it for a bit in case of retries, but normally once fetched it's done.
    // Let's keep it for now, the cleanup logic in POST handles it.
    return NextResponse.json({ status: 'success', data });
  }

  return NextResponse.json({ status: 'pending' });
}
