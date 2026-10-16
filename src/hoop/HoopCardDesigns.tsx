import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ErrorNote, Spinner } from '../components/ui';
import { fetchStats, hbtn, themeVars, type HoopClub, type HoopMember, type HoopStats } from './lib';
import { saveCardImage } from './TradingCard';
import { CARD_SERIES, TiltCard } from './CardDesigns';

/** A drawn stand-in player photo for the sample card (original artwork, no real person). */
const SAMPLE_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700">
<defs>
<radialGradient id="bg" cx="0.5" cy="0.25" r="0.8"><stop offset="0" stop-color="#5a7bb8"/><stop offset="0.55" stop-color="#25345a"/><stop offset="1" stop-color="#0d1426"/></radialGradient>
<linearGradient id="body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0f1c"/><stop offset="0.75" stop-color="#151d33"/><stop offset="1" stop-color="#2a3a66"/></linearGradient>
<linearGradient id="jer" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e86a1c"/><stop offset="1" stop-color="#a8400c"/></linearGradient>
<radialGradient id="ball" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffb06a"/><stop offset="0.6" stop-color="#e0661c"/><stop offset="1" stop-color="#8a3508"/></radialGradient>
<filter id="glow"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<rect width="500" height="700" fill="url(#bg)"/>
<g opacity="0.35" fill="#ffe9b8"><ellipse cx="90" cy="60" rx="40" ry="10" filter="url(#glow)"/><ellipse cx="410" cy="70" rx="40" ry="10" filter="url(#glow)"/></g>
<g fill="url(#body)">
<ellipse cx="258" cy="168" rx="46" ry="54"/>
<path d="M226 214 q32 18 66 0 l8 22 -82 0z"/>
<path d="M300 300 l64 58 -20 26 -60 -44z"/><path d="M196 252 l-50 92 30 14 46 -78z"/>
<path d="M232 470 l-28 200 44 6 30 -170 22 170 44 -6 -24 -200z"/>
</g>
<path d="M198 236 q58 -24 118 0 l-6 240 h-106z" fill="url(#jer)"/>
<path d="M198 236 q58 -24 118 0" fill="none" stroke="#fff" stroke-width="6"/>
<text x="257" y="372" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="92" fill="#fff" stroke="#7a2a06" stroke-width="3">23</text>
<path d="M204 476 h104 l10 40 h-124z" fill="#e86a1c"/>
<circle cx="378" cy="392" r="40" fill="url(#ball)"/>
<path d="M338 392 h80 M378 352 v80 M350 364 q26 28 0 56 M406 364 q-26 28 0 56" stroke="#5a2204" stroke-width="3.5" fill="none"/>
<path d="M300 140 q14 30 4 70 M316 238 q8 120 -2 236" stroke="#9fc4ff" stroke-width="5" fill="none" opacity="0.6"/>
</svg>`);

const SAMPLE_STATS: HoopStats = {
  member_id: 'sample', games: 12, wins: 8, losses: 4, pts: 186, threes: 22, reb: 61, ast: 47, stl: 19, blk: 6, tov: 21, fouls: 25,
  ppg: 15.5, rpg: 5.1, apg: 3.9, spg: 1.6, bpg: 0.5, tpg: 1.8, topg: 1.8, fpg: 2.1, best_pts: 28,
};

export const HoopCardDesigns: React.FC = () => {
  const go = useNav();
  const { user } = useAuth();
  const [data, setData] = useState<{ member: HoopMember | null; club: HoopClub | null; stats: HoopStats | null; name: string; avatar: string | null } | null>(null);
  const [useMine, setUseMine] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    (async () => {
      let member: HoopMember | null = null, club: HoopClub | null = null, stats: HoopStats | null = null;
      if (user) {
        const { data: m } = await supabase.from('hoop_members').select('*, club:hoop_clubs(*), profiles!hoop_members_profile_id_fkey(display_name, avatar_url)')
          .eq('profile_id', user.id).eq('status', 'active').order('created_at').limit(1).maybeSingle();
        if (m) { member = m as any; club = (m as any).club; stats = (await fetchStats([(m as any).id]))[(m as any).id] || null; }
      }
      if (!club) { const { data: c } = await supabase.from('hoop_clubs').select('*').order('created_at').limit(1).maybeSingle(); club = (c as any) || null; }
      setData({ member, club, stats, name: (member as any)?.profiles?.display_name || '', avatar: (member as any)?.profiles?.avatar_url || null });
    })();
  }, [user?.id]);

  if (!data) return <Spinner label="Loading designs…" />;
  const mine = useMine && !!data.member;
  const person = mine ? { display_name: data.name || 'Player', avatar_url: data.avatar } : { display_name: 'Juan Dela Cruz', avatar_url: null };
  const card = mine
    ? { jersey_number: data.member!.jersey_number, position: data.member!.position, card_photo_url: data.member!.card_photo_url, card_photo_crop: data.member!.card_photo_crop }
    : { jersey_number: 23, position: 'Shooting Guard', card_photo_url: SAMPLE_PHOTO, card_photo_crop: null };
  const stats = mine ? data.stats : SAMPLE_STATS;
  const clubLite = data.club ? { name: data.club.name, logo_url: data.club.logo_url } : null;

  const save = async (n: number) => {
    const node = refs.current[n]; if (!node) return;
    setSaving(n); setErr(null);
    try { await saveCardImage(node, `hoop-card-series-${n}.png`); } catch (e) { setErr(errorMessage(e)); }
    setSaving(null);
  };

  return (
    <div className="px-3 py-4 space-y-5" style={themeVars(data.club?.theme)}>
      <button onClick={() => go({ name: 'hoop' })} className={`${hbtn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" />Clubs</button>
      <div className="space-y-1">
        <h1 className="font-hoop italic font-black text-[30px] uppercase text-white leading-none">Card series</h1>
        <p className="text-[12px] text-[#A8A29E]">Play more, level up your card. Every series shows your name, number, position, club and career stats. Tilt a card with your finger to see the foil shine.</p>
      </div>
      {data.member && (
        <div className="flex gap-1.5">
          {[[true, 'My card'], [false, 'Sample player']].map(([v, l]) => (
            <button key={String(v)} onClick={() => setUseMine(v as boolean)} className={`h-8 px-3 rounded-full text-xs font-bold border cursor-pointer ${useMine === v ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>{l as string}</button>
          ))}
        </div>
      )}
      <ErrorNote text={err} />
      {CARD_SERIES.map(({ n, name, tagline, Comp }) => (
        <section key={n} className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-black tracking-[0.25em] text-[var(--hp)]">SERIES {n}</p>
              <p className="font-hoop italic font-black text-[22px] uppercase text-white leading-none">{name}</p>
              <p className="text-[11px] text-[#A8A29E] mt-0.5">{tagline}</p>
            </div>
            {n > 1 && <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] text-[10px] font-bold text-[#D6D3D1] whitespace-nowrap"><Lock className="w-3 h-3" />After 2 schedules</span>}
          </div>
          <div ref={(el) => { refs.current[n] = el; }} className="-mx-1 px-[7%] py-[8%] rounded-[28px]" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #22201c 0%, #0B0B0E 60%, #050508 100%)' }}>
            <TiltCard><Comp person={person} card={card} stats={stats} club={clubLite} /></TiltCard>
          </div>
          <button onClick={() => save(n)} disabled={saving !== null} className={`${hbtn.ghost} w-full !py-2 !text-xs`}><Download className="w-3.5 h-3.5" />{saving === n ? 'Making picture…' : 'Save this card as a picture'}</button>
        </section>
      ))}
    </div>
  );
};
