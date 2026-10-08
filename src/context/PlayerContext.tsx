import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackUrl, type Track } from '../lib/db';

interface PlayerState {
  current: Track | null;
  playing: boolean;
  error: string | null;
  queue: Track[];
  /** Play (or pause/resume) a track. Pass the whole list (e.g. a playlist) to keep playing the next songs automatically. */
  play: (t: Track, queue?: Track[]) => Promise<void>;
  /** Start a list from the top. */
  playAll: (list: Track[]) => Promise<void>;
  next: () => void;
  prev: () => void;
  toggle: () => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerState | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [queue, setQueue] = useState<Track[]>([]);
  // refs so the "song ended" handler always sees the latest queue
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const startRef = useRef<(t: Track) => Promise<void>>(async () => {});

  const setQ = (q: Track[], idx: number) => { queueRef.current = q; indexRef.current = idx; setQueue(q); };

  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    a.onended = () => {
      setPlaying(false);
      const i = indexRef.current + 1;
      const q = queueRef.current;
      if (i > 0 && i < q.length) { indexRef.current = i; startRef.current(q[i]); }  // auto-play the next song
    };
    a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    audio.current = a;
    return () => { a.pause(); };
  }, []);

  // Resume; if the 1-hour signed link expired, fetch a fresh one and continue from the same spot.
  const resume = useCallback(async (a: HTMLAudioElement, t: Track) => {
    try { await a.play(); }
    catch {
      try {
        const at = a.currentTime;
        a.src = await trackUrl(t.audio_path);
        a.currentTime = at;
        await a.play();
      } catch { setError('Could not play this track.'); }
    }
  }, []);

  /** Load and play a track from the beginning. */
  const startSeq = useRef(0);
  const start = useCallback(async (t: Track) => {
    const a = audio.current;
    if (!a) return;
    const my = ++startSeq.current;   // if another song is tapped while this one loads, skip this one
    setError(null);
    try {
      a.pause();
      setCurrent(t);
      setProgress(0);
      const src = await trackUrl(t.audio_path);
      if (my !== startSeq.current) return;
      a.src = src;
      await a.play();
      supabase.rpc('record_play', { p_track_id: t.id }).then(() => {}, () => {});
    } catch {
      setError('Could not play this track.');
    }
  }, []);
  startRef.current = start;

  const play = useCallback(async (t: Track, list?: Track[]) => {
    const a = audio.current;
    if (!a) return;
    setError(null);
    if (current?.id === t.id) { if (a.paused) resume(a, t); else a.pause(); return; }
    const q = list && list.length ? list : (queueRef.current.some((x) => x.id === t.id) ? queueRef.current : [t]);
    setQ(q, Math.max(0, q.findIndex((x) => x.id === t.id)));
    await start(t);
  }, [current, resume, start]);

  const playAll = useCallback(async (list: Track[]) => {
    if (!list.length) return;
    setQ(list, 0);
    await start(list[0]);
  }, [start]);

  const jump = useCallback((d: 1 | -1) => {
    const q = queueRef.current; const i = indexRef.current + d;
    if (i < 0 || i >= q.length) return;
    indexRef.current = i;
    start(q[i]);
  }, [start]);
  const next = useCallback(() => jump(1), [jump]);
  const prev = useCallback(() => {
    const a = audio.current;
    if (a && a.currentTime > 3) { a.currentTime = 0; return; }  // like most players: first tap restarts the song
    jump(-1);
  }, [jump]);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a || !current) return;
    setError(null);
    if (a.paused) resume(a, current); else a.pause();
  }, [current, resume]);

  const stop = useCallback(() => {
    audio.current?.pause();
    setCurrent(null);
    setQ([], -1);
  }, []);

  const pos = current ? queue.findIndex((x) => x.id === current.id) : -1;
  const many = queue.length > 1;

  return (
    <PlayerContext.Provider value={{ current, playing, error, queue, play, playAll, next, prev, toggle, stop }}>
      {children}
      {!current && error && (
        <div role="alert" className="fixed bottom-[84px] left-0 right-0 z-40 mx-auto max-w-[420px] px-3">
          <p className="flex items-center justify-between gap-2 rounded-xl bg-[#1D232A] border border-[#FF8A7A]/40 px-3 py-2 text-[12px] text-[#FF8A7A]">
            {error}<button onClick={() => setError(null)} aria-label="Dismiss" className="cursor-pointer"><X className="w-4 h-4" /></button>
          </p>
        </div>
      )}
      {current && (
        <div className="fixed bottom-[84px] left-0 right-0 z-40 mx-auto max-w-[420px] px-3">
          <div className="rounded-2xl bg-[#1D232A]/95 backdrop-blur border border-[#6045F4]/40 shadow-xl overflow-hidden">
            <div className="h-1 bg-[#252D37]"><div className="h-1 bg-[#53E6D4]" style={{ width: `${progress * 100}%` }} /></div>
            <div className="flex items-center gap-2 px-3 py-2">
              {many && <button onClick={prev} aria-label="Previous song" className="w-8 h-8 rounded-lg text-[#C9D1D9] hover:text-white flex items-center justify-center cursor-pointer flex-shrink-0"><SkipBack className="w-4 h-4 fill-current" /></button>}
              <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="w-9 h-9 rounded-full bg-[#6045F4] text-white flex items-center justify-center cursor-pointer flex-shrink-0">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white truncate">{current.title}</p>
                <p className="text-[11px] text-[#53E6D4] truncate">{current.bands?.name || 'Now playing'}{many && pos >= 0 && <span className="text-[#8E9AA7]"> · {pos + 1} of {queue.length}</span>}</p>
              </div>
              {many && <button onClick={next} disabled={pos >= queue.length - 1} aria-label="Next song" className="w-8 h-8 rounded-lg text-[#C9D1D9] hover:text-white disabled:opacity-30 flex items-center justify-center cursor-pointer flex-shrink-0"><SkipForward className="w-4 h-4 fill-current" /></button>}
              <button onClick={stop} aria-label="Close player" className="w-8 h-8 rounded-lg text-[#8E9AA7] hover:text-white flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {error && <p className="px-3 pb-2 text-[11px] text-[#FF8A7A]">{error}</p>}
          </div>
        </div>
      )}
    </PlayerContext.Provider>
  );
};

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
