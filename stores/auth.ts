'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getLoginPhrase, verifyLogin, buildZelidAuth, isZelidAuthValid } from '@/lib/api/auth';
import { AUTH_INVALIDATED_EVENT } from '@/lib/api/client';
import { toast } from 'sonner';

export type LoginType = 'metamask' | 'walletconnect' | 'ssp' | 'zelcore' | null;

interface AuthState {
  zelid: string | null;
  zelidauth: string | null;
  loginPhrase: string | null;
  signature: string | null;
  privilege: string;
  loginType: LoginType;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchLoginPhrase: () => Promise<string>;
  login: (
    zelid: string,
    signature: string,
    loginPhrase: string,
    loginType: LoginType
  ) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      zelid: null,
      zelidauth: null,
      loginPhrase: null,
      signature: null,
      privilege: 'none',
      loginType: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error, isLoading: false }),

      clearError: () => set({ error: null }),

      fetchLoginPhrase: async () => {
        set({ isLoading: true, error: null });
        try {
          const phrase = await getLoginPhrase();
          set({ loginPhrase: phrase, isLoading: false });
          return phrase;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to get login phrase';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      login: async (zelid, signature, loginPhrase, loginType) => {
        set({ isLoading: true, error: null });

        try {
          // Verify the login with the API
          const result = await verifyLogin(zelid, signature, loginPhrase);

          if (!result) {
            throw new Error('Login verification failed');
          }

          // Build zelidauth token
          const zelidauth = buildZelidAuth(zelid, signature, loginPhrase);

          set({
            zelid,
            zelidauth,
            loginPhrase,
            signature,
            loginType,
            privilege: result.privilage || 'user',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Store in localStorage for API client
          if (typeof window !== 'undefined') {
            localStorage.setItem('zelidauth', zelidauth);
            localStorage.setItem('zelid', zelid);
            localStorage.setItem('loginType', loginType || '');
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Login failed';
          set({
            error: message,
            isLoading: false,
            isAuthenticated: false,
          });
          throw error;
        }
      },

      logout: () => {
        set({
          zelid: null,
          zelidauth: null,
          loginPhrase: null,
          signature: null,
          privilege: 'none',
          loginType: null,
          isAuthenticated: false,
          error: null,
        });

        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('zelidauth');
          localStorage.removeItem('zelid');
          localStorage.removeItem('loginType');
        }
      },
    }),
    {
      name: 'capacitor-auth',
      partialize: (state) => ({
        zelid: state.zelid,
        zelidauth: state.zelidauth,
        loginPhrase: state.loginPhrase,
        signature: state.signature,
        privilege: state.privilege,
        loginType: state.loginType,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Check if stored session is expired on app load
        if (state?.zelidauth && state?.isAuthenticated) {
          if (!isZelidAuthValid(state.zelidauth)) {
            // Clear auth state on next tick (after hydration completes)
            setTimeout(() => {
              state.logout();
              toast.error('Session expired. Please reconnect your wallet.');
            }, 0);
          }
        }
      },
    }
  )
);

// Listen for auth invalidation events from API client
if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_INVALIDATED_EVENT, () => {
    useAuthStore.getState().logout();
  });
}
