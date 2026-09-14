'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, AuthError, UserResponse } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';

type AuthUserState = {
  user: User | null;
  loading: boolean;
  error: AuthError | null;
};

const AuthUserContext = createContext<AuthUserState | null>(null);

// Mounted once at app/layout.tsx. Calls getUser() exactly once per full page
// load and shares the result with every consumer (Header, BottomNav, and
// each audited page's own entry-gating logic) via useAuthUser() below — the
// real fix for #146's lock-contention race. The race wasn't caused by
// multiple createClient() instances (that was tried and disproven — see
// utils/supabase/client.ts's own comment) but by every call site
// independently calling getUser()/getSession() concurrently on mount, each
// racing to acquire the same storage-keyed navigator lock. Deliberately no
// onAuthStateChange subscription and no polling here — matches every
// existing call site's own "one fetch per page load" behavior, not new
// reactivity. (app/mentor/page.tsx keeps its own separate
// onAuthStateChange subscription for live updates, by design — see that
// file's own comment.)
export function AuthUserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthUserState>({ user: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data, error }: UserResponse) => {
      if (cancelled) return;
      setState({ user: data.user, loading: false, error });
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <AuthUserContext.Provider value={state}>
      {children}
    </AuthUserContext.Provider>
  );
}

export function useAuthUser(): AuthUserState {
  const ctx = useContext(AuthUserContext);
  if (!ctx) {
    throw new Error('useAuthUser must be used within an AuthUserProvider');
  }
  return ctx;
}
