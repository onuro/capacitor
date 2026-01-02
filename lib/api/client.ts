import axios, { AxiosInstance, AxiosError } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.runonflux.io';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to convert colon-separated zelidauth to JSON format
function zelidauthToJson(zelidauth: string): string {
  const parts = zelidauth.split(':');
  if (parts.length >= 3) {
    return JSON.stringify({
      zelid: parts[0],
      signature: parts[1],
      loginPhrase: parts.slice(2).join(':'),
    });
  }
  return zelidauth;
}

// Request interceptor to add auth header
apiClient.interceptors.request.use(
  (config) => {
    // Add zelidauth header if available in localStorage
    // Convert to JSON format for direct API calls
    if (typeof window !== 'undefined') {
      const zelidauth = localStorage.getItem('zelidauth');
      if (zelidauth && config.headers) {
        config.headers['zelidauth'] = zelidauthToJson(zelidauth);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Custom event for auth invalidation (used by Zustand store)
export const AUTH_INVALIDATED_EVENT = 'auth:invalidated';

export function emitAuthInvalidated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT));
  }
}

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle specific error cases
    if (error.response?.status === 401) {
      // Clear auth on unauthorized
      if (typeof window !== 'undefined') {
        localStorage.removeItem('zelidauth');
        localStorage.removeItem('zelid');
        localStorage.removeItem('loginType');
        // Emit event for Zustand store to clear state
        emitAuthInvalidated();
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// Helper to create authenticated requests
export function createAuthenticatedClient(zelidauth: string): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'zelidauth': zelidauth,
    },
  });

  return client;
}
