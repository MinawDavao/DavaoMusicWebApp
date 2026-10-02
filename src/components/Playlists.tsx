import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ListMusic, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, type Track } from '../lib/db';
import { usePlayer } from '../context/PlayerContext';
import { useNav } from '../nav';
import { EmptyState, ErrorNote, SectionHead, btn, inputCls } from './ui';

interface PL { id: string; name: string; description: string | null; playlist_tracks: { track_id: string; position: number; tracks: Track | null }[] }

/** A person's playlists. Owners can create, remove songs and delete playlists. */
export const Playlists: React.FC<{ ownerId: string; isMe: boolean }> = ({ ownerId, isMe }) => {
  const go = useNav();
  const { current, playing, play } = usePlayer();
  const [lists, setLists] = useState<PL[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('playlists')
      .select('id, name, description, playlist_tracks(track_id, position, tracks(*, bands(id, name, handle, logo_url)))')
      .eq('owner_id', ownerId)
      .order('created_at');
    if (error) setErr(error.message);
    setLists((data as any) || []);
  }, [ownerId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from('playlists').insert({ owner_id: ownerId, name: name.trim() });
    if (error) return setErr(errorMessage(error));
    setName(''); load();
  };
  const del = async (pl: PL) => {
    if (!confirm(`Delete the playlist “${pl.name}”?`)) return;
    await supabase.from('playlists').delete().eq('id', pl.id);
    load();
  };
  const removeSong = async (pl: PL, trackId: string) => {
    await supabase.from('playlist_tracks').delete().eq('playlist_id', pl.id).eq('track_id', trackId);
    load();
  };

  if (!isMe && lists.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <SectionHead icon={ListMusic} title={isMe ? 'My Playlists' : 'Playlists'} sub={isMe ? 'Add songs from any band page with the + playlist button.' : undefined} />
      {lists.length === 0 && <EmptyState icon={ListMusic} title="No playlists yet" text="Create one here, or add a song from a band page." />}
      {lists.map((pl) => {
        const songs = [...pl.playlist_tracks].filter((x) => x.tracks).sort((a, b) => a.position - b.position);
        const isOpen = open === pl.id;
        return (
          <div key={pl.id} className="rounded-2xl bg-[#1D232A] border border-white/[0.08] p-3 space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="w-11 h-11 rounded-xl bg-[#53E6D4]/15 text-[#53E6D4] flex items-center justify-center flex-shrink-0"><ListMusic className="w-5 h-5" /></span>
              <button onClick={() => setOpen(isOpen ? null : pl.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                <p className="text-sm font-bold text-white truncate">{pl.name}</p>
                <p className="font-mono text-[10px] text-[#53E6D4]">{songs.length} song{songs.length === 1 ? '' : 's'}</p>
              </button>
              {isMe && <button onClick={() => del(pl)} aria-label={`Delete playlist ${pl.name}`} className={btn.icon}><Trash2 className="w-4 h-4" /></button>}
              <button onClick={() => setOpen(isOpen ? null : pl.id)} aria-label={isOpen ? 'Collapse' : 'Expand'} className={btn.icon}><ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
            </div>
            {isOpen && (songs.length === 0 ? <p className="text-xs text-[#8E9AA7] px-1">No songs yet.</p> : songs.map((x, i) => {
              const t = x.tracks!;
              const on = current?.id === t.id && playing;
              return (
                <div key={t.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-[#161B20] border border-white/[0.08]">
                  <span className="w-3 font-mono text-[10px] text-[#8E9AA7]">{i + 1}</span>
                  <button onClick={() => play(t)} aria-label={on ? `Pause ${t.title}` : `Play ${t.title}`} className="w-8 h-8 rounded-lg bg-[#6045F4] text-white flex items-center justify-center flex-shrink-0 cursor-pointer">
                    {on ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{t.title}</p>
                    {t.bands && <button onClick={() => go({ name: 'band', id: t.bands!.id })} className="text-[10px] text-[#53E6D4] hover:underline cursor-pointer">{t.bands.name}</button>}
                  </div>
                  {isMe && <button onClick={() => removeSong(pl, t.id)} aria-label={`Remove ${t.title}`} className={btn.icon}><X className="w-4 h-4" /></button>}
                </div>
              );
            }))}
          </div>
        );
      })}
      {isMe && (
        <div className="flex gap-2">
          <input aria-label="New playlist name" className={`${inputCls} flex-1 min-w-0`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} placeholder="New playlist name" />
          <button onClick={create} disabled={!name.trim()} className={btn.primary}><Plus className="w-4 h-4" />New Playlist</button>
        </div>
      )}
      <ErrorNote text={err} />
    </section>
  );
};
