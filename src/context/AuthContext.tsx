import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, CURRENT_TERMS_VERSION } from '../lib/supabase';
import type { Band, Profile } from '../lib/db';

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  band: Band | null;            // the artist's own band page (if any)
  adminBands: AdminBand[];      // band pages this person helps manage as an admin
  termsAccepted: boolean;
  musicRights: boolean;          // agreed they own/may share the music they upload
  isModerator: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export interface AdminBand { id: string; name: string; handle: string; logo_url: string | null }

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [band, setBand] = useState<Band | null>(null);
  const [adminBands, setAdminBands] = useState<AdminBand[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [musicRights, setMusicRights] = useState(false);
  const [isModerator, setIsModerator] = useState(false);

  const loadSeq = useRef(0); // ignore results from an older load (e.g. one still running when the user signs out)
  const load = useCallback(async (s: Session | null) => {
    const seq = ++loadSeq.current;
    if (!s?.user) {
      setProfile(null); setBand(null); setAdminBands([]); setTermsAccepted(false); setMusicRights(false); setIsModerator(false);
      return;
    }
    const uid = s.user.id;
    // The profile row is created by a database trigger right after sign-up; retry briefly.
    let p: Profile | null = null;
    for (let i = 0; i < 4 && !p; i++) {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      p = (data as Profile) || null;
      if (!p) await new Promise((r) => setTimeout(r, 400));
    }
    const [{ data: b }, { data: t }, { data: m }, { data: ab }] = await Promise.all([
      supabase.from('bands').select('*, band_genres(genre_id, genres(name))').eq('owner_id', uid).maybeSingle(),
      supabase.from('terms_acceptances').select('version, accepted_music_rights').eq('user_id', uid).eq('version', CURRENT_TERMS_VERSION).maybeSingle(),
      supabase.from('moderators').select('user_id').eq('user_id', uid).maybeSingle(),
      supabase.from('band_members').select('bands(id, name, handle, logo_url)').eq('profile_id', uid).eq('is_admin', true),
    ]);
    if (seq !== loadSeq.current) return;
    supabase.rpc('touch_seen').then(() => {}, () => {}); // "active today" statistics
    setProfile(p);
    setBand((b as Band) || null);
    setAdminBands((((ab as any[]) || []).map((x) => x.bands).filter((x: AdminBand | null) => x && x.id !== (b as Band | null)?.id)) as AdminBand[]);
    setTermsAccepted(!!t);
    setMusicRights(!!(t as any)?.accepted_music_rights);
    setIsModerator(!!m);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await load(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // defer to avoid calling Supabase inside the auth callback
        setTimeout(() => { load(s); }, 0);
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [load]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await load(data.session);
  }, [load]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    await load(null);
  }, [load]);

  return (
    <AuthContext.Provider
      value={{ loading, session, user: session?.user ?? null, profile, band, adminBands, termsAccepted, musicRights, isModerator, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
