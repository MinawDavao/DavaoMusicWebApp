import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, House, LogIn, LogOut, Music, Pencil, Radio, Tag, User as UserIcon } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider } from './context/PlayerContext';
import { NavContext, type Route } from './nav';
import { Avatar, Spinner } from './components/ui';
import { HomeScreen } from './screens/HomeScreen';
import { AudioScreen } from './screens/AudioScreen';
import { BandScreen } from './screens/BandScreen';
import { ConnectScreen } from './screens/ConnectScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { DealsScreen } from './screens/DealsScreen';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PlaylistScreen } from './components/Playlists';

// ---------- hash routing (#/band/<id>, #/profile/<id>, …) so links and Back work ----------
function parseHash(): Route {
  const [, a, b] = window.location.hash.replace(/^#/, '').split('/');
  switch (a) {
    case 'audio': return { name: 'audio' };
    case 'band': return b ? { name: 'band', id: b } : { name: 'audio' };
    case 'connect': return { name: 'connect' };
    case 'profile': return { name: 'profile', id: b || undefined };
    case 'deals': return { name: 'deals' };
    case 'playlist': return b ? { name: 'playlist', id: b } : { name: 'audio' };
    case 'login': return { name: 'auth', mode: 'login' };
    case 'signup': return { name: 'auth', mode: 'signup' };
    case 'welcome': return { name: 'onboarding' };
    default: return { name: 'home' };
  }
}
function toHash(r: Route): string {
  switch (r.name) {
    case 'band': return `#/band/${r.id}`;
    case 'playlist': return `#/playlist/${r.id}`;
    case 'profile': return r.id ? `#/profile/${r.id}` : '#/profile';
    case 'auth': return r.mode === 'signup' ? '#/signup' : '#/login';
    case 'onboarding': return '#/welcome';
    default: return `#/${r.name}`;
  }
}

const TABS: { key: Route['name']; label: string; Icon: React.ElementType; route: Route }[] = [
  { key: 'home', label: 'Home', Icon: House, route: { name: 'home' } },
  { key: 'audio', label: 'Audio', Icon: Headphones, route: { name: 'audio' } },
  { key: 'connect', label: 'Connect', Icon: Radio, route: { name: 'connect' } },
  { key: 'deals', label: 'Deals', Icon: Tag, route: { name: 'deals' } },
];
const activeTab = (r: Route): Route['name'] =>
  r.name === 'band' || r.name === 'playlist' ? 'audio' : r.name === 'profile' ? 'connect' : r.name;

const Header: React.FC<{ route: Route; go: (r: Route) => void }> = ({ route, go }) => {
  const { user, profile, band, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isArtist = profile?.role === 'artist';

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const item = (Icon: React.ElementType, label: string, onClick: () => void, danger = false) => (
    <button role="menuitem" onClick={() => { setMenu(false); onClick(); }} className={`w-full h-11 px-3 rounded-xl flex items-center gap-2.5 text-[13px] font-semibold text-left cursor-pointer hover:bg-white/5 ${danger ? 'text-[#FF8A7A]' : 'text-[#EBEBED]'}`}>
      <Icon className="w-4 h-4" />{label}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 bg-[#0F1417]/95 backdrop-blur-xl border-b border-white/10">
      <div className="px-3.5 pt-3 pb-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => go({ name: 'home' })} className="flex items-center gap-2.5 cursor-pointer" aria-label="MINAW DVO home">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6045F4] to-[#53E6D4] p-0.5">
              <div className="w-full h-full bg-[#0F1417] rounded-[10px] flex items-center justify-center"><Music className="w-4 h-4 text-[#53E6D4]" /></div>
            </div>
            <span className="font-heading font-extrabold text-base tracking-wider"><span className="text-white">MINAW</span><span className="text-[#53E6D4]">DVO</span></span>
          </button>

          {!user ? (
            <button onClick={() => go({ name: 'auth', mode: 'login' })} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#6045F4] text-white text-xs font-bold cursor-pointer">
              <LogIn className="w-3.5 h-3.5 text-[#53E6D4]" />Log In
            </button>
          ) : (
            <div className="relative flex items-center gap-2" ref={ref}>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${isArtist ? 'bg-[#6045F4]/20 border-[#6045F4]/40 text-[#B7A8FF]' : 'bg-[#53E6D4]/15 border-[#53E6D4]/30 text-[#53E6D4]'}`}>{isArtist ? 'Artist' : 'Fan'}</span>
              <button onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-label="Open profile menu" className="cursor-pointer">
                <Avatar src={profile?.avatar_url} name={profile?.display_name} size={38} square={isArtist} ring />
              </button>
              {menu && (
                <div role="menu" className="absolute top-12 right-0 w-60 z-50 p-2 rounded-2xl bg-[#161B20] border border-white/15 shadow-2xl">
                  <div className="flex items-center gap-2.5 px-2 pt-1 pb-3 mb-1 border-b border-white/[0.08]">
                    <Avatar src={profile?.avatar_url} name={profile?.display_name} size={36} square={isArtist} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-white truncate">{profile?.display_name}</p>
                      <p className="font-mono text-[10px] text-[#8E9AA7] truncate">@{profile?.username}</p>
                    </div>
                  </div>
                  {isArtist && (band
                    ? item(Music, 'My Band Page', () => go({ name: 'band', id: band.id }))
                    : item(Music, 'Create Band Page', () => go({ name: 'onboarding' })))}
                  {item(UserIcon, 'My Profile', () => go({ name: 'profile' }))}
                  {item(Pencil, isArtist && band ? 'Edit Band Page' : 'Edit Profile', () => go(isArtist && band ? { name: 'band', id: band.id } : { name: 'profile' }))}
                  <div className="h-px bg-white/[0.08] my-1" />
                  {item(LogOut, 'Log Out', async () => { await signOut(); go({ name: 'home' }); }, true)}
                </div>
              )}
            </div>
          )}
        </div>

        <nav aria-label="Sections" className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#161B20] border border-white/10">
          {TABS.map(({ key, label, Icon, route: r }) => {
            const on = activeTab(route) === key;
            return (
              <button key={key} onClick={() => go(r)} className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${on ? 'bg-[#6045F4] text-white' : 'text-slate-400 hover:text-white'}`}>
                <Icon className={`w-3.5 h-3.5 ${on ? 'text-[#53E6D4]' : ''}`} />{label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

const Shell: React.FC = () => {
  const { loading, user, profile, termsAccepted } = useAuth();
  const [route, setRoute] = useState<Route>(parseHash);

  const go = useCallback((r: Route) => {
    const h = toHash(r);
    if (window.location.hash !== h) window.location.hash = h;
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // After logging in: Terms first, then profile setup, then the app.
  useEffect(() => {
    if (!user || !profile) return;
    if (route.name === 'auth') go(!termsAccepted || !profile.onboarding_completed ? { name: 'onboarding' } : { name: 'home' });
  }, [user, profile, termsAccepted, route.name, go]);

  // Logged out users can't stay on the onboarding screen.
  useEffect(() => {
    if (!loading && !user && route.name === 'onboarding') go({ name: 'auth', mode: 'login' });
  }, [loading, user, route.name, go]);

  const mustAcceptTerms = !!user && !!profile && !termsAccepted;
  const view: Route = mustAcceptTerms ? { name: 'onboarding' } : route;

  let screen: React.ReactNode;
  if (loading) screen = <Spinner label="Loading…" />;
  else switch (view.name) {
    case 'home': screen = <HomeScreen />; break;
    case 'audio': screen = <AudioScreen />; break;
    case 'band': screen = <BandScreen key={view.id} id={view.id} />; break;
    case 'connect': screen = <ConnectScreen />; break;
    case 'profile': screen = <ProfileScreen key={view.id || 'me'} id={view.id} />; break;
    case 'deals': screen = <DealsScreen />; break;
    case 'playlist': screen = <PlaylistScreen key={view.id} id={view.id} />; break;
    case 'auth': screen = <AuthScreen key={view.mode} initialMode={view.mode} />; break;
    case 'onboarding': screen = user ? <OnboardingScreen /> : <Spinner />; break;
  }

  return (
    <NavContext.Provider value={go}>
      <div className="min-h-screen bg-[#07090D] text-[#EBEBED] font-sans">
        <div className="w-full max-w-[480px] mx-auto min-h-screen flex flex-col bg-[#0F1417] sm:border-x sm:border-white/10">
          <Header route={view} go={go} />
          <main className="flex-1">{screen}</main>
          <footer className="pt-7 pb-36 px-4 border-t border-white/10 bg-[#161B20] text-[#8E9AA7] space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#6045F4] flex items-center justify-center text-white"><Music className="w-3.5 h-3.5" /></div>
              <span className="font-heading font-bold text-sm"><span className="text-white">MINAW</span><span className="text-[#53E6D4]">DVO</span></span>
            </div>
            <p className="text-[11px] leading-relaxed">Dedicated local music platform for Davao City &amp; Southern Mindanao. Connect with local bands, discover gigs, and grab gear deals.</p>
            <p className="text-[10px] pt-2 border-t border-white/5">© 2026 MINAW DVO • Made for Davao musicians and fans.</p>
          </footer>
        </div>

        <nav aria-label="Mobile navigation" className="fixed bottom-3 left-0 right-0 z-40 mx-auto max-w-[420px] px-3">
          <div className="flex gap-1 p-1.5 rounded-2xl bg-[#161B20]/95 backdrop-blur-2xl border border-white/15 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
            {TABS.map(({ key, label, Icon, route: r }) => {
              const on = activeTab(view) === key;
              return (
                <button key={key} onClick={() => go(r)} className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 cursor-pointer ${on ? 'bg-[#6045F4] text-white' : 'text-[#8E9AA7] hover:text-white'}`}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </NavContext.Provider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <Shell />
      </PlayerProvider>
    </AuthProvider>
  );
}
