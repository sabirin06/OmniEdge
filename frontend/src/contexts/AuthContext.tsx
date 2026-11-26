import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser } from '../types';
import type { ProfileSettings } from '../api/auth';
import { useTheme } from '../hooks/useTheme';
import { clearSupportWorkspace, currentSupportWorkspace } from '../api/supportWorkspace';
import { platformApi } from '../api/platform';
import { authApi } from '../api/auth';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, otp?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (data: ProfileSettings) => Promise<void>;
  leaveSupport: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useTheme(user?.theme);

  const refresh = useCallback(async () => {
    try {
      const { data } = await authApi.me();
      setUser(data);
    } catch {
      if (currentSupportWorkspace()) {
        clearSupportWorkspace();
        window.location.replace('/users');
        return;
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (email: string, password: string, otp?: string) => {
    const { data: { csrfToken } } = await authApi.getCsrf();
    const { data } = await authApi.login({ email: email.trim(), password, otp }, csrfToken);
    setUser(data.user);
  };

  const updateProfile = async (profile: ProfileSettings) => {
    const { data } = await authApi.updateProfile(profile);
    setUser(data);
  };

  const leaveSupport = async () => {
    try { await platformApi.endSupport(); }
    finally {
      clearSupportWorkspace();
      window.location.replace('/users');
    }
  };

  const logout = async () => {
    if (currentSupportWorkspace()) {
      await leaveSupport();
      return;
    }
    try { await authApi.logout(); } catch { /* ignore */ }
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, updateProfile, leaveSupport }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

export const useAuth = useAuthContext;
