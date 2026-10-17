import React, { useCallback, useEffect, useRef, useState } from 'react';
import { confirmDelete } from '../components/ConfirmDelete';
import {
  Ban, Camera, Check, Share2, Crown, Download, Hourglass, ImageIcon, Link2, MessageSquareQuote, Music, Pencil, RotateCcw, Search, Send, Trash2, UserMinus, UserPlus, X, ZoomIn,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, removeImageByUrl, timeAgo, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, ErrorNote, FilePick, Modal, Spinner } from '../components/ui';
import { AccountPicker } from '../components/MembersEditor';
import { MessageButton } from '../screens/MessagesScreen';
import { DEFAULT_CROP, cropOf, type CardCrop } from '../components/CardBackground';
import { cardBlob, socialPicture, type SocialFormat } from './TradingCard';
import { ShareSheet, type ReadyPicture } from './ShareSheet';
import { ClubCard, OwnerCardPreview, type CardLevel } from './ClubCard';
import { HoopFace } from './HoopFace';
import {
  H, MEMBER_COLS, PERSON, boxScore, fetchStats, fmt1, gameDate, hbtn, hinput, normEvent, personOf, themeVars, useClub,
  type HoopClub, type HoopEvent, type HoopMember, type HoopPerson, type HoopStats,
} from './lib';

const POSITIONS = ['Point Guard', 'Shooting Guard', 'Guard', 'Small Forward', 'Power Forward', 'Forward', 'Center', 'All-around'];
const lbl = 'block text-[12px] font-bold text-[#E7E5E4] mb-1';

