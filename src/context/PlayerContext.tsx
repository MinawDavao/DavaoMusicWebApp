import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackUrl, type Track } from '../lib/db';

interface PlayerState {
  current: Track | null;
  playing: boolean;
  error: string | null;
  play: (t: Track) => Promise<void>;
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

  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    a.onended = () => setPlaying(false);
    a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    audio.current = a;
    return () => { a.pause(); };
  }, []);

  const play = useCallback(async (t: Track) => {
    const a = audio.current;
    if (!a) return;
    setError(null);
    if (current?.id === t.id) { a.paused ? a.play() : a.pause(); return; }
    try {
      a.pause();
      a.src = await trackUrl(t.audio_path);
      setCurrent(t);
      setProgress(0);
      await a.play();
      supabase.rpc('record_play', { p_track_id: t.id }).then(() => {});
    } catch (e: any) {
      setError('Could not play this track.');
    }
  }, [current]);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a || !current) return;
    a.paused ? a.play() : a.pause();
  }, [current]);

  const stop = useCallback(() => {
    audio.current?.pause();
    setCurrent(null);
  }, []);

  return (
    <PlayerContext.Provider value={{ current, playing, error, play, toggle, stop }}>
      {children}
      {current && (
        <div className="fixed bottom-[84px] left-0 right-0 z-40 mx-auto max-w-[420px] px-3">
          <div className="rounded-2xl bg-[#1D232A]/95 backdrop-blur border border-[#6045F4]/40 shadow-xl overflow-hidden">
            <div className="h-1 bg-[#252D37]"><div className="h-1 bg-[#53E6D4]" style={{ width: `${progress * 100}%` }} /></div>
            <div className="flex items-center gap-3 px-3 py-2">
              <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="w-9 h-9 rounded-full bg-[#6045F4] text-white flex items-center justify-center cursor-pointer flex-shrink-0">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white truncate">{current.title}</p>
                <p className="text-[11px] text-[#53E6D4] truncate">{current.bands?.name || 'Now playing'}</p>
              </div>
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
