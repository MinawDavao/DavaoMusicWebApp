import React, { useState } from 'react';
import { Disc3, Music, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkFile, errorMessage, uploadFile } from '../lib/db';
import { ErrorNote, FilePick, btn, inputCls } from './ui';
import { useAuth } from '../context/AuthContext';

/** Shown before the first upload if the artist hasn’t agreed to the music-rights terms yet. */
export const MusicRightsGate: React.FC = () => {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2 p-3 rounded-xl bg-[#FFB800]/[0.07] border border-[#FFB800]/40">
      <label className="flex items-start gap-2.5 text-[12px] text-[#EBEBED] leading-relaxed cursor-pointer">
        <input type="checkbox" disabled={busy} onChange={async (e) => {
          if (!e.target.checked) return;
          setBusy(true); setErr(null);
          const { error } = await supabase.rpc('accept_music_rights');
          if (error) { setErr(errorMessage(error)); setBusy(false); e.target.checked = false; return; }
          await refresh();
        }} className="w-4 h-4 mt-0.5 accent-[#53E6D4]" />
        <span><strong className="text-white">Before you upload:</strong> I own or have permission to share every song I upload, and I’ll choose whether fans can download it.</span>
      </label>
      <ErrorNote text={err} />
    </div>
  );
};

export const MAX_TRACKS = 3;

function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    const url = URL.createObjectURL(file);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(a.duration) ? Math.round(a.duration) : null); };
    a.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    a.src = url;
  });
}

/** Upload one song into the private "tracks" bucket and create its row. */
export async function uploadTrack(opts: { userId: string; bandId: string; file: File; title: string; allowDownload: boolean }) {
  const path = await uploadFile('tracks', opts.userId, opts.file);
  const duration = await audioDuration(opts.file);
  const format = /wav/.test(opts.file.type) ? 'wav' : 'mp3';
  const { error } = await supabase.from('tracks').insert({
    band_id: opts.bandId,
    title: opts.title.trim() || opts.file.name.replace(/\.[^.]+$/, ''),
    audio_path: path,
    duration_sec: duration,
    file_size: opts.file.size,
    format,
    allow_download: opts.allowDownload,
  });
  if (error) {
    await supabase.storage.from('tracks').remove([path]);
    throw error;
  }
}

/** Inline form: pick a file, name it, choose download permission, upload. */
export const TrackUploadForm: React.FC<{ userId: string; bandId: string; used: number; onUploaded: () => void }> = ({
  userId, bandId, used, onUploaded,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [allow, setAllow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const full = used >= MAX_TRACKS;
  const { musicRights } = useAuth();

  const submit = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      await uploadTrack({ userId, bandId, file, title, allowDownload: allow });
      setFile(null); setTitle(''); setAllow(false);
      onUploaded();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (full) {
    return <p className="text-xs text-[#EBEBED] bg-[#FFB800]/10 border border-[#FFB800]/40 rounded-xl px-3 py-2">Upload limit reached — 3 tracks max for now. Remove one to upload another.</p>;
  }

  if (!full && !musicRights) return <MusicRightsGate />;
  return (
    <div className="space-y-2.5 p-3 rounded-2xl bg-[#0F1417] border border-dashed border-white/15">
      <div className="flex items-center justify-between text-[13px] font-bold text-white">
        <span className="flex items-center gap-1.5"><Disc3 className="w-4 h-4 text-[#53E6D4]" /> Upload a song</span>
        <span className="font-mono text-[11px] text-[#53E6D4]">{used} / {MAX_TRACKS}</span>
      </div>
      <FilePick
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
        className={`${btn.ghost} w-full !justify-start`}
        onPick={(f) => {
          const bad = checkFile(f, 'audio');
          if (bad) { setErr(bad); return; }
          setErr(null); setFile(f);
          if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
        }}
      >
        {file ? <><Music className="w-4 h-4 text-[#53E6D4]" /><span className="truncate">{file.name}</span></> : <><Plus className="w-4 h-4 text-[#53E6D4]" />Choose MP3 or WAV (max 50 MB)</>}
      </FilePick>
      {file && (
        <>
          <input aria-label="Song title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
          <label className="flex items-center gap-2.5 text-xs text-[#EBEBED] cursor-pointer">
            <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} className="w-4 h-4 accent-[#53E6D4]" />
            Allow fans to download this song (personal listening only)
          </label>
          <button onClick={submit} disabled={busy} className={`${btn.mint} w-full`}>{busy ? 'Uploading…' : 'Upload Song'}</button>
        </>
      )}
      <ErrorNote text={err} />
      <p className="text-[10px] text-[#8E9AA7]">Only upload music you own or have permission to share (Terms §3).</p>
    </div>
  );
};
