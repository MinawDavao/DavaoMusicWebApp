import React, { useEffect, useState } from 'react';
import { Check, ListMusic, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, type Track } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { ErrorNote, Modal, btn, inputCls } from './ui';

interface PL { id: string; name: string; playlist_tracks: { track_id: string }[] }

/** Add a song to one of your playlists, or create a new playlist with it. */
export const PlaylistModal: React.FC<{ track: Track; onClose: () => void }> = ({ track, onClose }) => {
  const { user } = useAuth();
  const [lists, setLists] = useState<PL[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from('playlists').select('id, name, playlist_tracks(track_id)').eq('owner_id', user!.id).order('created_at');
    setLists((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (pl: PL) => {
    setErr(null);
    const has = pl.playlist_tracks.some((t) => t.track_id === track.id);
    const { error } = has
      ? await supabase.from('playlist_tracks').delete().eq('playlist_id', pl.id).eq('track_id', track.id)
      : await supabase.from('playlist_tracks').insert({ playlist_id: pl.id, track_id: track.id, position: pl.playlist_tracks.length });
    if (error) return setErr(errorMessage(error));
    setNote(has ? `Removed from “${pl.name}”` : `Added to “${pl.name}”`);
    load();
  };

  const create = async () => {
    if (!name.trim()) return;
    setErr(null);
    const { data, error } = await supabase.from('playlists').insert({ owner_id: user!.id, name: name.trim() }).select('id').single();
    if (error) return setErr(errorMessage(error));
    const { error: e2 } = await supabase.from('playlist_tracks').insert({ playlist_id: (data as any).id, track_id: track.id, position: 0 });
    if (e2) return setErr(errorMessage(e2));
    setNote(`Created “${name.trim()}” with this song`);
    setName('');
    load();
  };

  return (
    <Modal title="Add to Playlist" onClose={onClose}>
      <p className="text-xs text-[#8E9AA7]"><span className="text-white font-bold">{track.title}</span>{track.bands?.name ? ` · ${track.bands.name}` : ''}</p>
      {loading ? null : lists.length === 0 ? (
        <p className="text-xs text-[#8E9AA7]">You don’t have any playlists yet. Create your first one below.</p>
      ) : (
        <div className="space-y-1.5">
          {lists.map((pl) => {
            const on = pl.playlist_tracks.some((t) => t.track_id === track.id);
            return (
              <button key={pl.id} onClick={() => toggle(pl)} aria-pressed={on} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left cursor-pointer ${on ? 'bg-[#53E6D4]/10 border-[#53E6D4]/50' : 'bg-[#0F1417] border-white/15'}`}>
                <ListMusic className="w-4 h-4 text-[#53E6D4] flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-white truncate">{pl.name}</span>
                  <span className="block text-[10px] text-[#8E9AA7]">{pl.playlist_tracks.length} song{pl.playlist_tracks.length === 1 ? '' : 's'}</span>
                </span>
                <span className={`w-6 h-6 rounded-md flex items-center justify-center ${on ? 'bg-[#53E6D4] text-[#0F1417]' : 'border-2 border-white/30'}`}>{on && <Check className="w-4 h-4" strokeWidth={3} />}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <input aria-label="New playlist name" className={`${inputCls} flex-1 min-w-0`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} placeholder="New playlist name" />
        <button onClick={create} disabled={!name.trim()} className={btn.primary}><Plus className="w-4 h-4" />Create</button>
      </div>
      {note && <p role="status" className="text-xs text-[#53E6D4]">{note}</p>}
      <ErrorNote text={err} />
    </Modal>
  );
};
