'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';
import { authApi } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getStoredSession(): User | null {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) as User : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const handleUnauthorized = () => {
      if (!active) return;
      setUser(null);
      localStorage.removeItem('user');
    };
    window.addEventListener('invoiceapp:unauthorized', handleUnauthorized);

    const restoreSession = () => {
      let session: User;
      try {
        const stored = localStorage.getItem('user');
        if (!stored) {
          setIsLoading(false);
          return;
        }

        session = JSON.parse(stored) as User;
        if (!session.token || !['admin', 'user'].includes(session.role)) {
          localStorage.removeItem('user');
          setIsLoading(false);
          return;
        }

        setUser(session);
        setIsLoading(false);
      } catch {
        localStorage.removeItem('user');
        setUser(null);
        setIsLoading(false);
        return;
      }

      const sessionToken = session.token;
      void authApi.me().then((res) => {
        if (!active) return;
        const currentSession = getStoredSession();
        if (currentSession?.token !== sessionToken) return;

        const verifiedUser = { ...(res.data as Omit<User, 'token'>), token: sessionToken };
        setUser(verifiedUser);
        localStorage.setItem('user', JSON.stringify(verifiedUser));
      }).catch((error: unknown) => {
        if (!active) return;
        const currentSession = getStoredSession();
        if (currentSession?.token !== sessionToken) {
          if (!currentSession) setUser(null);
          return;
        }

        console.warn(
          'Session verification failed; keeping the cached session until a protected request can verify it.',
          error
        );
      });
    };

    restoreSession();
    return () => {
      active = false;
      window.removeEventListener('invoiceapp:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const userData = res.data as User;
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
