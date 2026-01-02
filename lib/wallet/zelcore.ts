'use client';

// Zelcore Wallet types
declare global {
  interface Window {
    zelcore?: {
      sign?: (message: string) => Promise<string>;
      protocol?: (uri: string) => void;
    };
  }
}

const FLUX_STORAGE_URL = 'https://storage.runonflux.io/v1/public';
const ICON_URL = 'https%3A%2F%2Fraw.githubusercontent.com%2Frunonflux%2Fflux%2Fmaster%2FzelID.svg';

/**
 * Check if Zelcore is available
 * Note: For protocol links (desktop app), we don't need the extension injected.
 * We just need to be in a browser environment.
 */
export function isZelcoreAvailable(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Upload long message to Flux Storage
 */
async function uploadToFluxStorage(message: string): Promise<string> {
  const publicid = Math.floor(Math.random() * 999999999999999).toString();

  const response = await fetch(FLUX_STORAGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicid, public: message }),
  });

  if (!response.ok) {
    throw new Error('Failed to upload message to Flux Storage');
  }

  return `FLUX_URL=${FLUX_STORAGE_URL}/${publicid}`;
}

/**
 * Sign a message using Zelcore
 * For extension: returns signature directly
 * For desktop app: opens protocol and requires callback handling
 */
export async function signWithZelcore(
  message: string,
  zelid: string,
  callbackUrl?: string
): Promise<{ signature: string; address: string } | void> {
  console.log('[ZelCore] Starting sign request...');

  return new Promise(async (resolve, reject) => {
    try {
      let messageToSign = message;

      // Handle long messages - upload to Flux Storage if > 1800 chars
      if (message.length > 1800) {
        console.log('[ZelCore] Message too long, uploading to Flux Storage...');
        try {
          messageToSign = await uploadToFluxStorage(message);
          console.log('[ZelCore] Message uploaded to Flux Storage');
        } catch (error) {
          console.error('[ZelCore] Flux Storage upload failed:', error);
          reject(
            new Error(
              'Message too long for ZelCore and Flux Storage is unavailable'
            )
          );
          return;
        }
      }

      // Check for ZelCore extension with direct signing
      const hasExtension =
        window.zelcore && typeof window.zelcore.sign === 'function';

      if (hasExtension) {
        console.log('[ZelCore] Using Extension direct signing');
        try {
          const signature = await window.zelcore!.sign!(messageToSign);
          console.log('[ZelCore] Successfully signed with Extension');
          resolve({
            signature,
            address: zelid,
          });
        } catch (error) {
          console.error('[ZelCore] Extension signing failed:', error);
          reject(
            new Error(
              'ZelCore Extension signing failed: ' +
                (error instanceof Error ? error.message : String(error))
            )
          );
        }
        return;
      }

      // ZelCore External App - protocol with optional WebSocket callback or polling
      console.log('[ZelCore] Using External App protocol signing');

      // Generate a unique flow ID for polling if no callbackUrl provided
      // If callbackUrl is provided, assume it's a WebSocket URL as per original implementation
      // unless we want to override it.
      
      let finalCallbackUrl = callbackUrl;
      let isPolling = false;
      const flowId = Math.random().toString(36).substring(2, 15);

      if (!finalCallbackUrl && typeof window !== 'undefined') {
        // Use our own polling mechanism
        isPolling = true;
        // The callback URL that ZelCore will POST to
        finalCallbackUrl = `${window.location.origin}/api/zelcore/callback?id=${flowId}`;
        console.log('[ZelCore] Generated polling callback:', finalCallbackUrl);
      }

      // Set up WebSocket listener if callback URL provided AND it is a WS URL
      if (finalCallbackUrl && (finalCallbackUrl.startsWith('ws://') || finalCallbackUrl.startsWith('wss://'))) {
        try {
          const ws = new WebSocket(finalCallbackUrl);

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.signature && data.zelid) {
                console.log('[ZelCore] Received signature via WebSocket');
                ws.close();
                resolve({
                  signature: data.signature,
                  address: data.zelid,
                });
              }
            } catch (error) {
              console.error('[ZelCore] WebSocket message parse error:', error);
            }
          };

          ws.onerror = (error) => {
            console.error('[ZelCore] WebSocket error:', error);
            ws.close();
            reject(new Error('WebSocket connection failed'));
          };
        } catch (error) {
          console.error('[ZelCore] Failed to establish WebSocket:', error);
          reject(new Error('Failed to establish WebSocket connection'));
          return;
        }
      } else if (isPolling) {
        // Start polling logic
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch(`${window.location.origin}/api/zelcore/status?id=${flowId}`);
            const json = await res.json();
            
            if (json.status === 'success' && json.data) {
              clearInterval(pollInterval);
              console.log('[ZelCore] Received signature via polling');
              console.log('[ZelCore] Polling Response Data:', json.data); // Added logging
              resolve({
                signature: json.data.signature,
                address: json.data.address,
              });
            }
          } catch (err) {
            console.error('[ZelCore] Polling error:', err);
          }
        }, 2000); // Poll every 2 seconds

        // Stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          reject(new Error('Zelcore signing timed out after 5 minutes'));
        }, 300000);
      }

      // Launch ZelCore protocol
      const callbackParam = finalCallbackUrl
        ? `&callback=${encodeURIComponent(finalCallbackUrl)}`
        : '';
      const protocol = `zel:?action=sign&message=${encodeURIComponent(messageToSign)}&icon=${ICON_URL}${callbackParam}`;

      if (window.zelcore?.protocol) {
        window.zelcore.protocol(protocol);
      } else {
        // Fallback: use hidden link to trigger protocol
        const hiddenLink = document.createElement('a');
        hiddenLink.href = protocol;
        hiddenLink.style.display = 'none';
        document.body.appendChild(hiddenLink);
        hiddenLink.click();
        document.body.removeChild(hiddenLink);
      }

      console.log('[ZelCore] Protocol signing initiated');

      // If no callback and NOT polling, resolve immediately (caller handles response manually)
      if (!finalCallbackUrl && !isPolling) {
        resolve();
      }
    } catch (error) {
      console.error('[ZelCore] Sign error:', error);
      reject(error);
    }
  });
}
