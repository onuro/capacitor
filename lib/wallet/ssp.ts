'use client';

// SSP Wallet types
declare global {
  interface Window {
    ssp?: {
      request: (
        method: string,
        params: Record<string, unknown>
      ) => Promise<{
        status: 'SUCCESS' | 'ERROR';
        data?: string;
        result?: string;
        signature?: string;
        address?: string;
      }>;
    };
  }
}

/**
 * Check if SSP wallet is available
 */
export function isSSPAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.ssp;
}

/**
 * Sign a message using SSP wallet
 */
export async function signWithSSP(
  message: string
): Promise<{ signature: string; address: string }> {
  console.log('[SSP] Starting sign request...');

  if (!isSSPAvailable()) {
    throw new Error('SSP Wallet not installed');
  }

  try {
    const response = await window.ssp!.request('sspwid_sign_message', {
      message,
    });

    if (response.status === 'ERROR') {
      throw new Error(response.data || response.result || 'SSP signing failed');
    }

    if (!response.signature || !response.address) {
      throw new Error('Invalid SSP response');
    }

    console.log('[SSP] Successfully signed message');

    return {
      signature: response.signature,
      address: response.address,
    };
  } catch (error) {
    console.error('[SSP] Sign error:', error);
    throw error;
  }
}
