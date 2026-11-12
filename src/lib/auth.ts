/**
 * Authentication state. The session lives in an HttpOnly cookie; the client
 * only keeps the public user profile (also cached in IndexedDB so previously
 * synchronized trips stay readable offline).
 */
import { useSyncExternalStore } from 'react';
import type { AuthStatus, UserDto } from '../../shared/types';
import { ApiError, http, onUnauthorized } from './api';
import { idb } from './idb';
import { tripStore } from './store';

interface AuthState {
  status: 'loading' | 'ready';
  user: UserDto | null;
  setupRequired: boolean;
  setupEnabled: boolean;
  offline: boolean;
}

let state: AuthState = { status: 'loading', user: null, setupRequired: false, setupEnabled: false, offline: false };
const listeners = new Set<() => void>();
function set(p: Partial<AuthState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

export function useAuth() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const auth = {
  async init() {
    try {
      const s = await http.get<AuthStatus>('/auth/status');
      set({ status: 'ready', user: s.user, setupRequired: s.setupRequired, setupEnabled: s.setupEnabled, offline: false });
      if (s.user) await idb.put('meta', s.user, 'user');
      else await idb.delete('meta', 'user');
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        const cached = await idb.get<UserDto>('meta', 'user');
        set({ status: 'ready', user: cached ?? null, offline: true });
      } else {
        set({ status: 'ready', user: null });
      }
    }
  },
  async login(email: string, password: string) {
    const { user } = await http.post<{ user: UserDto }>('/auth/login', { email, password });
    await idb.put('meta', user, 'user');
    set({ user, offline: false, setupRequired: false });
  },
  async setup(input: { setupToken: string; email: string; displayName: string; password: string }) {
    const { user } = await http.post<{ user: UserDto }>('/auth/setup', input);
    await idb.put('meta', user, 'user');
    set({ user, setupRequired: false });
  },
  setUser(user: UserDto) {
    void idb.put('meta', user, 'user');
    set({ user });
  },
  async logout() {
    try {
      await http.post('/auth/logout');
    } catch {
      /* offline logout still clears local data */
    }
    await tripStore.clearLocal();
    set({ user: null });
  },
  async expire() {
    await tripStore.clearLocal();
    set({ user: null });
  },
};

onUnauthorized(() => {
  if (state.user) void auth.expire();
});
