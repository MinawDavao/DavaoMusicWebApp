import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Gift, IdCard, LayoutGrid, LogIn, Music, Settings, Trophy } from 'lucide-react';
import type { Route } from '../nav';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';
import { ClubContext, H, HOOP_MAIN_ADMIN_ID, MEMBER_COLS, hbtn, themeVars, type ClubCtx, type HoopClub, type HoopMember } from './lib';
import { HoopClubs } from './HoopClubs';
import { HoopGames } from './HoopGames';
import { HoopGameScreen } from './HoopGame';
import { HoopPlayerScreen, HoopPlayers, MyClubCard } from './HoopPlayer';
import { HoopManage } from './HoopManage';
import { HoopCardDesigns } from './HoopCardDesigns';
import { HoopPacks, usePackDot } from './HoopPacks';
import { NotificationBell } from '../components/Notifications';

/** Basketball outline icon (header button). */
export const BallIcon: React.FC<{ className?: string }> = ({ className = 'w-[18px] h-[18px]' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.5 12h19" />
    <path d="M12 2.5v19" />
    <path d="M5.3 5.3c2.4 1.6 3.9 4 3.9 6.7s-1.5 5.1-3.9 6.7" />
    <path d="M18.7 5.3c-2.4 1.6-3.9 4-3.9 6.7s1.5 5.1 3.9 6.7" />
  </svg>
);

export const isHoopRoute = (r: Route) => r.name === 'hoop' || r.name === 'hoopDesigns' || r.name === 'hoopClub' || r.name === 'hoopGame' || r.name === 'hoopPlayer';

/** Which club a screen belongs to (and, for a player card, which card). */
function useResolve(route: Route, userId: string | undefined) {
  const [res, setRes] = useState<{ key: string; club: string | null; member?: string | null } | null>(null);
  const key = JSON.stringify(route) + (userId || '');
  useEffect(() => {
    let alive = true;
    const done = (club: string | null, member?: string | null) => { if (alive) setRes({ key, club, member }); };
    (async () => {
      if (route.name === 'hoopClub') return done(route.club);
      if (route.name === 'hoopGame') {
        const { data } = await supabase.from('hoop_games').select('club_id').eq('id', route.id).maybeSingle();
        return done((data as any)?.club_id ?? null);
      }
      if (route.name === 'hoopPlayer') {
        if (route.id) {
          const { data } = await supabase.from('hoop_members').select('id, club_id').eq('id', route.id).maybeSingle();
          if (data) return done((data as any).club_id, (data as any).id);
        }
        // an account id (older links, notifications): their first club card
        const pid = route.id || userId;
        if (!pid) return done(null, null);
        const { data } = await supabase.from('hoop_members').select('id, club_id, status').eq('profile_id', pid).order('created_at').limit(10);
        const list = (data as any[]) || [];
        let last: string | null = null;
        try { last = sessionStorage.getItem('hoop-last-club'); } catch { /* ignore */ }
        // prefer their card in the club you were just looking at (chat / props links), then any active card
        const m = list.find((x) => x.club_id === last && x.status === 'active') || list.find((x) => x.status === 'active') || list[0];
        return done(m?.club_id ?? null, m?.id ?? null);
      }
      done(null);
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // a club tab is known right away; while another screen resolves, keep the last club (no header / colour flash)
  if (route.name === 'hoopClub') return { key, club: route.club, member: undefined, pending: false };
  if (res && res.key === key) return { ...res, pending: false };
  return res ? { key, club: res.club, member: undefined, pending: true } : null;
}

/** Loads the club, whether the viewer runs it, and the viewer's own card there. Updates live. */
function useClubData(clubId: string | null): ClubCtx & { loading: boolean } {
  const { user, isModerator } = useAuth();
  const [state, setState] = useState<{ id: string | null; club: HoopClub | null; role: string | null; me: HoopMember | null }>({ id: null, club: null, role: null, me: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;   // a slow answer for a previous club is ignored
    if (!clubId) { setState({ id: null, club: null, role: null, me: null }); return; }
    const [{ data: c }, { data: a }, { data: m }] = await Promise.all([
      supabase.from('hoop_clubs').select('*').eq('id', clubId).maybeSingle(),
      user ? supabase.from('hoop_club_admins').select('role').eq('club_id', clubId).eq('profile_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from('hoop_members').select(MEMBER_COLS).eq('club_id', clubId).eq('profile_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (my !== seq.current) return;
    setState({ id: clubId, club: (c as HoopClub) || null, role: (a as any)?.role ?? null, me: (m as any) || null });
  }, [clubId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    if (!clubId) return;
    const ch = supabase.channel(`hoop-club-${clubId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_clubs', filter: `id=eq.${clubId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_club_admins' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_members', filter: `club_id=eq.${clubId}` }, (p: any) => {
        if (p.new?.profile_id === user?.id || p.old?.profile_id === user?.id) load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, clubId, user?.id]);
  const ready = state.id === clubId;
  return {
    club: ready ? state.club : null,
    isAdmin: isModerator || (ready && !!state.role),
    isOwner: isModerator || (ready && state.role === 'owner'),
    me: ready ? state.me : null,
    reload: load,
    loading: !!clubId && !ready,
  };
}

/** Basketball mode: its own look (each club's colours), header and bottom menu. */
export const HoopShell: React.FC<{ route: Route; go: (r: Route) => void }> = ({ route, go }) => {
  const { user, profile, loading, isModerator } = useAuth();
  const res = useResolve(route, user?.id);
  const clubId = res?.club ?? null;
  const ctx = useClubData(clubId);
  const club = ctx.club;
  const packDot = usePackDot(club && route.name !== 'hoop' && ctx.me?.status === 'active' ? ctx.me.id : null, route.name === 'hoopClub' ? route.tab : route.name);

  let screen: React.ReactNode;
  if (loading) screen = <Spinner label="Warming up…" />;
  else if (!user) screen = (
    <div className="px-4 py-10 text-center space-y-4">
      <img src="/hoop-ball.png" alt="" className="w-24 h-24 mx-auto" />
      <p className="font-hoop italic font-extrabold text-2xl text-white uppercase">Hoop Method</p>
      <p className="text-sm text-[#A8A29E]">Log in to your MINAW DAVAO account to find a basketball club, book games and see your player card.</p>
      <button onClick={() => go({ name: 'auth', mode: 'login' })} className={hbtn.primary}><LogIn className="w-4 h-4" />Log In</button>
    </div>
  );
  else if (profile && profile.role !== 'fan' && !isModerator) screen = (
    <div className="px-4 py-10 text-center space-y-4">
      <img src="/hoop-ball.png" alt="" className="w-20 h-20 mx-auto" />
      <p className="font-hoop italic font-extrabold text-2xl text-white uppercase">For Fan accounts</p>
      <p className="text-sm text-[#A8A29E]">Hoop Method clubs are for individual (Fan) accounts. Artist and Venue/Business accounts can’t join clubs.</p>
      <button onClick={() => go({ name: 'home' })} className={hbtn.primary}><Music className="w-4 h-4" />Back to MINAW</button>
    </div>
  );
  else if (!res || ctx.loading || res.pending) screen = <Spinner label="Loading…" />;
  else if (route.name !== 'hoop' && route.name !== 'hoopDesigns' && !club) screen = route.name === 'hoopPlayer' && !route.id ? (
    <div className="px-4 py-10 text-center space-y-4">
      <p className="font-hoop italic font-black text-[26px] uppercase text-white">No player card yet</p>
      <p className="text-[13px] text-[#A8A29E]">Join a club to get your player card. Each club has its own card, jersey number and stats.</p>
      <button onClick={() => go({ name: 'hoop' })} className={hbtn.primary}><LayoutGrid className="w-4 h-4" />Find a club</button>
    </div>
  ) : (
    <div className="px-4 py-10 text-center space-y-4">
      <p className="text-[#A8A29E]">This isn’t available anymore.</p>
      <button onClick={() => go({ name: 'hoop' })} className={hbtn.primary}><LayoutGrid className="w-4 h-4" />All clubs</button>
    </div>
  );
  else switch (route.name) {
    case 'hoopGame': screen = <HoopGameScreen key={route.id} id={route.id} />; break;
    case 'hoopPlayer': screen = <HoopPlayerScreen key={res.member || 'none'} id={res.member!} />; break;
    case 'hoopClub':
      screen = route.tab === 'players' ? <HoopPlayers key={club!.id} />
        : route.tab === 'packs' ? <HoopPacks key={club!.id} />
        : route.tab === 'me' ? <MyClubCard key={club!.id} />
        : route.tab === 'manage' && ctx.isAdmin ? <HoopManage key={club!.id} />
        : <HoopGames key={club!.id} />;
      break;
    case 'hoopDesigns': screen = user?.id === HOOP_MAIN_ADMIN_ID ? <HoopCardDesigns /> : <HoopClubs />; break;
    default: screen = <HoopClubs />;
  }

  const tab = route.name === 'hoopClub' ? (route.tab || 'games')
    : route.name === 'hoopPlayer' ? (res?.member && res.member === ctx.me?.id ? 'me' : 'players')
    : 'games';
  const tabs: { key: string; label: string; Icon: React.ElementType }[] = [
    { key: 'games', label: 'Games', Icon: CalendarDays },
    { key: 'players', label: 'Players', Icon: Trophy },
    { key: 'packs', label: 'Packs', Icon: Gift },
    { key: 'me', label: 'My Card', Icon: IdCard },
    ...(ctx.isAdmin ? [{ key: 'manage', label: 'Manage', Icon: Settings }] : []),
  ];
  const showClub = !!club && route.name !== 'hoop' && route.name !== 'hoopDesigns';
  useEffect(() => { if (showClub) { try { sessionStorage.setItem('hoop-last-club', club!.id); } catch { /* ignore */ } } }, [showClub, club?.id]);

  return (
    <ClubContext.Provider value={showClub ? ctx : { club: null, isAdmin: false, isOwner: false, me: null, reload: () => {} }}>
      <div className="min-h-screen text-[#F4F1EE] font-sans" style={{ background: '#080808', ...themeVars(showClub ? club!.theme : null) }}>
        <div className="w-full max-w-[480px] mx-auto min-h-screen flex flex-col sm:border-x sm:border-white/10" style={{ background: H.bg }}>
          <header className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-xl" style={{ background: 'rgba(17,17,17,0.94)' }}>
            <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${H.orange}, ${H.ball}, ${H.orange})` }} />
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
              {showClub ? (
                <button onClick={() => go({ name: 'hoopClub', club: club!.id })} className="flex items-center gap-2.5 min-w-0 cursor-pointer" aria-label={`${club!.name} games`}>
                  {club!.logo_url
                    ? <img src={club!.logo_url} alt="" className="w-10 h-10 flex-shrink-0 rounded-full object-cover border-2 border-[var(--hp)] bg-[#F6EFEC]" />
                    : <img src="/hoop-ball.png" alt="" className="w-10 h-10 flex-shrink-0" />}
                  <span className="leading-none text-left min-w-0">
                    <span className="block text-[9px] font-bold tracking-[0.3em] text-[var(--hp)]">HOOP METHOD</span>
                    <span className="block font-hoop italic font-black text-[17px] tracking-tight text-white truncate uppercase">{club!.name}</span>
                  </span>
                </button>
              ) : (
                <button onClick={() => go({ name: 'hoop' })} className="flex items-center gap-2.5 cursor-pointer" aria-label="Hoop Method clubs">
                  <img src="/hoop-ball.png" alt="" className="w-10 h-10 flex-shrink-0 drop-shadow-[0_2px_8px_rgba(242,106,46,0.45)]" />
                  <span className="leading-none text-left">
                    <span className="block text-[9px] font-bold tracking-[0.35em] text-[var(--hp)]">BASKETBALL CLUBS</span>
                    <span className="block font-hoop italic font-black text-[22px] tracking-tight text-white">HOOP METHOD</span>
                  </span>
                </button>
              )}
              <div className="flex items-center gap-2 flex-shrink-0">
                {showClub && ctx.isAdmin && <span className="px-2 py-1 rounded-full text-[9px] font-bold tracking-wider bg-[var(--hp)]/15 text-[var(--hp)] border border-[var(--hp)]/40">{ctx.isOwner && !isModerator ? 'OWNER' : 'ADMIN'}</span>}
                {showClub && (
                  <button onClick={() => go({ name: 'hoop' })} className="flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.06] border border-white/15 text-[#E7E5E4] hover:text-white cursor-pointer" aria-label="All clubs" title="All clubs">
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                )}
                <NotificationBell hoop />
                <button onClick={() => go({ name: 'home' })} className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/[0.06] border border-white/15 text-[12px] font-bold text-[#E7E5E4] hover:text-white cursor-pointer" aria-label="Back to MINAW DAVAO music">
                  <Music className="w-3.5 h-3.5 text-[#53E6D4]" />MINAW
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 pb-28">{screen}</main>

          {showClub && user && (profile?.role === 'fan' || isModerator) && (
            <nav aria-label="Club menu" className="fixed bottom-3 left-0 right-0 z-40 mx-auto max-w-[420px] px-3">
              <div className="flex gap-1 p-1.5 rounded-2xl backdrop-blur-2xl border border-white/15 shadow-[0_10px_35px_rgba(0,0,0,0.8)]" style={{ background: 'rgba(26,26,26,0.96)' }}>
                {tabs.map(({ key, label, Icon }) => {
                  const on = tab === key;
                  return (
                    <button key={key} onClick={() => go({ name: 'hoopClub', club: club!.id, tab: key as any })} className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 cursor-pointer ${on ? 'bg-[var(--hp)] text-[#111]' : 'text-[#A8A29E] hover:text-white'}`}>
                      <span className="relative"><Icon className="w-4 h-4" />{key === 'packs' && packDot && !on && <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-[#FF4D5E] border-2 border-[#1A1A1A]" aria-label="A card pack is ready" />}</span>{label}
                    </button>
                  );
                })}
              </div>
            </nav>
          )}
        </div>
      </div>
    </ClubContext.Provider>
  );
};
