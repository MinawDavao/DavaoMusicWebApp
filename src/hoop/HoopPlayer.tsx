import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Crown, Download, ImageIcon, MessageSquareQuote, Music, Pencil, RotateCcw, Search, Trash2, UserMinus, UserPlus, X, ZoomIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, removeImageByUrl, timeAgo, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, ErrorNote, FilePick, Modal, Spinner } from '../components/ui';
import { DEFAULT_CROP, cropOf, type CardCrop } from '../components/CardBackground';
import { TradingCard, saveCardImage } from './TradingCard';
import {
  H, PERSON, boxScore, fetchStats, fmt1, gameDate, hbtn, hinput,
  type HoopCard, type HoopEvent, type HoopPerson, type HoopStats,
} from './lib';

const POSITIONS = ['Point Guard', 'Shooting Guard', 'Guard', 'Small Forward', 'Power Forward', 'Forward', 'Center', 'All-around'];

// ===================================================================== PLAYER CARD
export const HoopPlayerScreen: React.FC<{ id?: string }> = ({ id }) => {
  const go = useNav();
  const { user } = useAuth();
  const pid = id || user?.id;
  const isMe = !!user && pid === user.id;
  const [person, setPerson] = useState<HoopPerson | null | undefined>(undefined);
  const [card, setCard] = useState<HoopCard | null>(null);
  const [stats, setStats] = useState<HoopStats | null>(null);
  const [recent, setRecent] = useState<{ id: string; title: string; starts_at: string; team: 'A' | 'B'; team_a: string; team_b: string; a: number; b: number; pts: number; reb: number; ast: number }[]>([]);
  const [fans, setFans] = useState(0);
  const [followingN, setFollowingN] = useState(0);
  const [iFollow, setIFollow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [photoEdit, setPhotoEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!pid) return;
    const [{ data: p }, { data: c }, st, fr, fg, mineF] = await Promise.all([
      supabase.from('profiles').select(PERSON).eq('id', pid).maybeSingle(),
      supabase.from('hoop_players').select('*').eq('profile_id', pid).maybeSingle(),
      fetchStats([pid]),
      supabase.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', pid),
      supabase.from('user_follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', pid),
      user && user.id !== pid ? supabase.from('user_follows').select('follower_id').eq('follower_id', user.id).eq('followee_id', pid).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setPerson((p as any) || null);
    setCard((c as HoopCard) || null);
    setStats(st[pid] || null);
    setFans(fr.count || 0); setFollowingN(fg.count || 0); setIFollow(!!(mineF as any).data);

    // last 5 finished games
    const { data: gp } = await supabase.from('hoop_game_players').select('team, hoop_games!inner(id, title, starts_at, ended_at, status, team_a, team_b)')
      .eq('profile_id', pid).not('team', 'is', null).eq('hoop_games.status', 'final').order('booked_at', { ascending: false }).limit(200);
    // most recently finished first
    const when = (g: any) => g.ended_at || g.starts_at;
    const games = ((gp as any[]) || []).map((x) => ({ ...x.hoop_games, team: x.team }))
      .sort((x, y) => when(y).localeCompare(when(x))).slice(0, 5);
    if (games.length) {
      const ids = games.map((g) => g.id);
      const { data: ev } = await supabase.from('hoop_events').select('*').in('game_id', ids);
      const all = (ev as HoopEvent[]) || [];
      setRecent(games.map((g) => {
        const bs = boxScore(all.filter((e) => e.game_id === g.id));
        const l = bs.lines[pid];
        return { ...g, a: bs.score.A, b: bs.score.B, pts: l?.pts || 0, reb: l?.reb || 0, ast: l?.ast || 0 };
      }));
    } else setRecent([]);
  }, [pid, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    // a game finishing updates this card right away
    const ch = supabase.channel(`hoop-card-${pid}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hoop_games' }, (p: any) => { if (p.new?.status === 'final' || p.old?.status === 'final') load(); })   // (full rows: replica identity full)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, pid]);

  const join = async () => {
    setErr(null);
    const { error } = await supabase.from('hoop_players').insert({ profile_id: user!.id });
    if (error) return setErr(errorMessage(error));
    await load(); setEditing(true);
  };
  const toggleFollow = async () => {
    if (!user || !pid) return;
    const { error } = iFollow
      ? await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('followee_id', pid)
      : await supabase.from('user_follows').insert({ follower_id: user.id, followee_id: pid });
    if (error) return setErr(errorMessage(error));
    load();
  };

  if (!pid) return null;
  if (person === undefined) return <Spinner label="Loading player…" />;
  if (person === null) return <p className="px-4 py-10 text-center text-[#A8A29E]">This player isn’t available.</p>;

  if (!card) {
    return (
      <div className="px-4 py-10 text-center space-y-4">
        <Avatar src={person.avatar_url} name={person.display_name} size={96} />
        <p className="font-hoop italic font-black text-[26px] uppercase text-white">{isMe ? 'Get your player card' : `${person.display_name} hasn’t joined yet`}</p>
        {isMe ? (
          <>
            <p className="text-[13px] text-[#A8A29E]">Your card is made automatically when you book your first game — or make it now and add your jersey number and position.</p>
            <button onClick={join} className={hbtn.primary}>Create my player card</button>
          </>
        ) : <p className="text-[13px] text-[#A8A29E]">Their card appears after they book a game.</p>}
        <ErrorNote text={err} />
      </div>
    );
  }

  const s = stats;
  const info: [string, string][] = [
    ['POSITION', card.position || '—'],
    ['GAMES PLAYED', String(s?.games ?? 0)],
    ['RECORD', s ? `${s.wins}-${s.losses}` : '0-0'],
    ...(card.height ? [['HEIGHT', card.height] as [string, string]] : []),
    ['MEMBER SINCE', new Date(card.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase()],
  ];

  const saveShot = async () => {
    if (!shotRef.current) return;
    setSaving(true); setErr(null); setSaveNote(null);
    try {
      const r = await saveCardImage(shotRef.current, `hoop-card-${person.display_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
      if (r === 'downloaded') setSaveNote('Saved! Check your Downloads / Photos.');
    } catch (e) { setErr(errorMessage(e)); }
    setSaving(false);
  };

  return (
    <div className="px-3 py-4 space-y-4">

      {/* THE CARD (the padded box around it is what gets saved as a picture, glow included) */}
      <div ref={shotRef} className="-mx-1 px-[7%] py-[8%] rounded-[28px]" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #2A1606 0%, #0B0710 55%, #050508 100%)' }}>
        <TradingCard person={person} card={card} stats={s} />
      </div>

      <div className="space-y-2.5">
        {isMe && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPhotoEdit(true)} className={`${hbtn.primary} !py-2.5 !text-xs`}><Camera className="w-4 h-4" />Card photo</button>
            <button onClick={saveShot} disabled={saving} className={`${hbtn.ghost} !py-2.5 !text-xs`}><Download className="w-4 h-4" />{saving ? 'Making picture…' : 'Save card image'}</button>
          </div>
        )}
        {saveNote && <p className="text-center text-[11px] text-[#53E6D4]">{saveNote}</p>}
        <div className="flex gap-2">
          {isMe
            ? <button onClick={() => setEditing(true)} className={`${hbtn.ghost} flex-1 !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />Jersey & position</button>
            : <>
                <button onClick={toggleFollow} className={`${iFollow ? hbtn.ghost : hbtn.primary} flex-1 !py-2 !text-xs`}>{iFollow ? <><UserMinus className="w-3.5 h-3.5" />Following</> : <><UserPlus className="w-3.5 h-3.5" />Follow</>}</button>
                <button onClick={saveShot} disabled={saving} className={`${hbtn.ghost} !py-2 !px-3 !text-xs`} aria-label="Save card image"><Download className="w-3.5 h-3.5" /></button>
              </>}
          <button onClick={() => go({ name: 'profile', id: person.id })} className={`${hbtn.ghost} flex-1 !py-2 !text-xs`}><Music className="w-3.5 h-3.5 text-[#53E6D4]" />Music profile</button>
        </div>
        <div className="flex items-center justify-around text-center py-1">
          <div><p className="font-hoop font-bold text-[18px] text-white leading-none">{fans}</p><p className="text-[10px] tracking-wider text-[#A8A29E]">FOLLOWERS</p></div>
          <div><p className="font-hoop font-bold text-[18px] text-white leading-none">{followingN}</p><p className="text-[10px] tracking-wider text-[#A8A29E]">FOLLOWING</p></div>
          {info.filter(([k]) => k === 'HEIGHT' || k === 'MEMBER SINCE').map(([k, v]) => (
            <div key={k}><p className="font-hoop font-bold text-[18px] text-white leading-none">{v}</p><p className="text-[10px] tracking-wider text-[#A8A29E]">{k}</p></div>
          ))}
        </div>
        <ErrorNote text={err} />
      </div>

      {/* CAREER AVERAGES */}
      <section className="space-y-2.5">
        <h2 className="font-hoop italic font-black text-[24px] uppercase text-white">Career averages</h2>
        <div className="grid grid-cols-4 gap-2">
          {([['PTS', s?.ppg, s?.pts], ['REB', s?.rpg, s?.reb], ['AST', s?.apg, s?.ast], ['STL', s?.spg, s?.stl], ['BLK', s?.bpg, s?.blk], ['3PM', s?.tpg, s?.threes], ['TO', s?.topg, s?.tov], ['PF', s?.fpg, s?.fouls]] as [string, number, number][]).map(([k, avg, tot], i) => (
            <div key={k} className="rounded-2xl p-2.5 text-center border border-white/10" style={{ background: i < 3 ? 'rgba(242,140,20,0.10)' : H.surface, borderColor: i < 3 ? 'rgba(242,140,20,0.35)' : undefined }}>
              <p className="text-[10px] font-bold tracking-wider" style={{ color: i < 3 ? H.orange : '#A8A29E' }}>{k}</p>
              <p className="font-hoop font-bold text-[24px] leading-tight text-white">{fmt1(avg)}</p>
              <p className="text-[9px] text-[#78716C]">{tot ?? 0} total</p>
            </div>
          ))}
        </div>
        {!s && <p className="text-[12px] text-[#A8A29E]">Stats show up here after {isMe ? 'your' : 'their'} first finished game.</p>}
      </section>

      {/* RECENT GAMES */}
      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-hoop italic font-black text-[24px] uppercase text-white">Recent games</h2>
          {recent.map((g) => {
            const mine = g.team === 'A' ? g.a : g.b, theirs = g.team === 'A' ? g.b : g.a;
            const res = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
            return (
              <button key={g.id} onClick={() => go({ name: 'hoopGame', id: g.id })} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/10 text-left cursor-pointer hover:bg-white/[0.03]" style={{ background: H.surface }}>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center font-hoop italic font-black text-[18px]" style={{ background: res === 'W' ? H.orange : res === 'L' ? '#3A3A3A' : '#57534E', color: res === 'W' ? '#111' : '#F4F1EE' }}>{res}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-white truncate">{g.title} · {mine}-{theirs}</span>
                  <span className="block text-[11px] text-[#A8A29E]">{gameDate(g.starts_at)} · {g.team === 'A' ? g.team_a : g.team_b}</span>
                </span>
                <span className="text-right font-mono text-[11px] text-[#D6D3D1] leading-tight"><strong className="text-white text-[13px]">{g.pts}</strong> pts<br />{g.reb} reb · {g.ast} ast</span>
              </button>
            );
          })}
        </section>
      )}

      <Props playerId={person.id} playerName={person.display_name} isMe={isMe} />

      {editing && <EditCard card={card} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {photoEdit && <CardPhotoEditor person={person} card={card} stats={s} onClose={() => setPhotoEdit(false)} onSaved={() => { setPhotoEdit(false); load(); }} />}
    </div>
  );
};

const EditCard: React.FC<{ card: HoopCard; onClose: () => void; onSaved: () => void }> = ({ card, onClose, onSaved }) => {
  const [num, setNum] = useState(card.jersey_number != null ? String(card.jersey_number) : '');
  const [pos, setPos] = useState(card.position || '');
  const [height, setHeight] = useState(card.height || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const n = num.trim() === '' ? null : Number(num);
    if (n !== null && !(n >= 0 && n <= 99)) return setErr('Jersey number should be 0 to 99.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_players').update({ jersey_number: n, position: pos || null, height: height.trim() || null }).eq('profile_id', card.profile_id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  };
  const lbl = 'block text-[12px] font-bold text-[#E7E5E4] mb-1';
  return (
    <Modal title="Edit my player card" onClose={onClose} footer={<>
      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={onClose} className={`${hbtn.ghost} flex-1`}>Cancel</button>
        <button onClick={save} disabled={busy} className={`${hbtn.primary} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>}>
      <p className="text-[12px] text-[#A8A29E]">Your photo and name come from your MINAW DAVAO profile.</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div><label className={lbl} htmlFor="hc-num">Jersey #</label><input id="hc-num" inputMode="numeric" className={hinput} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 23" /></div>
        <div><label className={lbl} htmlFor="hc-h">Height <span className="font-normal text-[#A8A29E]">(optional)</span></label><input id="hc-h" className={hinput} value={height} onChange={(e) => setHeight(e.target.value.slice(0, 12))} placeholder={'e.g. 5\'9"'} /></div>
      </div>
      <div>
        <p className={lbl}>Position</p>
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map((p) => (
            <button key={p} type="button" onClick={() => setPos(pos === p ? '' : p)} className={`h-8 px-3 rounded-full text-xs font-bold border cursor-pointer ${pos === p ? 'bg-[#F28C14] border-[#F28C14] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>{p}</button>
          ))}
        </div>
      </div>
    </Modal>
  );
};

// ===================================================================== CARD PHOTO (separate from the music profile photo)
/** Phone photos can be huge: scale to at most 1600 px and save as JPEG so uploads stay small (bucket limit 5 MB). */
async function shrinkPhoto(f: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (k === 1 && f.size < 1.5 * 1024 * 1024 && /jpe?g|png|webp/.test(f.type)) return f;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
    return blob ? new File([blob], 'hoop-card.jpg', { type: 'image/jpeg' }) : f;
  } catch { return f; }
}

const CardPhotoEditor: React.FC<{ person: HoopPerson; card: HoopCard; stats: HoopStats | null; onClose: () => void; onSaved: () => void }> = ({ person, card, stats, onClose, onSaved }) => {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(card.card_photo_url || null);
  const [crop, setCrop] = useState<CardCrop>(card.card_photo_url ? cropOf(card.card_photo_crop) : DEFAULT_CROP);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uploaded = useRef<string[]>([]);   // new uploads this time, removed again if not kept

  const pick = async (f: File) => {
    if (!f.type.startsWith('image/')) return setErr('Please pick a photo.');
    setUploading(true); setErr(null);
    try {
      const u = await uploadImage('avatars', user!.id, await shrinkPhoto(f));
      uploaded.current.push(u);
      setUrl(u); setCrop(DEFAULT_CROP);
    } catch (e) { setErr(errorMessage(e)); }
    setUploading(false);
  };
  const cleanup = (keep: string | null) => {
    uploaded.current.filter((u) => u !== keep).forEach((u) => removeImageByUrl(u));
    uploaded.current = [];
  };
  const close = () => { cleanup(null); onClose(); };
  const save = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_players').update({ card_photo_url: url, card_photo_crop: url ? crop : null }).eq('profile_id', card.profile_id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    cleanup(url);
    if (card.card_photo_url && card.card_photo_url !== url) removeImageByUrl(card.card_photo_url, [person.avatar_url]);
    onSaved();
  };

  return (
    <Modal title="My card photo" onClose={close} footer={<>
      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={close} className={`${hbtn.ghost} flex-1`}>Cancel</button>
        <button onClick={save} disabled={busy || uploading} className={`${hbtn.primary} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save card'}</button>
      </div>
    </>}>
      <p className="text-[12px] text-[#A8A29E]">Use an action shot or a hoops photo. It only shows on your Hoop Method card — your music profile photo stays the same.</p>
      <div className="mx-auto w-full max-w-[300px] px-2 py-3">
        <TradingCard person={person} card={card} stats={stats} photoUrl={url ?? person.avatar_url} crop={url ? crop : cropOf(null)} onCropChange={url ? setCrop : undefined} />
      </div>
      {url && (
        <div className="flex items-center gap-2.5">
          <ZoomIn className="w-4 h-4 text-[#A8A29E] flex-shrink-0" />
          <input type="range" min={1} max={3} step={0.05} value={crop.zoom} onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })} aria-label="Zoom card photo" className="flex-1 accent-[#F28C14]" />
          <button type="button" onClick={() => setCrop(DEFAULT_CROP)} className="flex items-center gap-1 text-[11px] font-bold text-[#A8A29E] hover:text-white cursor-pointer"><RotateCcw className="w-3.5 h-3.5" />Reset</button>
        </div>
      )}
      <p className="text-[11px] text-[#A8A29E] text-center">{url ? 'Drag the photo to choose what shows. Zoom with the slider.' : 'Showing your profile photo for now.'}</p>
      <div className="grid grid-cols-2 gap-2">
        <FilePick accept="image/*" onPick={pick} disabled={uploading} className={`${hbtn.primary} !py-2 !text-xs`}>
          <ImageIcon className="w-4 h-4" />{uploading ? 'Uploading…' : url ? 'Change photo' : 'Upload photo'}
        </FilePick>
        <button type="button" onClick={() => { setUrl(null); setCrop(DEFAULT_CROP); }} disabled={!url} className={`${hbtn.ghost} !py-2 !text-xs`}><Trash2 className="w-3.5 h-3.5" />Use profile photo</button>
      </div>
    </Modal>
  );
};

// ===================================================================== PROPS (basketball testimonials, need the player's approval)
interface Prop { id: string; player_id: string; author_id: string; message: string; status: 'pending' | 'approved'; created_at: string; author?: HoopPerson | null }

const Props: React.FC<{ playerId: string; playerName: string; isMe: boolean }> = ({ playerId, playerName, isMe }) => {
  const go = useNav();
  const { user } = useAuth();
  const [list, setList] = useState<Prop[]>([]);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('hoop_props').select(`*, author:profiles!hoop_props_author_id_fkey(${PERSON})`).eq('player_id', playerId).order('created_at', { ascending: false });
    setList((data as any as Prop[]) || []);
    if (user && !isMe) {
      const { data: me } = await supabase.from('hoop_players').select('profile_id').eq('profile_id', user.id).maybeSingle();
      setCanWrite(!!me);
    }
  }, [playerId, user?.id, isMe]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const mine = list.find((p) => p.author_id === user?.id);
  const shown = list.filter((p) => p.status === 'approved' || isMe || p.author_id === user?.id);
  const pending = isMe ? list.filter((p) => p.status === 'pending').length : 0;

  const submit = async () => {
    if (!user || text.trim().length < 2) return;
    setErr(null);
    const { error } = mine
      ? await supabase.from('hoop_props').update({ message: text.trim() }).eq('id', mine.id)
      : await supabase.from('hoop_props').insert({ player_id: playerId, author_id: user.id, message: text.trim() });
    if (error) return setErr(errorMessage(error));
    setText(''); setEditing(false); load();
  };
  const approve = async (p: Prop) => {
    const { error } = await supabase.from('hoop_props').update({ status: 'approved' }).eq('id', p.id);
    if (error) return setErr(errorMessage(error));
    load();
  };
  const remove = async (p: Prop) => {
    if (!confirm(isMe && p.author_id !== user?.id ? 'Remove these props from your card?' : 'Delete your props?')) return;
    const { error } = await supabase.from('hoop_props').delete().eq('id', p.id);
    if (error) return setErr(errorMessage(error));
    load();
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-end justify-between gap-2">
        <h2 className="font-hoop italic font-black text-[24px] uppercase text-white flex items-center gap-2"><MessageSquareQuote className="w-5 h-5 text-[#F28C14]" />Props</h2>
        {pending > 0 && <span className="px-2 py-0.5 rounded-full bg-[#F28C14] text-[#111] text-[10px] font-black">{pending} waiting for you</span>}
      </div>
      <p className="-mt-1.5 text-[11px] text-[#A8A29E]">Shout-outs from teammates and opponents.{isMe ? ' New props only show after you approve them.' : ''}</p>

      {!isMe && canWrite && (!mine || editing) && (
        <div className="p-3 rounded-2xl border border-white/10 space-y-2" style={{ background: H.surface }}>
          <textarea rows={3} maxLength={500} className={`${hinput} py-2.5 resize-none`} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Give ${playerName} some props — handles, defense, hustle…`} />
          <div className="flex gap-2 justify-end">
            {editing && <button onClick={() => { setEditing(false); setText(''); }} className={`${hbtn.ghost} !py-2 !text-xs`}>Cancel</button>}
            <button onClick={submit} disabled={text.trim().length < 2} className={`${hbtn.primary} !py-2 !text-xs`}>{mine ? 'Update props' : 'Send props'}</button>
          </div>
          <p className="text-[10px] text-[#78716C]">{playerName} approves props before they appear.</p>
        </div>
      )}
      {!isMe && !canWrite && user && <p className="text-[11px] text-[#A8A29E]">Book a game to start giving props.</p>}
      <ErrorNote text={err} />

      {shown.length === 0 && <p className="px-4 py-6 rounded-2xl border border-dashed border-white/15 text-center text-[12px] text-[#A8A29E]">No props yet.</p>}
      {shown.map((p) => (
        <div key={p.id} className={`p-3 rounded-2xl border space-y-2 ${p.status === 'pending' ? 'border-[#F28C14]/45' : 'border-white/10'}`} style={{ background: H.surface }}>
          <div className="flex items-center gap-2.5">
            <button onClick={() => go({ name: 'hoopPlayer', id: p.author_id })} className="cursor-pointer"><Avatar src={p.author?.avatar_url} name={p.author?.display_name} size={34} /></button>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-white truncate">{p.author?.display_name || 'Member'}</p>
              <p className="text-[10px] text-[#A8A29E]">{timeAgo(p.created_at)}{p.status === 'pending' && ' · waiting for approval'}</p>
            </div>
          </div>
          <p className="text-[13px] text-[#E7E5E4] leading-relaxed whitespace-pre-line">“{p.message}”</p>
          <div className="flex gap-2 justify-end">
            {isMe && p.status === 'pending' && <button onClick={() => approve(p)} className={`${hbtn.primary} !py-1.5 !px-3 !text-xs`}><Check className="w-3.5 h-3.5" />Approve</button>}
            {p.author_id === user?.id && <button onClick={() => { setText(p.message); setEditing(true); }} className={`${hbtn.ghost} !py-1.5 !px-3 !text-xs`}><Pencil className="w-3.5 h-3.5" />Edit</button>}
            {(isMe || p.author_id === user?.id) && <button onClick={() => remove(p)} className={`${hbtn.ghost} !py-1.5 !px-3 !text-xs`}>{isMe && p.author_id !== user?.id && p.status === 'pending' ? <><X className="w-3.5 h-3.5" />Decline</> : <><Trash2 className="w-3.5 h-3.5" />Remove</>}</button>}
          </div>
        </div>
      ))}
    </section>
  );
};

// ===================================================================== PLAYERS LIST / LEADERS
export const HoopPlayers: React.FC = () => {
  const go = useNav();
  const [rows, setRows] = useState<(HoopCard & { stats?: HoopStats })[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('hoop_players').select(`*, profiles!hoop_players_profile_id_fkey!inner(${PERSON}, is_suspended)`)
        .eq('profiles.is_suspended', false).limit(500);   // suspended accounts aren't listed
      const cards = ((data as any as HoopCard[]) || []).filter((c) => c.profiles && !(c.profiles as any).is_suspended);
      const st = await fetchStats(cards.map((c) => c.profile_id));
      setRows(cards.map((c) => ({ ...c, stats: st[c.profile_id] }))
        .sort((a, b) => (b.stats?.ppg ?? -1) - (a.stats?.ppg ?? -1) || (b.stats?.games ?? 0) - (a.stats?.games ?? 0) || a.profiles!.display_name.localeCompare(b.profiles!.display_name)));
    })();
  }, []);
  if (rows === null) return <Spinner label="Loading players…" />;

  const played = rows.filter((r) => r.stats?.games);
  const leader = (k: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'tpg') => [...played].sort((a, b) => (b.stats![k] ?? 0) - (a.stats![k] ?? 0))[0];
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => !term || r.profiles!.display_name.toLowerCase().includes(term) || r.profiles!.username.toLowerCase().includes(term));

  return (
    <div className="px-3 py-4 space-y-5">
      <h1 className="flex items-center gap-2.5 font-hoop italic font-black text-[30px] uppercase text-white leading-none">Players
        <span className="not-italic font-sans text-[12px] font-bold px-2.5 py-1 rounded-full bg-[#F28C14] text-[#111]">{rows.length} {rows.length === 1 ? 'player' : 'players'}</span>
      </h1>

      {played.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {([['ppg', 'Points'], ['rpg', 'Rebounds'], ['apg', 'Assists'], ['spg', 'Steals'], ['bpg', 'Blocks'], ['tpg', '3-Pointers']] as const).map(([k, label]) => {
            const r = leader(k);
            const unit = { ppg: 'PPG', rpg: 'RPG', apg: 'APG', spg: 'SPG', bpg: 'BPG', tpg: '3PM/G' }[k];
            if (!r || !(r.stats![k] > 0)) return (
              <div key={k} className="rounded-2xl p-2.5 text-center border border-white/10 flex flex-col items-center justify-center" style={{ background: H.surface }}>
                <p className="flex items-center justify-center gap-1 text-[9px] font-black tracking-wider text-[#A8A29E]"><Crown className="w-3 h-3" />{label.toUpperCase()}</p>
                <p className="mt-3 text-[11px] text-[#78716C]">No leader yet</p>
              </div>
            );
            return r ? (
              <button key={k} onClick={() => go({ name: 'hoopPlayer', id: r.profile_id })} className="rounded-2xl p-2.5 text-center border border-[#F28C14]/35 cursor-pointer" style={{ background: 'rgba(242,140,20,0.10)' }}>
                <p className="flex items-center justify-center gap-1 text-[9px] font-black tracking-wider text-[#F28C14]"><Crown className="w-3 h-3" />{label.toUpperCase()}</p>
                <span className="inline-block my-1.5"><Avatar src={r.profiles!.avatar_url} name={r.profiles!.display_name} size={44} /></span>
                <p className="text-[11px] font-bold text-white truncate">{r.profiles!.display_name}</p>
                <p className="font-hoop font-bold text-[20px] text-white leading-none">{fmt1(r.stats![k])}<span className="ml-1 text-[9px] font-sans font-bold text-[#A8A29E]">{unit}</span></p>
              </button>
            ) : null;
          })}
        </div>
      )}

      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" />
        <input type="text" inputMode="search" aria-label="Search players" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" className={`${hinput} !pl-9`} />
      </label>

      <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: H.surface }}>
        <div className="grid grid-cols-[1fr_repeat(4,40px)] px-3 py-2 text-[10px] font-bold tracking-wider text-[#A8A29E] border-b border-white/10">
          <span>PLAYER</span><span className="text-center">GP</span><span className="text-center">PPG</span><span className="text-center">RPG</span><span className="text-center">APG</span>
        </div>
        {shown.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-[#A8A29E]">No players yet. Book a game to get on the list!</p>}
        {shown.map((r, i) => (
          <button key={r.profile_id} onClick={() => go({ name: 'hoopPlayer', id: r.profile_id })} className="w-full grid grid-cols-[1fr_repeat(4,40px)] items-center px-3 py-2.5 border-b border-white/[0.05] last:border-0 text-left cursor-pointer hover:bg-white/[0.03]">
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="w-6 text-right text-[12px] font-bold text-[#F28C14] tabular-nums">{i + 1}.</span>
              <Avatar src={r.profiles!.avatar_url} name={r.profiles!.display_name} size={34} />
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-white truncate">{r.profiles!.display_name}</span>
                <span className="block text-[10px] text-[#A8A29E] truncate">{r.jersey_number != null ? `#${r.jersey_number}` : ''}{r.jersey_number != null && r.position ? ' · ' : ''}{r.position || ''}</span>
              </span>
            </span>
            {[r.stats?.games ?? 0, fmt1(r.stats?.ppg), fmt1(r.stats?.rpg), fmt1(r.stats?.apg)].map((v, j) => (
              <span key={j} className={`text-center font-mono text-[12px] ${j === 1 ? 'font-bold text-[#F28C14]' : 'text-[#E7E5E4]'}`}>{v}</span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
};

// ===================================================================== small summary on the MINAW (music) profile
export const HoopSummary: React.FC<{ profileId: string; isMe: boolean }> = ({ profileId, isMe }) => {
  const go = useNav();
  const [card, setCard] = useState<HoopCard | null | undefined>(undefined);
  const [st, setSt] = useState<HoopStats | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('hoop_players').select('*').eq('profile_id', profileId).maybeSingle();
      setCard((data as HoopCard) || null);
      if (data) setSt((await fetchStats([profileId]))[profileId] || null);
    })();
  }, [profileId]);
  if (!card) return null;
  return (
    <button onClick={() => go({ name: 'hoopPlayer', id: profileId })} className="w-full text-left rounded-3xl overflow-hidden border border-[#F28C14]/45 cursor-pointer" style={{ background: 'linear-gradient(160deg, rgba(242,140,20,0.22), #141414 70%)' }}>
      <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #F28C14, #F26A2E)' }} />
      <div className="p-3.5 space-y-3">
        <div className="flex items-center gap-2.5">
          <img src="/hoop-ball.png" alt="" className="w-9 h-9" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold tracking-[0.3em] text-[#F28C14]">SUNDAY HOOP METHOD</p>
            <p className="font-hoop italic font-black text-[18px] uppercase text-white leading-tight truncate">
              {card.jersey_number != null ? `#${card.jersey_number} · ` : ''}{card.position || 'Player'}
            </p>
          </div>
          <span className="text-[11px] font-bold text-[#F28C14]">{isMe ? 'My card' : 'Player card'} ›</span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[['GP', String(st?.games ?? 0)], ['PPG', fmt1(st?.ppg)], ['RPG', fmt1(st?.rpg)], ['APG', fmt1(st?.apg)]].map(([k, v]) => (
            <div key={k} className="py-2 rounded-xl bg-black/30 border border-white/10">
              <p className="font-hoop font-bold text-[20px] leading-none text-white">{v}</p>
              <p className="text-[9px] tracking-wider text-[#A8A29E]">{k}</p>
            </div>
          ))}
        </div>
        {st && <p className="text-[10px] text-[#D6D3D1]">{st.wins}-{st.losses} record · {fmt1(st.spg)} STL · {fmt1(st.bpg)} BLK per game · best game {st.best_pts} pts</p>}
      </div>
    </button>
  );
};
