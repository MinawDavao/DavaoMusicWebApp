import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Copy, Heart, ListMusic, Megaphone, Pause, Play, Plus, Share2, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, type Track } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useNav } from '../nav';
import { Avatar, EmptyState, ErrorNote, Modal, Panel, btn, inputCls } from './ui';
import { Composer } from '../screens/ConnectScreen';
import { useShare } from './Share';

type Person = { id: string; display_name: string; avatar_url: string | null } | null;
interface PL {
  id: string; name: string; owner_id: string; original_owner_id: string | null; copied_from: string | null;
  owner: Person; original: Person;
  playlist_likes: { user_id: string }[];
  playlist_tracks: { track_id: string; position: number; tracks: Track | null }[];
}

const COLS = 'id, name, owner_id, original_owner_id, copied_from, '
  + 'owner:profiles!playlists_owner_id_fkey(id, display_name, avatar_url), '
  + 'original:profiles!playlists_original_owner_id_fkey(id, display_name, avatar_url), '
  + 'playlist_likes(user_id), '
  + 'playlist_tracks(track_id, position, tracks(*, bands(id, name, handle, logo_url)))';

export const playlistLink = (id: string) => `${window.location.origin}${window.location.pathname}#/playlist/${id}`;

/** Playlists: one person’s (ownerId) or a single shared one (playlistId). */
export const Playlists: React.FC<{ ownerId?: string; playlistId?: string; isMe?: boolean }> = ({ ownerId, playlistId, isMe = false }) => {
  const go = useNav();
  const { user, termsAccepted } = useAuth();
  const [feedShare, setFeedShare] = useState<PL | null>(null);
  const { current, playing, play, playAll } = usePlayer();
  const [lists, setLists] = useState<PL[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(playlistId || null);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from('playlists').select(COLS).order('created_at');
    q = playlistId ? q.eq('id', playlistId) : q.eq('owner_id', ownerId!);
    const { data, error } = await q;
    if (error) setErr(error.message);
    setLists((data as any) || []);
    setLoaded(true);
  }, [ownerId, playlistId]);
  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(null), 2500); };

  const create = async () => {
    if (!name.trim() || !user) return;
    const { error } = await supabase.from('playlists').insert({ owner_id: user.id, name: name.trim() });
    if (error) return setErr(errorMessage(error));
    setName(''); load();
  };
  const del = async (pl: PL) => {
    if (!confirm(`Delete the playlist “${pl.name}”?`)) return;
    const { error } = await supabase.from('playlists').delete().eq('id', pl.id);
    if (error) return setErr(errorMessage(error));
    load();
  };
  const removeSong = async (pl: PL, trackId: string) => {
    const { error } = await supabase.from('playlist_tracks').delete().eq('playlist_id', pl.id).eq('track_id', trackId);
    if (error) return setErr(errorMessage(error));
    load();
  };
  const like = async (pl: PL) => {
    if (!user) return go({ name: 'auth' });
    const liked = pl.playlist_likes.some((l) => l.user_id === user.id);
    const { error } = liked
      ? await supabase.from('playlist_likes').delete().eq('playlist_id', pl.id).eq('user_id', user.id)
      : await supabase.from('playlist_likes').insert({ playlist_id: pl.id, user_id: user.id });
    if (error) return setErr(errorMessage(error));
    load();
  };
  const { share: openShare, sheet: shareSheet } = useShare();
  const share = (pl: PL) => openShare({
    title: pl.name,
    text: `Listen to “${pl.name}” by ${pl.owner?.display_name || 'a fan'} on MINAW DVO`,
    url: playlistLink(pl.id),
  });
  const saveCopy = async (pl: PL) => {
    if (!user) return go({ name: 'auth' });
    setErr(null);
    const { data, error } = await supabase.from('playlists').insert({
      owner_id: user.id, name: pl.name, copied_from: pl.id, original_owner_id: pl.original_owner_id || pl.owner_id,
    }).select('id').single();
    if (error) return setErr(errorMessage(error));
    const songs = pl.playlist_tracks.filter((x) => x.tracks).map((x) => ({ playlist_id: (data as any).id, track_id: x.track_id, position: x.position }));
    if (songs.length) {
      const { error: e2 } = await supabase.from('playlist_tracks').insert(songs);
      if (e2) return setErr(errorMessage(e2));
    }
    flash(`Saved a copy of “${pl.name}” to your playlists (credited to ${pl.original?.display_name || pl.owner?.display_name}).`);
  };

  if (!playlistId && !isMe && loaded && lists.length === 0) return null;

  const body = (
    <>
      {loaded && lists.length === 0 && (
        playlistId
          ? <EmptyState icon={ListMusic} title="This playlist isn’t available" text="It may have been deleted or made private." />
          : <EmptyState icon={ListMusic} title="No playlists yet" text="Create one here, or add a song from any band page." />
      )}
      {lists.map((pl) => {
        const songs = [...pl.playlist_tracks].filter((x) => x.tracks).sort((a, b) => a.position - b.position);
        const isOpen = open === pl.id;
        const mine = user?.id === pl.owner_id;
        const liked = !!user && pl.playlist_likes.some((l) => l.user_id === user.id);
        return (
          <div key={pl.id} className="rounded-2xl bg-[#1D232A] border border-white/[0.08] p-3 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-12 h-12 rounded-xl bg-[#53E6D4]/15 text-[#53E6D4] flex items-center justify-center flex-shrink-0"><ListMusic className="w-5 h-5" /></span>
              <button onClick={() => setOpen(isOpen ? null : pl.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                <p className="text-sm font-bold text-white truncate">{pl.name}</p>
                <p className="font-mono text-[10px] text-[#53E6D4]">{songs.length} song{songs.length === 1 ? '' : 's'} • {pl.playlist_likes.length} like{pl.playlist_likes.length === 1 ? '' : 's'}</p>
              </button>
              <button onClick={() => setOpen(isOpen ? null : pl.id)} aria-label={isOpen ? 'Collapse' : 'Expand'} className={btn.icon}><ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#8E9AA7]">
              {pl.owner && (
                <button onClick={() => go({ name: 'profile', id: pl.owner!.id })} className="flex items-center gap-1.5 cursor-pointer hover:text-white">
                  <Avatar src={pl.owner.avatar_url} name={pl.owner.display_name} size={20} />by <strong className="text-white">{pl.owner.display_name}</strong>
                </button>
              )}
              {pl.original && pl.original.id !== pl.owner_id && (
                <button onClick={() => go({ name: 'profile', id: pl.original!.id })} className="truncate cursor-pointer hover:text-white">• originally by <strong className="text-[#53E6D4]">{pl.original.display_name}</strong></button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {songs.length > 0 && <button onClick={() => { setOpen(pl.id); playAll(songs.map((x) => x.tracks!)); }} aria-label={`Play all songs in ${pl.name}`} className={`${btn.mint} !py-1.5 !px-3 !text-xs`}><Play className="w-3.5 h-3.5 fill-current" />Play</button>}
              <button onClick={() => like(pl)} aria-pressed={liked} className={`${btn.ghost} !py-1.5 !px-3 !text-xs`} style={liked ? { color: '#FF6B9A' } : undefined}>
                <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-[#FF6B9A]' : ''}`} />{liked ? 'Liked' : 'Like'}
              </button>
              <button onClick={() => { if (!user) return go({ name: 'auth' }); if (!termsAccepted) return go({ name: 'onboarding' }); setFeedShare(pl); }} className={`${btn.primary} !py-1.5 !px-3 !text-xs`}><Megaphone className="w-3.5 h-3.5" />Post to Feed</button>
              <button onClick={() => share(pl)} aria-label="Share link" title="Share link" className={btn.icon}><Share2 className="w-4 h-4" /></button>
              {user && !mine && <button onClick={() => saveCopy(pl)} className={`${btn.ghost} !py-1.5 !px-3 !text-xs`}><Copy className="w-3.5 h-3.5" />Save a copy</button>}
              <span className="flex-1" />
              {mine && <button onClick={() => del(pl)} aria-label={`Delete playlist ${pl.name}`} className={btn.icon}><Trash2 className="w-4 h-4" /></button>}
            </div>
            {isOpen && (songs.length === 0 ? <p className="text-xs text-[#8E9AA7] px-1">No songs yet.</p> : songs.map((x, i) => {
              const t = x.tracks!;
              const on = current?.id === t.id && playing;
              return (
                <div key={t.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-[#161B20] border border-white/[0.08]">
                  <span className="w-3 font-mono text-[10px] text-[#8E9AA7]">{i + 1}</span>
                  <button onClick={() => play(t, songs.map((x) => x.tracks!))} aria-label={on ? `Pause ${t.title}` : `Play ${t.title}`} className="w-8 h-8 rounded-lg bg-[#6045F4] text-white flex items-center justify-center flex-shrink-0 cursor-pointer">
                    {on ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{t.title}</p>
                    {t.bands && <button onClick={() => go({ name: 'band', id: t.bands!.id })} className="text-[10px] text-[#53E6D4] hover:underline cursor-pointer">{t.bands.name}</button>}
                  </div>
                  {mine && <button onClick={() => removeSong(pl, t.id)} aria-label={`Remove ${t.title}`} className={btn.icon}><X className="w-4 h-4" /></button>}
                </div>
              );
            }))}
          </div>
        );
      })}
      {isMe && !playlistId && (
        <div className="flex gap-2">
          <input aria-label="New playlist name" className={`${inputCls} flex-1 min-w-0`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} placeholder="New playlist name" />
          <button onClick={create} disabled={!name.trim()} className={btn.primary}><Plus className="w-4 h-4" />New Playlist</button>
        </div>
      )}
      {note && <p role="status" className="text-xs text-[#53E6D4]">{note}</p>}
      <ErrorNote text={err} />
      {shareSheet}
      {feedShare && (
        <Modal title="Post Playlist to Connect" onClose={() => setFeedShare(null)}>
          <Composer
            playlist={{ id: feedShare.id, name: feedShare.name, ownerName: feedShare.owner?.display_name }}
            onPosted={() => { setFeedShare(null); flash('Posted to the Connect feed!'); }}
          />
        </Modal>
      )}
    </>
  );

  if (playlistId) return <div className="space-y-2.5">{body}</div>;
  return (
    <Panel tone="playlists" icon={ListMusic} title={isMe ? 'My Playlists' : 'Playlists'} sub={isMe ? 'Add songs from any band page with the + playlist button.' : undefined}>
      {body}
    </Panel>
  );
};

export const PlaylistScreen: React.FC<{ id: string }> = ({ id }) => {
  const go = useNav();
  return (
    <div className="px-3 py-4 space-y-4">
      <button onClick={() => go({ name: 'audio' })} className={`${btn.ghost} !py-2 !text-xs`}>← Audio &amp; Bands</button>
      <h1 className="flex items-center gap-2 font-heading font-bold text-xl text-white"><ListMusic className="w-5 h-5 text-[#53E6D4]" />Shared Playlist</h1>
      <Playlists playlistId={id} />
    </div>
  );
};
