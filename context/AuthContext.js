import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({
  session: null,
  loading: true,
  error: null,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data?.session || null);
        setLoading(false);
      }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });
    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  const signIn = async (email, password) => {
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    return { data, error };
  };

  const signUp = async (email, password) => {
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    return { data, error };
  };

  const signOut = async () => {
    setError(null);
    const { error } = await supabase.auth.signOut();
    if (error) setError(error.message);
    return { error };
  };

  const value = { session, loading, error, signIn, signUp, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);