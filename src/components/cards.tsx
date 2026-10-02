import React, { useState } from 'react';
import { BadgeCheck, Check, ChevronRight, Download, Flag, Headphones, ListPlus, MapPin, Pause, Pencil, Play, Ticket, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, formatGigDate, trackUrl, type Band, type Gig, type Track } from '../lib/db';
import { genreNames } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useNav } from '../nav';
import { Avatar, btn, inputCls } from './ui';

export const GigCard: React.FC<{ gig: Gig; count: number; going: boolean; onChange: () => void; onDelete?: () => void }> = ({
  gig, count, going, onChange, onDelete,
}) => {
  const { user } = useAuth();
  const go = useNav();
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);

  const rsvp = async () => {
    if (!user) return go({ name: 'auth' });
    setBusy(true);
    const { error } = going
      ? await supabase.from('gig_rsvps').delete().eq('gig_id', gig.id).eq('user_id', user.id)
      : await supabase.from('gig_rsvps').insert({ gig_id: gig.id, user_id: user.id });
    setBusy(false);
    if (error) alert(errorMessage(error));
    onChange();
  };

  return (
    <div className="rounded-2xl bg-[#1D232A] border border-white/[0.08] overflow-hidden">
      {gig.poster_url ? (
        <button onClick={() => setZoom(true)} aria-label="View full poster" className="block w-full bg-black cursor-zoom-in">
          <img src={gig.poster_url} alt={`${gig.title} poster`} className="w-full max-h-[520px] object-contain mx-auto" />
        </button>
      ) : (
        <div className="h-24 bg-gradient-to-br from-[#2A2160] to-[#161B20] flex items-center justify-center text-[#B7A8FF]"><Ticket className="w-7 h-7" /></div>
      )}
      <div className="p-3.5 space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#B7A8FF] text-[11px] font-mono font-bold">{formatGigDate(gig.starts_at)}</span>
          {gig.district && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/15 text-[11px] font-mono font-bold">{gig.district}</span>}
        </div>
        <h3 className="font-heading font-bold text-white text-lg leading-snug">{gig.title}</h3>
        {gig.bands && (
          <button onClick={() => go({ name: 'band', id: gig.bands!.id })} className="text-[13px] text-[#EBEBED] cursor-pointer text-left">
            Headliner: <strong className="text-[#53E6D4] hover:underline">{gig.bands.name}</strong>
          </button>
        )}
        {gig.supporting_acts?.length > 0 && <p className="text-xs text-[#8E9AA7]">With: {gig.supporting_acts.join(', ')}</p>}
        <p className="flex items-start gap-1.5 text-[13px] text-[#FFB800]"><MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{gig.venue}{gig.address ? ` — ${gig.address}` : ''}</span></p>
        {gig.door_charge && <p className="text-xs text-[#8E9AA7]">Door: <span className="text-[#EBEBED]">{gig.door_charge}</span></p>}
        <div className="flex items-center justify-end gap-1.5 pt-2.5 border-t border-white/[0.08]">
          {onDelete && <button onClick={onDelete} aria-label="Delete gig" className={btn.icon}><Trash2 className="w-4 h-4" /></button>}
          <button onClick={rsvp} disabled={busy} className={`${going ? btn.mint : btn.primary} !py-2 !px-3.5 !text-xs`}>
            {going ? <Check className="w-4 h-4" /> : <Ticket className="w-4 h-4" />} {going ? 'Going' : 'RSVP'} ({count})
          </button>
        </div>
      </div>
      {zoom && gig.poster_url && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-3" onClick={() => setZoom(false)} role="dialog" aria-label="Gig poster">
          <img src={gig.poster_url} alt={`${gig.title} poster`} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
};

export const BandRow: React.FC<{ band: Band; rank?: number; plays?: number }> = ({ band, rank, plays }) => {
  const go = useNav();
  const rankCls = rank === 1 ? 'bg-[#FFB800] text-[#0F1417]' : rank === 2 ? 'bg-[#D5DAE1] text-[#0F1417]' : rank === 3 ? 'bg-[#E0883A] text-[#0F1417]' : 'bg-[#252D37] text-[#8E9AA7]';
  const g = genreNames(band);
  return (
    <button onClick={() => go({ name: 'band', id: band.id })} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-[#1D232A] border border-white/[0.08] text-left cursor-pointer hover:border-[#6045F4]/50">
      {rank !== undefined && <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 ${rankCls}`}>{rank}</span>}
      <Avatar src={band.logo_url} name={band.name} size={44} square />
      <span className="flex-1 min-w-0 space-y-1">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-white truncate">{band.name}{band.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#53E6D4]" />}</span>
        <span className="block text-[11px] text-[#8E9AA7] truncate">
          {g.length ? <span className="text-[#53E6D4]">{g.join(' / ')}</span> : null}{g.length && band.home_base ? ' • ' : ''}{band.home_base}
        </span>
      </span>
      {plays !== undefined && (
        <span className="text-right flex-shrink-0">
          <span className="flex items-center gap-1 font-mono text-xs font-bold text-white"><Headphones className="w-3 h-3 text-[#53E6D4]" />{plays.toLocaleString()}</span>
          <span className="block font-mono text-[9px] text-[#8E9AA7]">plays</span>
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-[#8E9AA7] flex-shrink-0" />
    </button>
  );
};

export const TrackRow: React.FC<{
  track: Track; canManage?: boolean; onChanged?: () => void; onReport?: () => void; onAddToPlaylist?: () => void;
}> = ({ track, canManage, onChanged, onReport, onAddToPlaylist }) => {
  const { current, playing, play } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(track.title);
  const [allow, setAllow] = useState(track.allow_download);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isCurrent = current?.id === track.id;
  const dur = track.duration_sec ? `${Math.floor(track.duration_sec / 60)}:${String(track.duration_sec % 60).padStart(2, '0')}` : '';

  const download = async () => {
    setErr(null);
    try {
      const url = await trackUrl(track.audio_path, true, `${track.title}.${track.format || 'mp3'}`);
      window.location.href = url;
    } catch (e) { setErr(errorMessage(e)); }
  };
  const save = async () => {
    if (!title.trim()) return setErr('Song title can’t be empty.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('tracks').update({ title: title.trim(), allow_download: allow }).eq('id', track.id);
    setBusy(false);
    if (error) return setErr(error.message);
    setEditing(false); onChanged?.();
  };
  const remove = async () => {
    if (!confirm(`Delete “${track.title}”? This can’t be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from('tracks').delete().eq('id', track.id);
    if (!error) await supabase.storage.from('tracks').remove([track.audio_path]);
    setBusy(false);
    if (error) return setErr(error.message);
    onChanged?.();
  };

  return (
    <div className="p-2.5 rounded-2xl bg-[#1D232A] border border-white/[0.08] space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={() => play(track)} aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`} className="w-10 h-10 rounded-full bg-[#6045F4] text-white flex items-center justify-center flex-shrink-0 cursor-pointer">
          {isCurrent && playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white truncate">{track.title}</p>
          <p className="text-[10px] text-[#8E9AA7]">
            {track.bands?.name && <span className="text-[#53E6D4]">{track.bands.name} • </span>}
            {track.play_count.toLocaleString()} plays{dur && ` • ${dur}`}{track.allow_download && ' • downloadable'}
          </p>
        </div>
        {track.allow_download && !canManage && <button onClick={download} aria-label="Download song" title="Download for personal listening" className={btn.icon}><Download className="w-4 h-4" /></button>}
        {onAddToPlaylist && <button onClick={onAddToPlaylist} aria-label="Add to playlist" title="Add to playlist" className={btn.icon}><ListPlus className="w-4 h-4" /></button>}
        {onReport && <button onClick={onReport} aria-label="Report song" className={btn.icon}><Flag className="w-4 h-4" /></button>}
        {canManage && !editing && <button onClick={() => setEditing(true)} aria-label="Edit song" className={btn.icon}><Pencil className="w-4 h-4" /></button>}
      </div>
      {canManage && editing && (
        <div className="space-y-2 p-2.5 rounded-xl bg-[#0F1417] border border-white/15">
          <label className="block text-[11px] font-bold text-white" htmlFor={`t-${track.id}`}>Song title</label>
          <input id={`t-${track.id}`} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-[#EBEBED] cursor-pointer">
            <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} className="w-4 h-4 accent-[#53E6D4]" />
            Allow fans to download this song (personal listening only)
          </label>
          <div className="flex gap-2">
            <button onClick={remove} disabled={busy} className={`${btn.ghost} !py-2 !text-xs !text-[#FF8A7A]`}><Trash2 className="w-3.5 h-3.5" />Delete song</button>
            <span className="flex-1" />
            <button onClick={() => { setEditing(false); setTitle(track.title); setAllow(track.allow_download); }} className={`${btn.ghost} !py-2 !text-xs`}>Cancel</button>
            <button onClick={save} disabled={busy} className={`${btn.mint} !py-2 !text-xs`}><Check className="w-3.5 h-3.5" />Save</button>
          </div>
        </div>
      )}
      {err && <p className="text-[11px] text-[#FF8A7A]">{err}</p>}
    </div>
  );
};
