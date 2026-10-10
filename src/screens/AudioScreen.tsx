import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Headphones, Music, Pause, Play, Radio, Search, Shuffle, Trophy, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Band, Track } from '../lib/db';
import { BAND_COLS, fetchTopBands, fetchTracks, genreNames } from '../lib/queries';
import { usePlayer } from '../context/PlayerContext';
import { BandRow } from '../components/cards';
import { EmptyState, SectionHead, Spinner, btn } from '../components/ui';

export const AudioScreen: React.FC = () => {
  const { current, playing, play } = usePlayer();
  const [loading, setLoading] = useState(true);
  const [bands, setBands] = useState<Band[]>([]);
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [top, setTop] = useState<{ band: Band; plays: number }[]>([]);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState<number | null>(null);
  const [queued, setQueued] = useState<Track | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: g }, t, tp] = await Promise.all([
        supabase.from('bands').select(BAND_COLS).order('name'),
        supabase.from('genres').select('id, name').order('name'),
        fetchTracks(),
        fetchTopBands(10),
      ]);
      setBands((b as unknown as Band[]) || []);
      setGenres((g as any) || []);
      setTracks(t);
      setTop(tp);
      if (t.length) setQueued(t[Math.floor(Math.random() * t.length)]);
      setLoading(false);
    })();
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return bands.filter((b) => {
      const g = genreNames(b);
      const okGenre = genre === null || (b.band_genres || []).some((x) => x.genre_id === genre);
      const okText = !s || [b.name, b.handle, b.home_base || '', ...g].join(' ').toLowerCase().includes(s);
      return okGenre && okText;
    });
  }, [bands, q, genre]);

  const shuffle = () => {
    if (!tracks.length) return;
    const pool = tracks.length > 1 ? tracks.filter((t) => t.id !== queued?.id) : tracks;
    const next = pool[Math.floor(Math.random() * pool.length)];
    setQueued(next);
    play(next);
  };

  const searching = q.trim() !== '' || genre !== null;
  const queuedPlaying = queued && current?.id === queued.id && playing;

  return (
    <div className="px-3 py-4 space-y-6">
      <section className="space-y-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#6045F4] text-white flex items-center justify-center"><Headphones className="w-5 h-5" /></div>
          <div>
            <h1 className="font-heading font-bold text-[22px] text-white">Audio &amp; Bands</h1>
            <p className="text-[11px] text-[#8E9AA7]">Search local bands by name or genre</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-3.5 pr-1.5 py-1.5 rounded-2xl bg-[#161B20] border border-white/15">
          <Search className="w-4 h-4 text-[#8E9AA7]" />
          <label htmlFor="band-search" className="sr-only">Search bands</label>
          <input id="band-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search band, genre or district" className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[#EBEBED] h-9" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className={btn.icon}><X className="w-4 h-4" /></button>}
        </div>
        {genres.length > 0 && (
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-[11px] text-[#8E9AA7]"><Filter className="w-3 h-3 text-[#53E6D4]" />Filter by Genre:</span>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[{ id: null as number | null, name: 'All Genres' }, ...genres].map((g) => (
                <button key={String(g.id)} onClick={() => setGenre(g.id)} className={`flex-shrink-0 h-8 px-3.5 rounded-full text-xs font-bold cursor-pointer border ${genre === g.id ? 'bg-[#6045F4] border-[#6045F4] text-white' : 'bg-[#161B20] border-white/15 text-[#8E9AA7]'}`}>{g.name}</button>
              ))}
            </div>
          </div>
        )}
      </section>

      {loading ? <Spinner /> : searching ? (
        <section className="space-y-2.5">
          <SectionHead icon={Search} title={`Results (${results.length})`} />
          {results.length === 0
            ? <EmptyState icon={Search} title="No bands match your search" text="Try another name or genre." />
            : results.map((b) => <BandRow key={b.id} band={b} />)}
        </section>
      ) : (
        <>
          {/* DAVAO SCENE RADIO */}
          <section className="rounded-3xl bg-[#1D232A] border border-[#6045F4]/45 p-4 space-y-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#53E6D4]/10 text-[#53E6D4] flex items-center justify-center"><Radio className="w-4 h-4" /></div>
              <div className="flex-1">
                <p className="font-heading font-bold text-sm tracking-wider text-white">DAVAO SCENE RADIO</p>
                <p className="font-mono text-[10px] text-[#8E9AA7]">Homegrown band shuffle • {tracks.length} upload{tracks.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            {!queued ? (
              <EmptyState icon={Music} title="No songs uploaded yet" text="When artists upload their music, Davao Scene Radio will shuffle through it here." />
            ) : (
              <>
                <div className="text-center space-y-1">
                  <p className="text-[10px] font-bold tracking-wider text-[#B7A8FF]">QUEUED TRACK</p>
                  <p className="font-heading font-bold text-lg text-white">{queued.title}</p>
                  <p className="text-[13px] font-bold text-[#53E6D4]">{queued.bands?.name}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => play(queued)} className={`${btn.primary} flex-1`}>{queuedPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}{queuedPlaying ? 'Pause' : 'Play Davao Radio'}</button>
                  <button onClick={shuffle} aria-label="Next random song" className={btn.ghost}><Shuffle className="w-4 h-4" /></button>
                </div>
              </>
            )}
          </section>

          <section className="space-y-2.5">
            <SectionHead icon={Trophy} title="Top 10 Bands" />
            {top.length === 0
              ? <EmptyState icon={Trophy} title="There’s no Top 10 yet" text="Rankings start once fans begin playing uploaded songs." />
              : top.map((t, i) => <BandRow key={t.band.id} band={t.band} rank={i + 1} plays={t.plays} />)}
          </section>

          <section className="space-y-2.5">
            <SectionHead icon={Music} title={`All Bands (${bands.length})`} />
            {bands.length === 0
              ? <EmptyState icon={Music} title="No bands yet" text="Be the first — sign up as an Artist and create your band page." />
              : bands.map((b) => <BandRow key={b.id} band={b} />)}
          </section>
        </>
      )}
    </div>
  );
};