// ===================================================================== PLAYER CARD (one per club)
export const HoopPlayerScreen: React.FC<{ id: string }> = ({ id }) => {
  const go = useNav();
  const { user } = useAuth();
  const { club, isAdmin } = useClub();
  const [m, setM] = useState<HoopMember | null | undefined>(undefined);
  const [stats, setStats] = useState<HoopStats | null>(null);
  const [recent, setRecent] = useState<{ id: string; title: string; starts_at: string; team: 'A' | 'B'; team_a: string; team_b: string; a: number; b: number; pts: number; reb: number; ast: number }[]>([]);
  const [fans, setFans] = useState(0);
  const [followingN, setFollowingN] = useState(0);
  const [iFollow, setIFollow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [photoEdit, setPhotoEdit] = useState(false);
  const [tryLevel, setTryLevel] = useState<CardLevel | null>(null);   // owner-only preview of card 2
  const [sharing, setSharing] = useState<SocialFormat | null>(null);
  const [ready, setReady] = useState<ReadyPicture | null>(null);   // picture made → ask before opening Instagram / Facebook
  const [linking, setLinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('hoop_members').select(MEMBER_COLS).eq('id', id).maybeSingle();
    const mem = (data as any as HoopMember) || null;
    setM(mem);
    if (!mem) return;
    const pid = mem.profile_id;
    const [st, fr, fg, mineF] = await Promise.all([
      fetchStats([id]),
      pid ? supabase.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', pid) : Promise.resolve({ count: 0 }),
      pid ? supabase.from('user_follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', pid) : Promise.resolve({ count: 0 }),
      pid && user && user.id !== pid ? supabase.from('user_follows').select('follower_id').eq('follower_id', user.id).eq('followee_id', pid).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setStats(st[id] || null);
    setFans((fr as any).count || 0); setFollowingN((fg as any).count || 0); setIFollow(!!(mineF as any).data);

    // last 5 finished games with this club card
    const { data: gp } = await supabase.from('hoop_game_players').select('team, hoop_games!inner(id, title, starts_at, ended_at, status, team_a, team_b)')
      .eq('member_id', id).not('team', 'is', null).eq('hoop_games.status', 'final').order('booked_at', { ascending: false }).limit(200);
    const when = (g: any) => g.ended_at || g.starts_at;
    const games = ((gp as any[]) || []).map((x) => ({ ...x.hoop_games, team: x.team }))
      .sort((x, y) => when(y).localeCompare(when(x))).slice(0, 5);
    if (games.length) {
      const { data: ev } = await supabase.from('hoop_events').select('*').in('game_id', games.map((g) => g.id));
      const all = ((ev as any[]) || []).map(normEvent) as HoopEvent[];
      setRecent(games.map((g) => {
        const bs = boxScore(all.filter((e) => e.game_id === g.id));
        const l = bs.lines[id];
        return { ...g, a: bs.score.A, b: bs.score.B, pts: l?.pts || 0, reb: l?.reb || 0, ast: l?.ast || 0 };
      }));
    } else setRecent([]);
  }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    const ch = supabase.channel(`hoop-card-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hoop_games' }, (p: any) => { if (p.new?.status === 'final' || p.old?.status === 'final') load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_members', filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, id]);

  if (m === undefined) return <Spinner label="Loading player…" />;
  if (m === null) return <p className="px-4 py-10 text-center text-[#A8A29E]">This player isn’t available.</p>;

  const person = personOf(m);
  const isMe = !!user && m.profile_id === user.id;
  const canEdit = isMe || isAdmin;
  const offline = !m.profile_id;
  const s = stats;

  const toggleFollow = async () => {
    if (!user || !m.profile_id) return;
    const { error } = iFollow
      ? await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('followee_id', m.profile_id)
      : await supabase.from('user_follows').insert({ follower_id: user.id, followee_id: m.profile_id });
    if (error) return setErr(errorMessage(error));
    load();
  };
  const saveShot = async () => {
    if (!shotRef.current || shotRef.current.querySelector('[data-card-loading]')) return;   // card still loading
    setSaving(true); setErr(null); setSaveNote(null);
    try {
      const blob = await cardBlob(shotRef.current);
      setReady({ blob, kind: 'card', fileName: `hoop-card-${person.display_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` });
    } catch (e) { setErr(errorMessage(e)); }
    setSaving(false);
  };
  const shareSocial = async (format: SocialFormat) => {
    if (!shotRef.current || shotRef.current.querySelector('[data-card-loading]') || saving || sharing) return;
    setSharing(format); setErr(null); setSaveNote(null);
    try {
      const blob = await socialPicture(shotRef.current, format, {
        clubName: club?.name, color: getComputedStyle(shotRef.current).getPropertyValue('--hp').trim(),
      });
      setReady({ blob, kind: format, fileName: `hoop-card-${format}-${person.display_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` });
    } catch (e) { setErr(errorMessage(e)); }
    setSharing(null);
  };
  const setStatus = async (status: HoopMember['status']) => {
    if (status === 'suspended' && !(await confirmDelete({ title: `Suspend ${person.display_name}?`, message: 'They can’t book games in this club until you unsuspend them. Their card and stats stay.', confirmLabel: 'Suspend' }))) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_members').update({ status }).eq('id', m.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    load();
  };
  const removeMember = async () => {
    if (!(await confirmDelete({
      title: m.status === 'pending' ? `Decline ${person.display_name}’s request?` : `Remove ${person.display_name} from ${club?.name || 'the club'}?`,
      message: m.status === 'pending' ? undefined : 'Their club card and career stats are deleted. Past box scores keep their name as a guest.',
      typeToConfirm: (s?.games ?? 0) > 0, confirmLabel: m.status === 'pending' ? 'Decline' : 'Remove player',
    }))) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_members').delete().eq('id', m.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    if (club) go({ name: 'hoopClub', club: club.id, tab: 'players' });
  };
  const link = async (profileId: string) => {
    setLinking(false); setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_members').update({ profile_id: profileId, name: null, photo_url: null }).eq('id', m.id);
    setBusy(false);
    if (error) return setErr(/duplicate|unique/i.test(error.message) ? 'That account already has a card in this club. Remove one of the cards first.' : errorMessage(error));
    load();
  };

  return (
    <div className="px-3 py-4 space-y-4">
      {m.status !== 'active' && (
        <div className={`p-3 rounded-2xl border text-[12px] font-bold flex items-center gap-2 ${m.status === 'pending' ? 'border-[var(--hp)]/45 bg-[var(--hp)]/10 text-white' : 'border-[#FF6B7A]/45 bg-[#FF6B7A]/10 text-[#FF8A9C]'}`}>
          {m.status === 'pending' ? <><Hourglass className="w-4 h-4 text-[var(--hp)]" />Waiting for approval</> : <><Ban className="w-4 h-4" />Suspended from this club</>}
        </div>
      )}

      <OwnerCardPreview memberId={m.id} value={tryLevel} onChange={setTryLevel} />

      {/* THE CARD (the padded box around it is what gets saved as a picture, glow included) */}
      <div ref={shotRef} className="-mx-1 px-[7%] py-[8%] rounded-[28px]" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #2A1606 0%, #0B0710 55%, #050508 100%)' }}>
        <ClubCard memberId={m.id} person={person} card={m} stats={s} club={club} level={tryLevel ?? undefined} />
      </div>

      <div className="space-y-2.5">
        {canEdit && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPhotoEdit(true)} className={`${hbtn.primary} !py-2.5 !text-xs`}><Camera className="w-4 h-4" />Card photo</button>
            <button onClick={saveShot} disabled={saving} className={`${hbtn.ghost} !py-2.5 !text-xs`}><Download className="w-4 h-4" />{saving ? 'Making picture…' : 'Save card image'}</button>
          </div>
        )}
        {isMe && (
          <div className="rounded-2xl p-2.5 space-y-2 border border-white/10" style={{ background: H.surface }}>
            <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[#E7E5E4]"><Share2 className="w-3.5 h-3.5 text-[var(--hp)]" />SHARE MY CARD</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => shareSocial('story')} disabled={!!sharing || saving} className={`${hbtn.ghost} !py-2.5 !text-xs flex-col !gap-0.5`}>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-4 rounded-[3px] border-2 border-current" />{sharing === 'story' ? 'Making…' : 'Story'}</span>
                <span className="text-[10px] font-normal text-[#A8A29E]">Facebook · Instagram</span>
              </button>
              <button onClick={() => shareSocial('post')} disabled={!!sharing || saving} className={`${hbtn.ghost} !py-2.5 !text-xs flex-col !gap-0.5`}>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3.5 rounded-[3px] border-2 border-current" />{sharing === 'post' ? 'Making…' : 'Post'}</span>
                <span className="text-[10px] font-normal text-[#A8A29E]">Instagram feed</span>
              </button>
            </div>
            <p className="text-[10px] text-[#78716C] text-center leading-snug">We make the picture first, then ask before opening Instagram or Facebook.</p>
          </div>
        )}
        {saveNote && <p className="text-center text-[11px] text-[#53E6D4]">{saveNote}</p>}
        <div className="flex gap-2">
          {canEdit && <button onClick={() => setEditing(true)} className={`${hbtn.ghost} flex-1 !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />{offline ? 'Edit player' : 'Jersey & position'}</button>}
          {!isMe && m.profile_id && <button onClick={toggleFollow} className={`${iFollow ? hbtn.ghost : hbtn.primary} flex-1 !py-2 !text-xs`}>{iFollow ? <><UserMinus className="w-3.5 h-3.5" />Following</> : <><UserPlus className="w-3.5 h-3.5" />Follow</>}</button>}
          {!canEdit && <button onClick={saveShot} disabled={saving} className={`${hbtn.ghost} !py-2 !px-3 !text-xs`} aria-label="Save card image"><Download className="w-3.5 h-3.5" /></button>}
          {m.profile_id && <button onClick={() => go({ name: 'profile', id: m.profile_id! })} className={`${hbtn.ghost} flex-1 !py-2 !text-xs`}><Music className="w-3.5 h-3.5 text-[#53E6D4]" />Music profile</button>}
        </div>
        <div className="flex items-center justify-around text-center py-1">
          {m.profile_id && <div><p className="font-hoop font-bold text-[18px] text-white leading-none">{fans}</p><p className="text-[10px] tracking-wider text-[#A8A29E]">FOLLOWERS</p></div>}
          {m.profile_id && <div><p className="font-hoop font-bold text-[18px] text-white leading-none">{followingN}</p><p className="text-[10px] tracking-wider text-[#A8A29E]">FOLLOWING</p></div>}
          {m.height && <div><p className="font-hoop font-bold text-[18px] text-white leading-none">{m.height}</p><p className="text-[10px] tracking-wider text-[#A8A29E]">HEIGHT</p></div>}
          <div><p className="font-hoop font-bold text-[18px] text-white leading-none">{new Date(m.approved_at || m.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase()}</p><p className="text-[10px] tracking-wider text-[#A8A29E]">MEMBER SINCE</p></div>
        </div>
        {offline && <p className="text-center text-[11px] text-[#A8A29E]">Added by the club (not on the app). Stats are saved on this card.</p>}
        <ErrorNote text={err} />
      </div>

      {/* CLUB ADMIN TOOLS */}
      {isAdmin && !isMe && (
        <section className="rounded-2xl p-3 space-y-2 border border-[var(--hp)]/40" style={{ background: 'color-mix(in srgb, var(--hp) 6%, transparent)' }}>
          <p className="text-[11px] font-black tracking-wider text-[var(--hp)]">CLUB ADMIN</p>
          {m.note && m.status === 'pending' && <p className="text-[12px] text-[#E7E5E4] italic">“{m.note}”</p>}
          <div className="flex flex-wrap gap-2">
            {m.status === 'pending' && <button onClick={() => setStatus('active')} disabled={busy} className={`${hbtn.primary} !py-2 !text-xs`}><Check className="w-3.5 h-3.5" />Approve card</button>}
            {m.status === 'active' && <button onClick={() => setStatus('suspended')} disabled={busy} className={`${hbtn.ghost} !py-2 !text-xs`}><Ban className="w-3.5 h-3.5" />Suspend</button>}
            {m.status === 'suspended' && <button onClick={() => setStatus('active')} disabled={busy} className={`${hbtn.ghost} !py-2 !text-xs`}><RotateCcw className="w-3.5 h-3.5" />Unsuspend</button>}
            {offline && <button onClick={() => setLinking(!linking)} disabled={busy} className={`${hbtn.ghost} !py-2 !text-xs`}><Link2 className="w-3.5 h-3.5" />Link to an account</button>}
            {m.profile_id && <MessageButton to={m.profile_id} label="Message" className={`${hbtn.ghost} !py-2 !text-xs`} />}
            <button onClick={removeMember} disabled={busy} className={`${hbtn.ghost} !py-2 !text-xs !text-[#FF6B7A]`}><Trash2 className="w-3.5 h-3.5" />{m.status === 'pending' ? 'Decline' : 'Remove from club'}</button>
          </div>
          {linking && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-[#A8A29E]">When this player makes a MINAW DAVAO account, link it here. Their card, games and stats move to their account.</p>
              <AccountPicker autoFocus roles={['fan']} onPick={(p) => link(p.id)} onCancel={() => setLinking(false)} />
            </div>
          )}
        </section>
      )}

      {/* CAREER AVERAGES */}
      <section className="space-y-2.5">
        <h2 className="font-hoop italic font-black text-[24px] uppercase text-white">Career averages</h2>
        <div className="grid grid-cols-4 gap-2">
          {([['PTS', s?.ppg, s?.pts], ['REB', s?.rpg, s?.reb], ['AST', s?.apg, s?.ast], ['STL', s?.spg, s?.stl], ['BLK', s?.bpg, s?.blk], ['3PM', s?.tpg, s?.threes], ['TO', s?.topg, s?.tov], ['PF', s?.fpg, s?.fouls]] as [string, number, number][]).map(([k, avg, tot], i) => (
            <div key={k} className="rounded-2xl p-2.5 text-center border border-white/10" style={{ background: i < 3 ? 'color-mix(in srgb, var(--hp) 10%, transparent)' : H.surface, borderColor: i < 3 ? 'color-mix(in srgb, var(--hp) 35%, transparent)' : undefined }}>
              <p className="text-[10px] font-bold tracking-wider" style={{ color: i < 3 ? H.orange : '#A8A29E' }}>{k}</p>
              <p className="font-hoop font-bold text-[24px] leading-tight text-white">{fmt1(avg)}</p>
              <p className="text-[9px] text-[#78716C]">{tot ?? 0} total</p>
            </div>
          ))}
        </div>
        {!s && <p className="text-[12px] text-[#A8A29E]">Stats show up here after {isMe ? 'your' : 'their'} first finished game in this club.</p>}
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

      {m.profile_id && <Props playerId={m.profile_id} playerName={person.display_name} isMe={isMe} />}

      {editing && <EditCard member={m} canName={offline && isAdmin} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {ready && <ShareSheet pic={ready} onClose={() => setReady(null)} />}
      {photoEdit && <CardPhotoEditor person={person} member={m} stats={s} club={club} level={tryLevel ?? undefined} onClose={() => setPhotoEdit(false)} onSaved={() => { setPhotoEdit(false); load(); }} />}
    </div>
  );
};

// ===================================================================== MY CARD tab: join request → approval → card
export const MyClubCard: React.FC = () => {
  const { user } = useAuth();
  const { club, me, isAdmin, reload } = useClub();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!club || !user) return null;
  if (me?.status === 'active') return <HoopPlayerScreen id={me.id} />;

  if (!me) return <JoinForm club={club} asAdmin={isAdmin} onSent={reload} />;

  const person = personOf(me);
  const cancel = async () => {
    if (!(await confirmDelete({ title: 'Cancel your join request?', confirmLabel: 'Cancel request' }))) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_members').delete().eq('id', me.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    reload();
  };
  return (
    <div className="px-3 py-4 space-y-4">
      {me.status === 'pending' ? (
        <div className="p-3.5 rounded-2xl border border-[var(--hp)]/45 space-y-1.5" style={{ background: 'color-mix(in srgb, var(--hp) 9%, transparent)' }}>
          <p className="flex items-center gap-2 font-hoop italic font-black text-[22px] uppercase text-white leading-none"><Hourglass className="w-5 h-5 text-[var(--hp)]" />Waiting for approval</p>
          <p className="text-[12px] text-[#D6D3D1]">Your player card was sent to {club.name}. Once a club admin approves it, your card goes live and you can book games. You’ll get a notification.</p>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl border border-[#FF6B7A]/45 bg-[#FF6B7A]/[0.07] space-y-1.5">
          <p className="flex items-center gap-2 font-hoop italic font-black text-[22px] uppercase text-white leading-none"><Ban className="w-5 h-5 text-[#FF8A9C]" />Suspended</p>
          <p className="text-[12px] text-[#D6D3D1]">Your card in this club is suspended, so you can’t book games here for now. Message the club admin if you have questions.</p>
        </div>
      )}
      <div className="mx-auto max-w-[300px] opacity-70 pointer-events-none" aria-hidden>
        <ClubCard memberId={me.id} person={person} card={me} stats={null} club={club} />
      </div>
      <ErrorNote text={err} />
      <div className="flex flex-col gap-2">
        {club.owner_id && <MessageButton to={club.owner_id} label="Message the club admin" draft={me.status === 'pending' ? `Hi! I sent my player card to join ${club.name}. ` : ''} className={`${hbtn.primary} w-full`} />}
        {me.status === 'pending' && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className={`${hbtn.ghost} flex-1 !text-xs`}><Pencil className="w-3.5 h-3.5" />Edit my card</button>
            <button onClick={cancel} disabled={busy} className={`${hbtn.ghost} flex-1 !text-xs`}><X className="w-3.5 h-3.5" />Cancel request</button>
          </div>
        )}
      </div>
      {editing && <EditCard member={me} canName={false} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </div>
  );
};

/** New player: fill in the card, send it, and wait for a club admin to approve it. */
const JoinForm: React.FC<{ club: HoopClub; asAdmin: boolean; onSent: () => void }> = ({ club, asAdmin, onSent }) => {
  const { user, profile } = useAuth();
  const [num, setNum] = useState('');
  const [pos, setPos] = useState('');
  const [height, setHeight] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    const n = num.trim() === '' ? null : Number(num);
    if (n === null) return setErr('Please pick a jersey number (0 to 99).');
    if (!(n >= 0 && n <= 99)) return setErr('Jersey number should be 0 to 99.');
    if (!pos) return setErr('Please pick your position.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_members').insert({
      club_id: club.id, profile_id: user!.id, jersey_number: n, position: pos, height: height.trim() || null, note: note.trim() || null,
      ...(asAdmin ? { status: 'active' } : {}),
    });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSent();
  };
  const preview = { display_name: profile?.display_name || 'Player', avatar_url: profile?.avatar_url || null };
  return (
    <div className="px-3 py-4 space-y-4">
      <div className="space-y-1">
        <p className="font-hoop italic font-black text-[28px] uppercase text-white leading-none">Join {club.name}</p>
        <p className="text-[12px] text-[#A8A29E]">{asAdmin ? 'You run this club, so your card goes live right away.' : 'Fill in your player card. A club admin checks it first — your card is made once they approve it.'}</p>
      </div>
      <div className="mx-auto max-w-[260px]">
        <ClubCard person={preview} card={{ jersey_number: num === '' ? null : Number(num), position: pos || null }} stats={null} club={club} />
      </div>
      <div className="space-y-3 p-3.5 rounded-2xl border border-white/10" style={{ background: H.surface }}>
        <div className="grid grid-cols-2 gap-2.5">
          <div><label className={lbl} htmlFor="hj-num">Jersey #</label><input id="hj-num" inputMode="numeric" className={hinput} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 23" /></div>
          <div><label className={lbl} htmlFor="hj-h">Height <span className="font-normal text-[#A8A29E]">(optional)</span></label><input id="hj-h" className={hinput} value={height} onChange={(e) => setHeight(e.target.value.slice(0, 12))} placeholder={'e.g. 5\'9"'} /></div>
        </div>
        <div>
          <p className={lbl}>Position</p>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map((p) => (
              <button key={p} type="button" onClick={() => setPos(pos === p ? '' : p)} className={`h-8 px-3 rounded-full text-xs font-bold border cursor-pointer ${pos === p ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>{p}</button>
            ))}
          </div>
        </div>
        {!asAdmin && (
          <div><label className={lbl} htmlFor="hj-note">Message to the club admin <span className="font-normal text-[#A8A29E]">(optional)</span></label>
            <textarea id="hj-note" rows={2} maxLength={300} className={`${hinput} py-2.5 resize-none`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Invited by Coach Ben, I play every Sunday." /></div>
        )}
        <p className="text-[11px] text-[#A8A29E]">Your name and photo come from your MINAW DAVAO profile. You can add a card photo after you’re approved.</p>
        <ErrorNote text={err} />
        <button onClick={send} disabled={busy} className={`${hbtn.primary} w-full`}><Send className="w-4 h-4" />{busy ? 'Sending…' : asAdmin ? 'Create my card' : 'Send for approval'}</button>
        {club.owner_id && !asAdmin && <MessageButton to={club.owner_id} label="Ask the club admin first" draft={`Hi! I’d like to know more about ${club.name}. `} className={`${hbtn.ghost} w-full !py-2 !text-xs`} />}
      </div>
    </div>
  );
};

const EditCard: React.FC<{ member: HoopMember; canName: boolean; onClose: () => void; onSaved: () => void }> = ({ member, canName, onClose, onSaved }) => {
  const { user } = useAuth();
  const [name, setName] = useState(member.name || '');
  const [photo, setPhoto] = useState<string | null>(member.photo_url);
  const [num, setNum] = useState(member.jersey_number != null ? String(member.jersey_number) : '');
  const [pos, setPos] = useState(member.position || '');
  const [height, setHeight] = useState(member.height || '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (f: File) => {
    setUploading(true); setErr(null);
    try { setPhoto(await uploadImage('avatars', user!.id, await shrinkPhoto(f, 800))); } catch (e) { setErr(errorMessage(e)); }
    setUploading(false);
  };
  const save = async () => {
    const n = num.trim() === '' ? null : Number(num);
    if (n !== null && !(n >= 0 && n <= 99)) return setErr('Jersey number should be 0 to 99.');
    if (canName && name.trim().length < 1) return setErr('Please enter the player’s name.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_members').update({
      jersey_number: n, position: pos || null, height: height.trim() || null, ...(canName ? { name: name.trim(), photo_url: photo } : {}),
    }).eq('id', member.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    if (canName && member.photo_url && member.photo_url !== photo) removeImageByUrl(member.photo_url, [member.card_photo_url]);
    onSaved();
  };
  return (
    <Modal title={canName ? 'Edit player' : 'Edit player card'} onClose={onClose} footer={<>
      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={onClose} className={`${hbtn.ghost} flex-1`}>Cancel</button>
        <button onClick={save} disabled={busy || uploading} className={`${hbtn.primary} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>}>
      {canName ? (
        <>
          <div className="flex items-center gap-3">
            <Avatar src={photo} name={name} size={56} />
            <FilePick accept="image/*" onPick={pick} disabled={uploading} className={`${hbtn.ghost} !py-2 !text-xs`}><ImageIcon className="w-4 h-4" />{uploading ? 'Uploading…' : photo ? 'Change photo' : 'Add photo'}</FilePick>
          </div>
          <div><label className={lbl} htmlFor="he-name">Name</label><input id="he-name" className={hinput} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
        </>
      ) : <p className="text-[12px] text-[#A8A29E]">The photo and name come from the MINAW DAVAO profile.</p>}
      <div className="grid grid-cols-2 gap-2.5">
        <div><label className={lbl} htmlFor="hc-num">Jersey #</label><input id="hc-num" inputMode="numeric" className={hinput} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 23" /></div>
        <div><label className={lbl} htmlFor="hc-h">Height <span className="font-normal text-[#A8A29E]">(optional)</span></label><input id="hc-h" className={hinput} value={height} onChange={(e) => setHeight(e.target.value.slice(0, 12))} placeholder={'e.g. 5\'9"'} /></div>
      </div>
      <div>
        <p className={lbl}>Position</p>
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map((p) => (
            <button key={p} type="button" onClick={() => setPos(pos === p ? '' : p)} className={`h-8 px-3 rounded-full text-xs font-bold border cursor-pointer ${pos === p ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>{p}</button>
          ))}
        </div>
      </div>
    </Modal>
  );
};

// ===================================================================== ADD AN OFFLINE PLAYER (club admin)
export const AddOfflinePlayer: React.FC<{ clubId: string; onClose: () => void; onSaved: () => void }> = ({ clubId, onClose, onSaved }) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [num, setNum] = useState('');
  const [pos, setPos] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (f: File) => {
    setUploading(true); setErr(null);
    try { setPhoto(await uploadImage('avatars', user!.id, await shrinkPhoto(f, 800))); } catch (e) { setErr(errorMessage(e)); }
    setUploading(false);
  };
  const close = () => { if (photo) removeImageByUrl(photo); onClose(); };
  const save = async () => {
    if (name.trim().length < 1) return setErr('Please enter the player’s name.');
    const n = num.trim() === '' ? null : Number(num);
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_members').insert({ club_id: clubId, name: name.trim(), photo_url: photo, jersey_number: n, position: pos || null, status: 'active' });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  };
  return (
    <Modal title="Add a player without the app" onClose={close} footer={<>
      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={close} className={`${hbtn.ghost} flex-1`}>Cancel</button>
        <button onClick={save} disabled={busy || uploading} className={`${hbtn.primary} flex-1`}><Check className="w-4 h-4" />{busy ? 'Adding…' : 'Add player'}</button>
      </div>
    </>}>
      <p className="text-[12px] text-[#A8A29E]">For players who don’t use the internet. They get a full player card and their stats are saved. If they make an account later, you can link it from their card.</p>
      <div className="flex items-center gap-3">
        <Avatar src={photo} name={name || '?'} size={56} />
        <FilePick accept="image/*" onPick={pick} disabled={uploading} className={`${hbtn.ghost} !py-2 !text-xs`}><ImageIcon className="w-4 h-4" />{uploading ? 'Uploading…' : photo ? 'Change photo' : 'Add photo (optional)'}</FilePick>
      </div>
      <div><label className={lbl} htmlFor="ho-name">Name</label><input id="ho-name" autoFocus className={hinput} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Tatay Romy" /></div>
      <div><label className={lbl} htmlFor="ho-num">Jersey # <span className="font-normal text-[#A8A29E]">(optional)</span></label><input id="ho-num" inputMode="numeric" className={hinput} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 2))} /></div>
      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.map((p) => (
          <button key={p} type="button" onClick={() => setPos(pos === p ? '' : p)} className={`h-8 px-3 rounded-full text-xs font-bold border cursor-pointer ${pos === p ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>{p}</button>
        ))}
      </div>
    </Modal>
  );
};

// ===================================================================== PICK A PLAYER FOR A GAME (club admin)
/** Club members first (including players without the app); any Fan account can be added too — that also approves their card. */
export const MemberPicker: React.FC<{
  clubId: string; exclude: string[]; excludeAccounts: string[];
  onPick: (p: { member_id?: string; profile_id?: string }) => void; onCancel: () => void;
}> = ({ clubId, exclude, excludeAccounts, onPick, onCancel }) => {
  const [list, setList] = useState<HoopMember[] | null>(null);
  const [q, setQ] = useState('');
  const [other, setOther] = useState(false);
  useEffect(() => {
    supabase.from('hoop_members').select(MEMBER_COLS).eq('club_id', clubId).in('status', ['active', 'pending']).limit(500)
      .then(({ data }) => setList(((data as any as HoopMember[]) || []).filter((m) => !m.profiles?.is_suspended)));
  }, [clubId]);
  const term = q.trim().toLowerCase();
  const shown = (list || []).filter((m) => !exclude.includes(m.id) && (!term || personOf(m).display_name.toLowerCase().includes(term) || personOf(m).username.toLowerCase().includes(term)))
    .sort((a, b) => personOf(a).display_name.localeCompare(personOf(b).display_name)).slice(0, 30);
  if (other) return <AccountPicker autoFocus roles={['fan']} exclude={[...excludeAccounts, ...(list || []).map((m) => m.profile_id || '')].filter(Boolean)} onPick={(p) => onPick({ profile_id: p.id })} onCancel={() => setOther(false)} />;
  return (
    <div className="p-2.5 rounded-xl border border-white/15 bg-[#151515] space-y-2">
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" />
        <input autoFocus type="text" inputMode="search" aria-label="Search club players" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search club players" className={`${hinput} !pl-9`} />
      </label>
      {list === null ? <Spinner /> : shown.length === 0 ? <p className="py-2 text-center text-[12px] text-[#A8A29E]">No club player found.</p> : (
        <div className="max-h-64 overflow-y-auto space-y-1">
          {shown.map((m) => {
            const p = personOf(m);
            return (
              <button key={m.id} onClick={() => onPick({ member_id: m.id })} className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/[0.06] text-left cursor-pointer">
                <HoopFace avatar={p.avatar_url} name={p.display_name} cardPhoto={m.card_photo_url} cardCrop={m.card_photo_crop} size={30} />
                <span className="flex-1 min-w-0 text-[13px] font-bold text-white truncate">{p.display_name}{m.jersey_number != null && <span className="ml-1 text-[#A8A29E] font-normal">#{m.jersey_number}</span>}</span>
                {!m.profile_id && <span className="px-1 rounded text-[8px] font-black bg-white/15 text-[#D6D3D1]">NO APP</span>}
                {m.status === 'pending' && <span className="px-1 rounded text-[8px] font-black bg-[var(--hp)]/20 text-[var(--hp)]">PENDING</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => setOther(true)} className={`${hbtn.ghost} flex-1 !py-1.5 !text-xs`}><UserPlus className="w-3.5 h-3.5" />Someone not in the club</button>
        <button onClick={onCancel} className={`${hbtn.ghost} !py-1.5 !text-xs`}>Close</button>
      </div>
    </div>
  );
};

// ===================================================================== CARD PHOTO (separate from the music profile photo)
/** Phone photos can be huge: scale down and save as JPEG so uploads stay small (bucket limit 5 MB). */
export async function shrinkPhoto(f: File, max = 1600): Promise<File> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && f.size < 1.5 * 1024 * 1024 && /jpe?g|png|webp/.test(f.type)) return f;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
    return blob ? new File([blob], 'hoop-photo.jpg', { type: 'image/jpeg' }) : f;
  } catch { return f; }
}

const CardPhotoEditor: React.FC<{ person: HoopPerson; member: HoopMember; stats: HoopStats | null; club: HoopClub | null; level?: CardLevel; onClose: () => void; onSaved: () => void }> = ({ person, member, stats, club, level, onClose, onSaved }) => {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(member.card_photo_url || null);
  const [crop, setCrop] = useState<CardCrop>(member.card_photo_url ? cropOf(member.card_photo_crop) : DEFAULT_CROP);
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
    const { error } = await supabase.from('hoop_members').update({ card_photo_url: url, card_photo_crop: url ? crop : null }).eq('id', member.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    cleanup(url);
    if (member.card_photo_url && member.card_photo_url !== url) {
      // keep the old file if it's (also) the profile photo or another club card
      const [{ data: pr }, { data: others }] = await Promise.all([
        member.profile_id ? supabase.from('profiles').select('avatar_url').eq('id', member.profile_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('hoop_members').select('id').eq('card_photo_url', member.card_photo_url).neq('id', member.id).limit(1),
      ]);
      if (!((others as any[]) || []).length) removeImageByUrl(member.card_photo_url, [person.avatar_url, (pr as any)?.avatar_url, member.photo_url]);
    }
    onSaved();
  };

  return (
    <Modal title="Card photo" onClose={close} footer={<>
      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={close} className={`${hbtn.ghost} flex-1`}>Cancel</button>
        <button onClick={save} disabled={busy || uploading} className={`${hbtn.primary} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save card'}</button>
      </div>
    </>}>
      <p className="text-[12px] text-[#A8A29E]">Use an action shot or a hoops photo for this club card. {!member.profile_id ? '' : person.avatar_url ? 'The music profile photo stays the same.' : 'Since there’s no profile photo yet, this will be used as the profile photo too.'}</p>
      <div className="mx-auto w-full max-w-[300px] px-2 py-3">
        <ClubCard memberId={member.id} level={level} person={person} card={member} stats={stats} club={club} photoUrl={url ?? person.avatar_url} crop={url ? crop : cropOf(null)} onCropChange={url ? setCrop : undefined} />
      </div>
      {url && (
        <div className="flex items-center gap-2.5">
          <ZoomIn className="w-4 h-4 text-[#A8A29E] flex-shrink-0" />
          <input type="range" min={1} max={3} step={0.05} value={crop.zoom} onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })} aria-label="Zoom card photo" className="flex-1 accent-[var(--hp)]" />
          <button type="button" onClick={() => setCrop(DEFAULT_CROP)} className="flex items-center gap-1 text-[11px] font-bold text-[#A8A29E] hover:text-white cursor-pointer"><RotateCcw className="w-3.5 h-3.5" />Reset</button>
        </div>
      )}
      <p className="text-[11px] text-[#A8A29E] text-center">{url ? 'Drag the photo to choose what shows. Zoom with the slider.' : 'Showing the profile photo for now.'}</p>
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
      const { data: me } = await supabase.from('hoop_members').select('id').eq('profile_id', user.id).eq('status', 'active').limit(1);
      setCanWrite(!!((me as any[]) || []).length);
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
    if (!(await confirmDelete({ title: isMe && p.author_id !== user?.id ? 'Remove these props from your card?' : 'Delete your props?' }))) return;
    const { error } = await supabase.from('hoop_props').delete().eq('id', p.id);
    if (error) return setErr(errorMessage(error));
    load();
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-end justify-between gap-2">
        <h2 className="font-hoop italic font-black text-[24px] uppercase text-white flex items-center gap-2"><MessageSquareQuote className="w-5 h-5 text-[var(--hp)]" />Props</h2>
        {pending > 0 && <span className="px-2 py-0.5 rounded-full bg-[var(--hp)] text-[#111] text-[10px] font-black">{pending} waiting for you</span>}
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
      {!isMe && !canWrite && user && <p className="text-[11px] text-[#A8A29E]">Join a club to start giving props.</p>}
      <ErrorNote text={err} />

      {shown.length === 0 && <p className="px-4 py-6 rounded-2xl border border-dashed border-white/15 text-center text-[12px] text-[#A8A29E]">No props yet.</p>}
      {shown.map((p) => (
        <div key={p.id} className={`p-3 rounded-2xl border space-y-2 ${p.status === 'pending' ? 'border-[var(--hp)]/45' : 'border-white/10'}`} style={{ background: H.surface }}>
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

// ===================================================================== PLAYERS LIST / LEADERS (one club)
export const HoopPlayers: React.FC = () => {
  const go = useNav();
  const { club } = useClub();
  const [rows, setRows] = useState<(HoopMember & { stats?: HoopStats })[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('hoop_members').select(MEMBER_COLS).eq('club_id', club!.id).eq('status', 'active').limit(500);
      const cards = ((data as any as HoopMember[]) || []).filter((c) => !c.profiles?.is_suspended);   // suspended accounts aren't listed
      const st = await fetchStats(cards.map((c) => c.id));
      const name = (c: HoopMember) => personOf(c).display_name;
      setRows(cards.map((c) => ({ ...c, stats: st[c.id] }))
        .sort((a, b) => (b.stats?.ppg ?? -1) - (a.stats?.ppg ?? -1) || (b.stats?.games ?? 0) - (a.stats?.games ?? 0) || name(a).localeCompare(name(b))));
    })();
  }, [club?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (rows === null) return <Spinner label="Loading players…" />;

  const played = rows.filter((r) => r.stats?.games);
  const leader = (k: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'tpg') => [...played].sort((a, b) => (b.stats![k] ?? 0) - (a.stats![k] ?? 0))[0];
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => { const p = personOf(r); return !term || p.display_name.toLowerCase().includes(term) || p.username.toLowerCase().includes(term); });

  return (
    <div className="px-3 py-4 space-y-5">
      <h1 className="flex items-center gap-2.5 font-hoop italic font-black text-[30px] uppercase text-white leading-none">Players
        <span className="not-italic font-sans text-[12px] font-bold px-2.5 py-1 rounded-full bg-[var(--hp)] text-[#111]">{rows.length} {rows.length === 1 ? 'player' : 'players'}</span>
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
            const p = personOf(r);
            return (
              <button key={k} onClick={() => go({ name: 'hoopPlayer', id: r.id })} className="rounded-2xl p-2.5 text-center border border-[var(--hp)]/35 cursor-pointer" style={{ background: 'color-mix(in srgb, var(--hp) 10%, transparent)' }}>
                <p className="flex items-center justify-center gap-1 text-[9px] font-black tracking-wider text-[var(--hp)]"><Crown className="w-3 h-3" />{label.toUpperCase()}</p>
                <span className="inline-block my-1.5"><HoopFace avatar={p.avatar_url} name={p.display_name} cardPhoto={r.card_photo_url} cardCrop={r.card_photo_crop} size={44} /></span>
                <p className="text-[11px] font-bold text-white truncate">{p.display_name}</p>
                <p className="font-hoop font-bold text-[20px] text-white leading-none">{fmt1(r.stats![k])}<span className="ml-1 text-[9px] font-sans font-bold text-[#A8A29E]">{unit}</span></p>
              </button>
            );
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
        {shown.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-[#A8A29E]">No players yet.</p>}
        {shown.map((r, i) => {
          const p = personOf(r);
          return (
            <button key={r.id} onClick={() => go({ name: 'hoopPlayer', id: r.id })} className="w-full grid grid-cols-[1fr_repeat(4,40px)] items-center px-3 py-2.5 border-b border-white/[0.05] last:border-0 text-left cursor-pointer hover:bg-white/[0.03]">
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="w-6 text-right text-[12px] font-bold text-[var(--hp)] tabular-nums">{i + 1}.</span>
                <HoopFace avatar={p.avatar_url} name={p.display_name} cardPhoto={r.card_photo_url} cardCrop={r.card_photo_crop} size={34} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-white truncate">{p.display_name}</span>
                  <span className="block text-[10px] text-[#A8A29E] truncate">{[r.jersey_number != null ? `#${r.jersey_number}` : '', r.position || '', !r.profile_id ? 'no app' : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </span>
              {[r.stats?.games ?? 0, fmt1(r.stats?.ppg), fmt1(r.stats?.rpg), fmt1(r.stats?.apg)].map((v, j) => (
                <span key={j} className={`text-center font-mono text-[12px] ${j === 1 ? 'font-bold text-[var(--hp)]' : 'text-[#E7E5E4]'}`}>{v}</span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ===================================================================== small summary on the MINAW (music) profile — one per club
export const HoopSummary: React.FC<{ profileId: string; isMe: boolean }> = ({ profileId, isMe }) => {
  const go = useNav();
  const [cards, setCards] = useState<(HoopMember & { club: HoopClub })[]>([]);
  const [st, setSt] = useState<Record<string, HoopStats>>({});
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('hoop_members').select('*, club:hoop_clubs(*)').eq('profile_id', profileId).eq('status', 'active').order('created_at');
      const list = ((data as any[]) || []).filter((x) => x.club);
      setCards(list);
      if (list.length) setSt(await fetchStats(list.map((x) => x.id)));
    })();
  }, [profileId]);
  if (!cards.length) return null;
  return (
    <div className="space-y-2.5">
      {cards.map((card) => {
        const s = st[card.id];
        return (
          <button key={card.id} onClick={() => go({ name: 'hoopPlayer', id: card.id })} style={themeVars(card.club.theme)}
            className="w-full text-left rounded-3xl overflow-hidden border border-[var(--hp)]/45 cursor-pointer bg-[#141414]">
            <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, var(--hp), var(--ha))' }} />
            <div className="p-3.5 space-y-3" style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--hp) 22%, transparent), #141414 70%)' }}>
              <div className="flex items-center gap-2.5">
                <img src={card.club.logo_url || '/hoop-ball.png'} alt="" className="w-9 h-9 rounded-full object-cover bg-[#F6EFEC]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold tracking-[0.2em] text-[var(--hp)] truncate uppercase">{card.club.name}</p>
                  <p className="font-hoop italic font-black text-[18px] uppercase text-white leading-tight truncate">
                    {card.jersey_number != null ? `#${card.jersey_number} · ` : ''}{card.position || 'Player'}
                  </p>
                </div>
                <span className="text-[11px] font-bold text-[var(--hp)]">{isMe ? 'My card' : 'Player card'} ›</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['GP', String(s?.games ?? 0)], ['PPG', fmt1(s?.ppg)], ['RPG', fmt1(s?.rpg)], ['APG', fmt1(s?.apg)]].map(([k, v]) => (
                  <div key={k} className="py-2 rounded-xl bg-black/30 border border-white/10">
                    <p className="font-hoop font-bold text-[20px] leading-none text-white">{v}</p>
                    <p className="text-[9px] tracking-wider text-[#A8A29E]">{k}</p>
                  </div>
                ))}
              </div>
              {s && <p className="text-[10px] text-[#D6D3D1]">{s.wins}-{s.losses} record · {fmt1(s.spg)} STL · {fmt1(s.bpg)} BLK per game · best game {s.best_pts} pts</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
};
