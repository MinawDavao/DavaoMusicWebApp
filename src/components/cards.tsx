import React, { useState } from 'react';
import { BadgeCheck, Check, ChevronRight, Download, Flag, Headphones, MapPin, Pause, Play, Ticket, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatGigDate, trackUrl, type Band, type Gig, type Track } from '../lib/db';
import { genreNames } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useNav } from '../nav';
import { Avatar, btn } from './ui';

export const GigCard: React.FC<{ gig: Gig; count: number; going: boolean; onChange: () => void; onDelete?: () => void }> = ({
  gig, count, going, onChange, onDelete,
}) => {
  const { user } = useAuth();
  const go = useNav();
  const [busy, setBusy] = useState(false);

  const rsvp = async () => {
    if (!user) return go({ name: 'auth' });
    setBusy(true);
    if (going) await supabase.from('gig_rsvps').delete().eq('gig_id', gig.id).eq('user_id', user.id);
    else await supabase.from('gig_rsvps').insert({ gig_id: gig.id, user_id: user.id });
    setBusy(false);
    onChange();
  };

  return (
    <div className="rounded-2xl bg-[#1D232A] border border-white/[0.08] p-3.5 space-y-3">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#B7A8FF] text-[10px] font-mono font-bold">{formatGigDate(gig.starts_at)}</span>
            {gig.district && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-mono font-bold">{gig.district}</span>}
          </div>
          <h3 className="font-heading font-bold text-white text-[15px] leading-snug">{gig.title}</h3>
          {gig.bands && (
            <button onClick={() => go({ name: 'band', id: gig.bands!.id })} className="text-xs text-[#EBEBED] cursor-pointer text-left">
              Headliner: <strong className="text-[#53E6D4]">{gig.bands.name}</strong>
            </button>
          )}
          {gig.supporting_acts?.length > 0 && <p className="text-[11px] text-[#8E9AA7]">With: {gig.supporting_acts.join(', ')}</p>}
          {gig.door_charge && <p className="text-[11px] text-[#8E9AA7]">Door: {gig.door_charge}</p>}
        </div>
        {gig.poster_url && <img src={gig.poster_url} alt="Gig poster" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />}
      </div>
      <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-white/[0.08]">
        <span className="flex items-center gap-1.5 text-[11px] text-[#FFB800] min-w-0"><MapPin className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{gig.venue}</span></span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onDelete && <button onClick={onDelete} aria-label="Delete gig" className={btn.icon}><Trash2 className="w-4 h-4" /></button>}
          <button onClick={rsvp} disabled={busy} className={`${going ? btn.mint : btn.primary} !py-2 !px-3 !text-xs`}>
            {going ? <Check className="w-4 h-4" /> : <Ticket className="w-4 h-4" />} {going ? 'Going' : 'RSVP'} ({count})
          </button>
        </div>
      </div>
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
  track: Track; canManage?: boolean; onDelete?: () => void; onToggleDownload?: () => void; onReport?: () => void;
}> = ({ track, canManage, onDelete, onToggleDownload, onReport }) => {
  const { current, playing, play } = usePlayer();
  const isCurrent = current?.id === track.id;
  const dur = track.duration_sec ? `${Math.floor(track.duration_sec / 60)}:${String(track.duration_sec % 60).padStart(2, '0')}` : '';

  const download = async () => {
    const url = await trackUrl(track.audio_path, true, `${track.title}.${track.format || 'mp3'}`);
    window.location.href = url;
  };

  return (
    <div className="p-2.5 rounded-2xl bg-[#1D232A] border border-white/[0.08] space-y-2">
      <div className="flex items-center gap-2.5">
        <button onClick={() => play(track)} aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`} className="w-10 h-10 rounded-full bg-[#6045F4] text-white flex items-center justify-center flex-shrink-0 cursor-pointer">
          {isCurrent && playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white truncate">{track.title}</p>
          <p className="text-[10px] text-[#8E9AA7]">
            {track.bands?.name && <span className="text-[#53E6D4]">{track.bands.name} • </span>}
            {track.play_count.toLocaleString()} plays{dur && ` • ${dur}`}
          </p>
        </div>
        {track.allow_download && <button onClick={download} aria-label="Download track" title="Download for personal listening" className={btn.icon}><Download className="w-4 h-4" /></button>}
        {onReport && <button onClick={onReport} aria-label="Report track" className={btn.icon}><Flag className="w-4 h-4" /></button>}
        {canManage && onDelete && <button onClick={onDelete} aria-label="Remove track" className={btn.icon}><Trash2 className="w-4 h-4" /></button>}
      </div>
      {canManage && onToggleDownload && (
        <label className="flex items-center gap-2 text-[11px] text-[#8E9AA7] cursor-pointer pl-1">
          <input type="checkbox" checked={track.allow_download} onChange={onToggleDownload} className="w-4 h-4 accent-[#53E6D4]" />
          Allow fans to download
        </label>
      )}
    </div>
  );
};
