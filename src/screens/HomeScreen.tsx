import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Calendar, ChevronLeft, ChevronRight, Headphones, MapPin, Music, Sparkles, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Band, Gig } from '../lib/db';
import { BAND_COLS, fetchMyRsvps, fetchRsvpCounts, fetchTopBands, fetchUpcomingGigs, genreNames } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { SponsoredSpotlight } from '../components/SponsoredSpotlight';
import { BandRow, GigCard } from '../components/cards';
import { EmptyState, SectionHead, Spinner, btn } from '../components/ui';

export const HomeScreen: React.FC = () => {
  const go = useNav();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<Band[]>([]);
  const [fi, setFi] = useState(0);
  const [top, setTop] = useState<{ band: Band; plays: number }[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());

  const loadGigs = useCallback(async () => {
    const [g, c, m] = await Promise.all([fetchUpcomingGigs(10), fetchRsvpCounts(), user ? fetchMyRsvps(user.id) : Promise.resolve(new Set<string>())]);
    setGigs(g); setCounts(c); setMine(m);
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Featured: verified bands first, then newest.
      const { data } = await supabase.from('bands').select(BAND_COLS).order('is_verified', { ascending: false }).order('created_at', { ascending: false }).limit(6);
      setFeatured((data as unknown as Band[]) || []);
      setTop(await fetchTopBands(10));
      await loadGigs();
      setLoading(false);
    })();
  }, [loadGigs]);

  const band = featured[fi];

  return (
    <div className="px-3 py-4 space-y-7">
      {!user && (
        <div className="rounded-2xl p-4 bg-[#1B1D33] border border-[#6045F4]/40 space-y-3">
          <p className="font-heading font-bold text-white">Welcome to MINAW DVO</p>
          <p className="text-xs text-[#8E9AA7] leading-relaxed">The home of Davao City’s local music scene. Create an account to follow bands, upload your music, post gig updates and trade gear.</p>
          <button onClick={() => go({ name: 'auth', mode: 'signup' })} className={btn.primary}><UserPlus className="w-4 h-4" /> Join the scene</button>
        </div>
      )}

      {/* FEATURED BANDS */}
      <section className="space-y-3">
        <SectionHead
          icon={Sparkles}
          title="Featured Bands"
          right={featured.length > 1 ? (
            <div className="flex items-center gap-2">
              <button aria-label="Previous" onClick={() => setFi((fi - 1 + featured.length) % featured.length)} className={btn.icon}><ChevronLeft className="w-4 h-4" /></button>
              <span className="font-mono text-[11px] text-[#8E9AA7]">{fi + 1}/{featured.length}</span>
              <button aria-label="Next" onClick={() => setFi((fi + 1) % featured.length)} className={`${btn.icon} !bg-[#6045F4] !text-white`}><ChevronRight className="w-4 h-4" /></button>
            </div>
          ) : undefined}
        />
        {loading ? <Spinner /> : !band ? (
          <EmptyState
            icon={Music}
            title="No featured bands yet"
            text="Bands will appear here once artists create their band pages."
            action={profile?.role === 'artist' ? null : !user ? <button onClick={() => go({ name: 'auth', mode: 'signup' })} className={btn.ghost}>Sign up as an Artist</button> : null}
          />
        ) : (
          <div className="rounded-3xl bg-[#1D232A] border border-white/[0.08] overflow-hidden">
            <div className="relative h-48 bg-[#252D37]">
              {band.banner_url || band.logo_url
                ? <img src={band.banner_url || band.logo_url!} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-[#8E9AA7]"><Music className="w-8 h-8" /></div>}
              {band.home_base && (
                <span className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/70 border border-white/15 text-[10px] font-bold"><MapPin className="w-3 h-3" />{band.home_base}</span>
              )}
            </div>
            <div className="p-4 space-y-3">
              <h3 className="flex items-center gap-2 font-heading font-bold text-2xl text-white">{band.name}{band.is_verified && <BadgeCheck className="w-5 h-5 text-[#53E6D4]" />}</h3>
              {genreNames(band).length > 0 && (
                <div className="flex flex-wrap gap-1.5">{genreNames(band).map((g) => <span key={g} className="px-2 py-0.5 rounded-full bg-[#6045F4] text-white text-[10px] font-bold">{g}</span>)}</div>
              )}
              {band.bio && <p className="text-[13px] text-[#8E9AA7] leading-relaxed line-clamp-4">{band.bio}</p>}
              <button onClick={() => go({ name: 'band', id: band.id })} className={`${btn.primary} w-full`}>Visit Band Page <ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </section>

      {/* TOP 10 */}
      <section className="space-y-3">
        <SectionHead icon={Headphones} title="Top 10 Davao Artists" sub="Ranked by plays across MINAW DVO" />
        {loading ? <Spinner /> : top.length === 0 ? (
          <EmptyState icon={Headphones} title="There’s no Top 10 yet" text="Once artists upload music and fans start listening, the most-played bands will show up here." />
        ) : (
          <div className="space-y-2">{top.map((t, i) => <BandRow key={t.band.id} band={t.band} rank={i + 1} plays={t.plays} />)}</div>
        )}
      </section>

      {/* SPONSORED (kept as-is) */}
      <SponsoredSpotlight onGoToDeals={() => go({ name: 'deals' })} />

      {/* GIGS */}
      <section className="space-y-3">
        <SectionHead icon={Calendar} title="Upcoming Gigs" sub="Live shows across Davao City" />
        {loading ? <Spinner /> : gigs.length === 0 ? (
          <EmptyState icon={Calendar} title="There are no gigs on the list yet" text="Bands can add their upcoming shows from their band page." />
        ) : (
          <div className="space-y-3">
            {gigs.map((g) => <GigCard key={g.id} gig={g} count={counts[g.id] || 0} going={mine.has(g.id)} onChange={loadGigs} />)}
          </div>
        )}
      </section>
    </div>
  );
};
