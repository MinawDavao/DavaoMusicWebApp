import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, Building2, CalendarDays, Disc3, Flag, Headphones, Heart, ListMusic, LogIn,
  MessageCircle, MousePointerClick, Music, Play, RefreshCw, Star, Tag, UserPlus, Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/db';
import { useNav } from '../../nav';
import { ErrorNote, SectionHead, Spinner, btn } from '../../components/ui';

interface Day { day: string; signups: number; active: number; plays: number; posts: number }
interface Stats {
  users_total: number; fans: number; artists: number; venues: number; suspended: number;
  signups_today: number; signups_7d: number; signups_30d: number; logins_today: number; active_today: number; active_7d: number;
  bands: number; tracks: number; plays_total: number; plays_today: number; plays_7d: number;
  posts_total: number; posts_today: number; comments_total: number; comments_today: number; reactions_total: number;
  listings_active: number; listings_total: number; gigs_upcoming: number; gigs_total: number; rsvps_total: number;
  playlists: number; follows_total: number; reviews_pending: number; reports_open: number; sponsor_clicks: number;
  by_day: Day[]; top_tracks: { id: string; title: string; play_count: number; band_id: string; band_name: string }[];
}

const n = (x: number | undefined) => (x ?? 0).toLocaleString();

/** Headline number tile. */
const Tile: React.FC<{ icon: React.ElementType; label: string; value: number; sub?: string; accent?: string; onClick?: () => void }> = ({ icon: Icon, label, value, sub, accent = '#53E6D4', onClick }) => {
  const Tag2 = onClick ? 'button' : 'div';
  return (
    <Tag2 onClick={onClick} className={`text-left p-3 rounded-2xl bg-[#1D232A] border border-white/[0.08] space-y-1 ${onClick ? 'cursor-pointer hover:border-white/25' : ''}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8E9AA7]"><Icon className="w-3.5 h-3.5" style={{ color: accent }} />{label}</p>
      <p className="font-heading font-bold text-2xl text-white leading-none">{n(value)}</p>
      {sub && <p className="text-[10px] text-[#8E9AA7]">{sub}</p>}
    </Tag2>
  );
};

type Metric = 'signups' | 'active' | 'plays' | 'posts';
const METRICS: { key: Metric; label: string }[] = [
  { key: 'active', label: 'Active users' }, { key: 'signups', label: 'Sign-ups' }, { key: 'plays', label: 'Plays' }, { key: 'posts', label: 'Posts' },
];

/** Last 14 days, one measure at a time (single series: no legend, the selector names it). */
const DayChart: React.FC<{ days: Day[] }> = ({ days }) => {
  const [m, setM] = useState<Metric>('active');
  const [hover, setHover] = useState<number | null>(null);
  const vals = days.map((d) => d[m]);
  const max = Math.max(1, ...vals);
  const total = vals.reduce((a, b) => a + b, 0);
  const shown = hover ?? days.length - 1;
  return (
    <div className="p-3.5 rounded-2xl bg-[#1D232A] border border-white/[0.08] space-y-3">
      <div role="tablist" aria-label="Chart measure" className="flex flex-wrap gap-1">
        {METRICS.map((x) => (
          <button key={x.key} role="tab" aria-selected={m === x.key} onClick={() => setM(x.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer border ${m === x.key ? 'bg-[#53E6D4] text-[#0F1417] border-[#53E6D4]' : 'border-white/15 text-[#C9D1D9]'}`}>{x.label}</button>
        ))}
      </div>
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] text-[#8E9AA7]"><strong className="text-white text-[15px]">{n(days[shown]?.[m])}</strong> on {days[shown]?.day}{hover === null ? ' (today)' : ''}</p>
        <p className="text-[11px] text-[#8E9AA7]">{n(total)} in 14 days</p>
      </div>
      {/* bars: 4px rounded tops, 2px gaps, baseline anchored; hover/tap shows the value above */}
      <div className="relative h-32 flex items-end gap-[2px] border-b border-white/15" onMouseLeave={() => setHover(null)}>
        <span className="absolute left-0 top-0 text-[9px] text-[#8E9AA7]">{n(max)}</span>
        {days.map((d, i) => (
          <button
            key={d.day}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${d.day}: ${d[m]}`}
            className="flex-1 h-full flex items-end cursor-pointer group"
          >
            <span
              className={`w-full rounded-t-[4px] ${i === shown ? 'bg-[#53E6D4]' : 'bg-[#53E6D4]/45 group-hover:bg-[#53E6D4]/70'}`}
              style={{ height: `${Math.max(d[m] ? 4 : 1, (d[m] / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-[#8E9AA7]"><span>{days[0]?.day}</span><span>{days[days.length - 1]?.day}</span></div>
    </div>
  );
};

export const AdminDashboard: React.FC<{ openTab: (t: string) => void }> = ({ openTab }) => {
  const go = useNav();
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_stats');
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setErr(null); setS(data as Stats);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!s) return err ? <ErrorNote text={err} /> : <Spinner label="Loading statistics…" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[#8E9AA7]">“Today” starts at midnight, Davao time.</p>
        <button onClick={load} disabled={busy} className={`${btn.ghost} !py-1.5 !px-2.5 !text-[11px]`}><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
      <ErrorNote text={err} />

      {(s.reports_open > 0 || s.reviews_pending > 0) && (
        <div className="flex flex-wrap gap-2">
          {s.reports_open > 0 && <button onClick={() => openTab('reports')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF4D6A]/12 border border-[#FF4D6A]/40 text-[12px] font-bold text-[#FF8A9C] cursor-pointer"><AlertTriangle className="w-4 h-4" />{s.reports_open} open report{s.reports_open === 1 ? '' : 's'} to review</button>}
          {s.reviews_pending > 0 && <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FFB800]/10 border border-[#FFB800]/35 text-[12px] font-bold text-[#FFC34D]"><Star className="w-4 h-4" />{s.reviews_pending} testimonial{s.reviews_pending === 1 ? '' : 's'} waiting for owners</span>}
        </div>
      )}

      <section className="space-y-2.5">
        <SectionHead icon={Activity} title="Today" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Tile icon={Activity} label="Active today" value={s.active_today} sub={`${n(s.active_7d)} in the last 7 days`} />
          <Tile icon={LogIn} label="Logged in today" value={s.logins_today} sub="Signed in with password" />
          <Tile icon={UserPlus} label="New sign-ups" value={s.signups_today} sub={`${n(s.signups_7d)} this week · ${n(s.signups_30d)} in 30 days`} onClick={() => openTab('users')} />
          <Tile icon={Play} label="Plays today" value={s.plays_today} sub={`${n(s.plays_7d)} this week`} onClick={() => openTab('music')} />
          <Tile icon={MessageCircle} label="Posts today" value={s.posts_today} sub={`${n(s.comments_today)} comments today`} onClick={() => openTab('posts')} />
          <Tile icon={Flag} label="Open reports" value={s.reports_open} accent="#FF8A9C" onClick={() => openTab('reports')} />
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionHead icon={BarChart3} title="Last 14 days" />
        {s.by_day?.length ? <DayChart days={s.by_day} /> : null}
      </section>

      <section className="space-y-2.5">
        <SectionHead icon={Users} title="Community" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Tile icon={Users} label="Total users" value={s.users_total} sub={`${n(s.suspended)} suspended`} onClick={() => openTab('users')} />
          <Tile icon={Headphones} label="Fans" value={s.fans} />
          <Tile icon={Music} label="Artists" value={s.artists} accent="#B7A8FF" />
          <Tile icon={Building2} label="Venues/Businesses" value={s.venues} accent="#FFC34D" />
          <Tile icon={Heart} label="Follows" value={s.follows_total} />
          <Tile icon={ListMusic} label="Playlists" value={s.playlists} />
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionHead icon={Disc3} title="Music & content" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Tile icon={Play} label="Total plays" value={s.plays_total} onClick={() => openTab('music')} />
          <Tile icon={Disc3} label="Songs" value={s.tracks} onClick={() => openTab('music')} />
          <Tile icon={Music} label="Band pages" value={s.bands} accent="#B7A8FF" onClick={() => openTab('bands')} />
          <Tile icon={MessageCircle} label="Posts" value={s.posts_total} sub={`${n(s.comments_total)} comments · ${n(s.reactions_total)} reactions`} onClick={() => openTab('posts')} />
          <Tile icon={CalendarDays} label="Upcoming gigs" value={s.gigs_upcoming} sub={`${n(s.gigs_total)} total · ${n(s.rsvps_total)} RSVPs`} onClick={() => openTab('gigs')} />
          <Tile icon={Tag} label="Active deals" value={s.listings_active} sub={`${n(s.listings_total)} posted in total`} onClick={() => openTab('deals')} />
          <Tile icon={MousePointerClick} label="Sponsor clicks" value={s.sponsor_clicks} onClick={() => openTab('sponsors')} />
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionHead icon={Play} title="Most played songs" />
        {s.top_tracks.length === 0 ? <p className="text-xs text-[#8E9AA7]">No plays yet.</p> : (
          <ol className="space-y-1.5">
            {s.top_tracks.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#1D232A] border border-white/[0.08]">
                <span className="w-5 text-center font-mono text-xs text-[#8E9AA7]">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-white truncate">{t.title}</span>
                  <button onClick={() => go({ name: 'band', id: t.band_id })} className="text-[11px] text-[#53E6D4] hover:underline cursor-pointer">{t.band_name}</button>
                </span>
                <span className="font-mono text-xs text-white">{n(t.play_count)} plays</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};
