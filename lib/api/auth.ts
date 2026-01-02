import apiClient from './client';

export interface LoginPhraseResponse {
  status: 'success' | 'error';
  data?: string;
}

export interface VerifyLoginResponse {
  status: 'success' | 'error';
  data?: {
    message: string;
    zelid: string;
    loginPhrase: string;
    signature: string;
    privilage?: string;
  };
}

export interface PrivilegeResponse {
  status: 'success' | 'error';
  data?: string;
}

/**
 * Get login phrase from the API
 */
export async function getLoginPhrase(): Promise<string> {
  const response = await apiClient.get<LoginPhraseResponse>('/id/loginphrase');

  if (response.data.status === 'success' && response.data.data) {
    return response.data.data;
  }

  throw new Error('Failed to get login phrase');
}

/**
 * Verify login with zelid, signature, and login phrase
 */
export async function verifyLogin(
  zelid: string,
  signature: string,
  loginPhrase: string
): Promise<VerifyLoginResponse['data']> {
  const params = new URLSearchParams();
  params.append('zelid', zelid);
  params.append('signature', signature);
  params.append('loginPhrase', loginPhrase);

  const response = await apiClient.post<VerifyLoginResponse>(
    '/id/verifylogin',
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (response.data.status === 'success' && response.data.data) {
    return response.data.data;
  }

  throw new Error(response.data.data?.message || 'Login verification failed');
}

/**
 * Check user privilege
 */
export async function checkPrivilege(
  zelid: string,
  signature: string,
  loginPhrase: string
): Promise<string> {
  const params = new URLSearchParams();
  params.append('zelid', zelid);
  params.append('signature', signature);
  params.append('loginPhrase', loginPhrase);

  const response = await apiClient.post<PrivilegeResponse>(
    '/id/checkprivilege',
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (response.data.status === 'success' && response.data.data) {
    return response.data.data;
  }

  return 'none';
}

/**
 * Logout current session
 */
export async function logoutSession(zelidauth: string): Promise<void> {
  await apiClient.get('/id/logoutcurrentsession', {
    headers: { zelidauth },
  });
}

/**
 * Build zelidauth string from components
 * Format: query string (zelid=xxx&signature=yyy&loginPhrase=zzz)
 * This matches the official FluxOS frontend format
 */
export function buildZelidAuth(
  zelid: string,
  signature: string,
  loginPhrase: string
): string {
  const params = new URLSearchParams();
  params.set('zelid', zelid);
  params.set('signature', signature);
  params.set('loginPhrase', loginPhrase);
  return params.toString();
}

/**
 * Parse zelidauth query string into components
 */
export function parseZelidAuth(zelidauth: string): {
  zelid: string;
  signature: string;
  loginPhrase: string;
} | null {
  try {
    const params = new URLSearchParams(zelidauth);
    const zelid = params.get('zelid');
    const signature = params.get('signature');
    const loginPhrase = params.get('loginPhrase');

    if (!zelid || !signature || !loginPhrase) return null;

    return { zelid, signature, loginPhrase };
  } catch {
    return null;
  }
}

/**
 * Check if zelidauth session is still valid (not expired)
 * LoginPhrase has a 1.5 hour TTL - the first 13 characters are a timestamp
 * Global operations require a valid (non-expired) session
 */
export function isZelidAuthValid(zelidauth: string): boolean {
  const parsed = parseZelidAuth(zelidauth);
  if (!parsed) return false;

  const { loginPhrase } = parsed;

  // First 13 characters of loginPhrase are the timestamp
  const timestamp = parseInt(loginPhrase.substring(0, 13), 10);
  if (isNaN(timestamp) || timestamp <= 0) return false;

  const maxAge = 1.5 * 60 * 60 * 1000; // 1.5 hours in milliseconds
  const expiryTime = timestamp + maxAge;

  return Date.now() < expiryTime;
}

/**
 * Get time remaining until zelidauth expires (in milliseconds)
 * Returns 0 if already expired or invalid
 */
export function getZelidAuthTimeRemaining(zelidauth: string): number {
  const parsed = parseZelidAuth(zelidauth);
  if (!parsed) return 0;

  const { loginPhrase } = parsed;
  const timestamp = parseInt(loginPhrase.substring(0, 13), 10);
  if (isNaN(timestamp) || timestamp <= 0) return 0;

  const maxAge = 1.5 * 60 * 60 * 1000;
  const expiryTime = timestamp + maxAge;
  const remaining = expiryTime - Date.now();

  return Math.max(0, remaining);
}
