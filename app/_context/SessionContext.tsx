import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { showError } from '../../lib/showError';

type SessionContextType = {
  session: Session | null;
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextType>({
  session: null,
  isLoading: true,
});

export function SessionContextProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const ensureUserRow = async (currentSession: Session) => {
    const user = currentSession.user;
    const phone = (user as { phone?: string }).phone || user.user_metadata?.phone || '';

    const { error } = await supabase.rpc('ensure_user_exists', {
      p_phone: phone,
    });

    if (error) {
      // Without a public.users row, RLS hides the user's own people/events —
      // everything downstream would fail silently. Surface it.
      console.error('Failed to ensure user row:', error);
      showError('Account setup failed', error);
    }
  };

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        setSession(session);
        if (session?.user) {
          await ensureUserRow(session);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        // Without this, a failed getSession (e.g. the Web Locks acquire
        // timeout in a busy multi-tab browser) strands the app on the boot
        // spinner forever. Fall through to the sign-in screen instead.
        console.error('Failed to restore session:', err);
        setIsLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await ensureUserRow(session);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export default SessionContextProvider;
