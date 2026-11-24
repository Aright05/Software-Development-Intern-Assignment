import { useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { api } from '../services/api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const currentUser = await api.auth.getMe();
      setUser(currentUser);
    } catch (err: any) {
      setUser(null);
      setError(err?.message || 'Not authenticated');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const loginWithGoogle = () => {
    window.location.href = api.auth.getGoogleAuthUrl();
  };

  const logout = async () => {
    try {
      await api.auth.logout();
      setUser(null);
    } catch (err: any) {
      console.error('Logout error:', err);
    }
  };

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    loginWithGoogle,
    logout,
    refreshUser: fetchUser,
  };
}
