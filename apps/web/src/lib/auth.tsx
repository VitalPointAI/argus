'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// User can be either a standard user (email) or HUMINT source (codename)
interface StandardUser {
  type: 'standard';
  id: string;
  email: string;
  name: string;
  isAdmin?: boolean;
  preferences?: Record<string, unknown>;
}

interface HumintUser {
  type: 'humint';
  id: string;
  codename: string;
  nearAccountId?: string;
}

type User = StandardUser | HumintUser;

interface AuthContextType {
  user: User | null;
  token: null; // DEPRECATED: Token is now in HttpOnly cookie. Use credentials: 'include' in fetch.
  loading: boolean;
  isHumint: boolean; // Helper to check if user is HUMINT source
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Get API base URL at runtime (not build time)
function getApiBase(): string {
  // Check env var first
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // In browser: use same origin in production (nginx proxies /api)
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return ''; // Empty = relative URL = same origin
  }
  // Dev fallback
  return 'http://localhost:3001';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check auth status on mount (cookie sent automatically)
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Try standard auth first
      const standardRes = await fetch(`${getApiBase()}/api/auth/me`, {
        credentials: 'include',
      });
      if (standardRes.ok) {
        const data = await standardRes.json();
        if (data.success && data.data) {
          setUser({ type: 'standard', ...data.data });
          setLoading(false);
          return;
        }
      }
      
      // Try HUMINT passkey auth
      const passkeyRes = await fetch(`${getApiBase()}/api/phantom/session`, {
        credentials: 'include',
      });
      if (passkeyRes.ok) {
        const data = await passkeyRes.json();
        if (data.authenticated && data.codename) {
          setUser({
            type: 'humint',
            id: data.codename, // Use codename as ID for display
            codename: data.codename,
            nearAccountId: data.nearAccountId,
          });
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Receive and store HttpOnly cookie
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.data.user);
        return { success: true };
      }
      return { success: false, error: data.error || 'Login failed' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Receive and store HttpOnly cookie
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.data.user);
        return { success: true };
      }
      return { success: false, error: data.error || 'Registration failed' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = async () => {
    try {
      // Logout from both auth systems
      await Promise.allSettled([
        fetch(`${getApiBase()}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        }),
        fetch(`${getApiBase()}/api/phantom/logout`, {
          method: 'POST',
          credentials: 'include',
        }),
      ]);
    } catch (error) {
      console.error('Logout failed:', error);
    }
    setUser(null);
  };

  const isHumint = user?.type === 'humint';

  return (
    <AuthContext.Provider value={{ user, token: null, loading, isHumint, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
