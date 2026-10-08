import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, House, LogIn, LogOut, MessageCircle, Settings, Music, Pencil, Radio, ShieldCheck, Tag, User as UserIcon } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider } from './context/PlayerContext';
import { NavContext, type Route } from './nav';
import { Avatar, Spinner } from './components/ui';
import { roleMeta } from './lib/db';
import { InstallBanner, InstallLink } from './components/InstallApp';
import { AdminScreen } from './screens/admin/AdminScreen';
import { HomeScreen } from './screens/HomeScreen';
import { AudioScreen } from './screens/AudioScreen';
import { BandScreen } from './screens/BandScreen';
import { ConnectScreen, PostScreen } from './screens/ConnectScreen';
import { NotificationBell } from './components/Notifications';
import { ChatScreen, MessagesScreen } from './screens/MessagesScreen';
import { useChatUnread } from './lib/chat';
import { AccountDeletedNote } from './components/DeleteAccount';
import { BallIcon, HoopShell, isHoopRoute } from './hoop/HoopShell';
import { ProfileScreen } from './screens/ProfileScreen';
import { DealsScreen } from './screens/DealsScreen';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PlaylistScreen } from './components/Playlists';

// ---------- hash routing (#/band/<id>, #/profile/<id>, …) so links and Back work ----------
function parseHash(): Route {
  // minawdavao.pages.dev/admin (a real path, no #) opens the Admin Panel
  if (/^\/admin\/?$/i.test(window.location.pathname) && (!window.location.hash || window.location.hash === '#/' || /^#\/(home\/)?admin/.test(window.location.hash))) return { name: 'admin' };
  const [, a, b, c, d] = window.location.hash.replace(/^#/, '').split('/');
  switch (a) {
    case 'audio': return { name: 'audio' };
    case 'band': return b ? { name: 'band', id: b, song: c === 'song' && d ? d : undefined } : { name: 'audio' };
    case 'connect': return { name: 'connect' };
    case 'profile': return { name: 'profile', id: b || undefined };
    case 'deals': return { name: 'deals' };
    case 'playlist': return b ? { name: 'playlist', id: b } : { name: 'audio' };
    case 'post': return b ? { name: 'post', id: b } : { name: 'connect' };
    case 'login': return { name: 'auth', mode: 'login' };
    case 'signup': return { name: 'auth', mode: 'signup' };
    case 'welcome': return { name: 'onboarding' };
    case 'admin': return { name: 'admin' };
    case 'messages': return b ? { name: 'chat', id: b, listing: c === 'deal' && d ? d : undefined } : { name: 'messages' };
    case 'hoop': return b === 'game' && c ? { name: 'hoopGame', id: c } : b === 'player' ? { name: 'hoopPlayer', id: c || undefined } : b === 'me' ? { name: 'hoopPlayer' } : b === 'players' ? { name: 'hoopPlayers' } : { name: 'hoop' };
    case 'home': return b === 'admin' ? { name: 'admin' } : { name: 'home' };
    default: return { name: 'home' };
  }
}
function toHash(r: Route): string {
  switch (r.name) {
    case 'band': return r.song ? `#/band/${r.id}/song/${r.song}` : `#/band/${r.id}`;
    case 'playlist': return `#/playlist/${r.id}`;
    case 'post': return `#/post/${r.id}`;
    case 'profile': return r.id ? `#/profile/${r.id}` : '#/profile';
    case 'auth': return r.mode === 'signup' ? '#/signup' : '#/login';
    case 'onboarding': return '#/welcome';
    case 'admin': return '#/home/admin';
    case 'hoop': return '#/hoop';
    case 'hoopGame': return `#/hoop/game/${r.id}`;
    case 'hoopPlayer': return r.id ? `#/hoop/player/${r.id}` : '#/hoop/me';
    case 'hoopPlayers': return '#/hoop/players';
    case 'chat': return r.listing ? `#/messages/${r.id}/deal/${r.listing}` : `#/messages/${r.id}`;
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
  r.name === 'admin' ? 'home' : r.name === 'band' || r.name === 'playlist' ? 'audio' : r.name === 'profile' || r.name === 'post' ? 'connect' : r.name;

/** Messages icon with the unread-chats badge. */
const ChatIcon: React.FC<{ onClick: () => void; active: boolean }> = ({ onClick, active }) => {
  const n = useChatUnread();
  return (
    <button onClick={onClick} aria-label={n ? `Messages, ${n} unread` : 'Messages'}
      className={`relative w-[38px] h-[38px] rounded-full border flex items-center justify-center cursor-pointer ${active ? 'bg-[#6045F4] border-[#6045F4] text-white' : 'bg-[#161B20] border-white/15 text-[#EBEBED] hover:text-white'}`}>
      <MessageCircle className="w-[18px] h-[18px]" />
      {n > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#53E6D4] text-[#0F1417] text-[10px] font-bold flex items-center justify-center border-2 border-[#0F1417]">{n > 99 ? '99+' : n}</span>
      )}
    </button>
  );
};

const Header: React.FC<{ route: Route; go: (r: Route) => void }> = ({ route, go }) => {
  const { user, profile, band, adminBands, isModerator, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isArtist = profile?.role === 'artist';

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // "Edit Profile" / "Delete Account": open the right editor (band page for artists)
  const openEdit = (what: '1' | 'delete') => {
    try { sessionStorage.setItem('minaw-open-edit', what); } catch { /* ignore */ }
    go(isArtist && band ? { name: 'band', id: band.id } : { name: 'profile' });
    setTimeout(() => window.dispatchEvent(new Event('minaw-open-edit')), 60);
  };
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
            <img src="/minaw-logo.png.png" alt="" className="h-9 w-auto" />
            <span className="font-heading font-extrabold text-base tracking-wider"><span className="text-white">MINAW</span><span className="text-[#53E6D4]">DVO</span></span>
          </button>

          {!user ? (
            <button onClick={() => go({ name: 'auth', mode: 'login' })} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#6045F4] text-white text-xs font-bold cursor-pointer">
              <LogIn className="w-3.5 h-3.5 text-[#53E6D4]" />Log In
            </button>
          ) : (
            <div className="relative flex items-center gap-2" ref={ref}>
              {profile?.role === 'fan' && <button onClick={() => go({ name: 'hoop' })} aria-label="Sunday Hoop Method basketball club" title="Hoop Method"
                className="w-[38px] h-[38px] rounded-full bg-[#F28C14]/12 border border-[#F28C14]/45 text-[#F28C14] hover:bg-[#F28C14]/25 flex items-center justify-center cursor-pointer">
                <BallIcon />
              </button>}
              <ChatIcon onClick={() => go({ name: 'messages' })} active={route.name === 'messages' || route.name === 'chat'} />
              <NotificationBell />
              <span className={`hidden min-[390px]:inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-white/10 ${roleMeta(profile?.role).chip}`}>{roleMeta(profile?.role).label}</span>
              <button onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-label="Open profile menu" className="cursor-pointer">
                <Avatar src={profile?.avatar_url} name={profile?.display_name} size={38} square={roleMeta(profile?.role).square} ring />
              </button>
              {menu && (
                <div role="menu" className="absolute top-12 right-0 w-60 z-50 p-2 rounded-2xl bg-[#161B20] border border-white/15 shadow-2xl">
                  <div className="flex items-center gap-2.5 px-2 pt-1 pb-3 mb-1 border-b border-white/[0.08]">
                    <Avatar src={profile?.avatar_url} name={profile?.display_name} size={36} square={roleMeta(profile?.role).square} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-white truncate">{profile?.display_name}</p>
                      <p className="font-mono text-[10px] text-[#8E9AA7] truncate">@{profile?.username}</p>
                    </div>
                  </div>
                  {isArtist && (band
                    ? item(Music, 'My Band Page', () => go({ name: 'band', id: band.id }))
                    : item(Music, 'Create Band Page', () => go({ name: 'onboarding' })))}
                  {!(isArtist && band) && item(UserIcon, profile?.role === 'venue' ? 'My Venue Page' : 'My Profile', () => go({ name: 'profile' }))}
                  {item(Pencil, isArtist && band ? 'Edit Band Page' : 'Edit Profile', () => openEdit('1'))}
                  {adminBands.map((ab) => <React.Fragment key={ab.id}>{item(Music, `Manage ${ab.name}`, () => go({ name: 'band', id: ab.id }))}</React.Fragment>)}
                  {isModerator && item(ShieldCheck, 'Admin Panel', () => go({ name: 'admin' }))}
                  <div className="h-px bg-white/[0.08] my-1" />
                  {item(Settings, 'Delete Account', () => openEdit('delete'))}
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
    if (route.name !== 'auth') return;
    if (!termsAccepted || !profile.onboarding_completed) return go({ name: 'onboarding' });
    let back: string | null = null;
    try { back = sessionStorage.getItem('minaw-after-login'); sessionStorage.removeItem('minaw-after-login'); } catch { /* ignore */ }
    go(back === 'admin' ? { name: 'admin' } : { name: 'home' });
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
    case 'band': screen = <BandScreen key={view.id} id={view.id} song={view.song} />; break;
    case 'connect': screen = <ConnectScreen />; break;
    case 'profile': screen = <ProfileScreen key={view.id || 'me'} id={view.id} />; break;
    case 'deals': screen = <DealsScreen />; break;
    case 'playlist': screen = <PlaylistScreen key={view.id} id={view.id} />; break;
    case 'post': screen = <PostScreen key={view.id} id={view.id} />; break;
    case 'admin': screen = <AdminScreen />; break;
    case 'messages': screen = <MessagesScreen />; break;
    case 'chat': screen = <ChatScreen key={view.id} id={view.id} listing={view.listing} />; break;
    case 'auth': screen = <AuthScreen key={view.mode} initialMode={view.mode} />; break;
    case 'onboarding': screen = user ? <OnboardingScreen /> : <Spinner />; break;
  }

  // Basketball mode has its own look, header and menu
  if (isHoopRoute(view)) return <NavContext.Provider value={go}><HoopShell route={view} go={go} /></NavContext.Provider>;

  return (
    <NavContext.Provider value={go}>
      <div className="min-h-screen bg-[#07090D] text-[#EBEBED] font-sans">
        <div className="w-full max-w-[480px] mx-auto min-h-screen flex flex-col bg-[#0F1417] sm:border-x sm:border-white/10">
          <Header route={view} go={go} />
          {view.name !== 'auth' && view.name !== 'onboarding' && <InstallBanner />}
          <main className="flex-1">{view.name === 'home' && <AccountDeletedNote />}{screen}</main>
          {view.name !== 'chat' && <footer className="pt-7 pb-36 px-4 border-t border-white/10 bg-[#161B20] text-[#8E9AA7] space-y-3">
            <div className="flex items-center gap-2">
              <img src="/minaw-logo.png.png" alt="" className="h-6 w-auto" />
              <span className="font-heading font-bold text-sm"><span className="text-white">MINAW</span><span className="text-[#53E6D4]">DVO</span></span>
            </div>
            <InstallLink />
            <p className="text-[11px] leading-relaxed">Dedicated local music platform for Davao City &amp; Southern Mindanao. Connect with local bands, discover gigs, and grab gear deals.</p>
            <p className="text-[10px] pt-2 border-t border-white/5">© 2026 MINAW DVO • Made for Davao musicians and fans.</p>
          </footer>}
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
