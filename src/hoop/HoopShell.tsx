import React from 'react';
import { CalendarDays, IdCard, LogIn, Music, Trophy } from 'lucide-react';
import type { Route } from '../nav';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';
import { H, hbtn } from './lib';
import { HoopGames } from './HoopGames';
import { HoopGameScreen } from './HoopGame';
import { HoopPlayerScreen, HoopPlayers } from './HoopPlayer';

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

export const isHoopRoute = (r: Route) => r.name === 'hoop' || r.name === 'hoopGame' || r.name === 'hoopPlayer' || r.name === 'hoopPlayers';

/** Basketball mode: its own look (logo colours), header and bottom menu. */
export const HoopShell: React.FC<{ route: Route; go: (r: Route) => void }> = ({ route, go }) => {
  const { user, profile, loading, isModerator } = useAuth();

  let screen: React.ReactNode;
  if (loading) screen = <Spinner label="Warming up…" />;
  else if (!user) screen = (
    <div className="px-4 py-10 text-center space-y-4">
      <img src="/hoop-method-logo.jpg" alt="Sunday Hoop Method" className="w-56 mx-auto rounded-2xl" />
      <p className="font-hoop italic font-extrabold text-2xl text-white uppercase">Members only</p>
      <p className="text-sm text-[#A8A29E]">Log in to your MINAW DVO account to book games and see your player card.</p>
      <button onClick={() => go({ name: 'auth', mode: 'login' })} className={hbtn.primary}><LogIn className="w-4 h-4" />Log In</button>
    </div>
  );
  else if (profile && profile.role !== 'fan' && !isModerator) screen = (
    <div className="px-4 py-10 text-center space-y-4">
      <img src="/hoop-ball.png" alt="" className="w-20 h-20 mx-auto" />
      <p className="font-hoop italic font-extrabold text-2xl text-white uppercase">For Fan accounts</p>
      <p className="text-sm text-[#A8A29E]">Sunday Hoop Method is for individual (Fan) accounts. Artist and Venue/Business accounts can’t join games.</p>
      <button onClick={() => go({ name: 'home' })} className={hbtn.primary}><Music className="w-4 h-4" />Back to MINAW</button>
    </div>
  );
  else switch (route.name) {
    case 'hoopGame': screen = <HoopGameScreen key={route.id} id={route.id} />; break;
    case 'hoopPlayer': screen = <HoopPlayerScreen key={route.id || 'me'} id={route.id} />; break;
    case 'hoopPlayers': screen = <HoopPlayers />; break;
    default: screen = <HoopGames />;
  }

  const tab = route.name === 'hoopPlayers' ? 'players' : route.name === 'hoopPlayer' && (!route.id || route.id === user?.id) ? 'me' : route.name === 'hoopPlayer' ? 'players' : 'games';
  const tabs: { key: string; label: string; Icon: React.ElementType; to: Route }[] = [
    { key: 'games', label: 'Games', Icon: CalendarDays, to: { name: 'hoop' } },
    { key: 'players', label: 'Players', Icon: Trophy, to: { name: 'hoopPlayers' } },
    { key: 'me', label: 'My Card', Icon: IdCard, to: { name: 'hoopPlayer' } },
  ];

  return (
    <div className="min-h-screen text-[#F4F1EE] font-sans" style={{ background: '#080808' }}>
      <div className="w-full max-w-[480px] mx-auto min-h-screen flex flex-col sm:border-x sm:border-white/10" style={{ background: H.bg }}>
        <header className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-xl" style={{ background: 'rgba(17,17,17,0.94)' }}>
          <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${H.orange}, ${H.ball}, ${H.orange})` }} />
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
            <button onClick={() => go({ name: 'hoop' })} className="flex items-center gap-2.5 cursor-pointer" aria-label="Hoop Method games">
              <img src="/hoop-ball.png" alt="" className="w-10 h-10 flex-shrink-0 drop-shadow-[0_2px_8px_rgba(242,106,46,0.45)]" />
              <span className="leading-none text-left">
                <span className="block text-[9px] font-bold tracking-[0.35em] text-[#F28C14]">SUNDAY</span>
                <span className="block font-hoop italic font-black text-[22px] tracking-tight text-white">HOOP METHOD</span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              {isModerator && <span className="px-2 py-1 rounded-full text-[9px] font-bold tracking-wider bg-[#F28C14]/15 text-[#F28C14] border border-[#F28C14]/40">ADMIN</span>}
              <button onClick={() => go({ name: 'home' })} className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/[0.06] border border-white/15 text-[12px] font-bold text-[#E7E5E4] hover:text-white cursor-pointer" aria-label="Back to MINAW DVO music">
                <Music className="w-3.5 h-3.5 text-[#53E6D4]" />MINAW
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-28">{screen}</main>

        {user && (profile?.role === 'fan' || isModerator) && (
          <nav aria-label="Hoop Method menu" className="fixed bottom-3 left-0 right-0 z-40 mx-auto max-w-[420px] px-3">
            <div className="flex gap-1 p-1.5 rounded-2xl backdrop-blur-2xl border border-white/15 shadow-[0_10px_35px_rgba(0,0,0,0.8)]" style={{ background: 'rgba(26,26,26,0.96)' }}>
              {tabs.map(({ key, label, Icon, to }) => {
                const on = tab === key;
                return (
                  <button key={key} onClick={() => go(to)} className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 cursor-pointer ${on ? 'bg-[#F28C14] text-[#111]' : 'text-[#A8A29E] hover:text-white'}`}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
};
