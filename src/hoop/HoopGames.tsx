import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check, ChevronDown, Clock, Hourglass, IdCard, MapPin, ScrollText, Users, X } from 'lucide-react';
import { MessageButton } from '../screens/MessagesScreen';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ErrorNote, Modal, Spinner } from '../components/ui';
import { H, hbtn, hinput, gameDate, gameTime, parseRules, useClub, type HoopClub, type HoopGame } from './lib';

type Row = HoopGame & { hoop_game_players: { profile_id: string; team: string | null }[] };

export const HoopGames: React.FC = () => {
  const go = useNav();
  const { user } = useAuth();
  const { club: c, isAdmin: isModerator, me } = useClub();
  const club = c!;
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scores, setScores] = useState<Record<string, { score_a: number; score_b: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const scoreT = useRef<ReturnType<typeof setTimeout>>();   // live scores: one refresh per burst of taps
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 45 * 864e5).toISOString();
    const [{ data }, { data: ph }] = await Promise.all([
      supabase.from('hoop_games').select('*, hoop_game_players(profile_id, team)').eq('club_id', club.id).gte('starts_at', since).order('starts_at'),
      supabase.from('hoop_club_photos').select('id, url').eq('club_id', club.id).order('created_at', { ascending: false }).limit(30),
    ]);
    setPhotos((ph as any[]) || []);
    const list = (data as Row[]) || [];
    setRows(list);
    const done = list.filter((g) => g.status === 'live' || g.status === 'final').map((g) => g.id);
    if (done.length) {
      const { data: s } = await supabase.from('hoop_game_scores').select('*').in('game_id', done);
      const m: Record<string, { score_a: number; score_b: number }> = {};
      ((s as any[]) || []).forEach((x) => { m[x.game_id] = x; });
      setScores(m);
    }
  }, [club.id]);

  const idsRef = useRef<Set<string>>(new Set());   // this club's games — ignore live updates from other clubs
  useEffect(() => { idsRef.current = new Set((rows || []).map((g) => g.id)); }, [rows]);
  const ours = (p: any) => { const gid = p.new?.game_id ?? p.old?.game_id; return !gid || idsRef.current.has(gid); };

  useEffect(() => {
    load();
    const ch = supabase.channel(`hoop-list-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_games', filter: `club_id=eq.${club.id}` }, () => load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hoop_games' }, (p: any) => { if (idsRef.current.has(p.old?.id)) load(); })   // deletes skip filters
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_game_players' }, (p: any) => { if (ours(p)) load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_events' }, (p: any) => { if (!ours(p)) return; clearTimeout(scoreT.current); scoreT.current = setTimeout(load, 800); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  /** Admin: another game for the same schedule and the same booked players. */
  const anotherGame = async (parent: Row) => {
    const n = rows!.filter((x) => x.session_id === parent.id).length + 2;
    if (!confirm(`Start Game ${n} of “${parent.title}”?\n\nSame booked players — you’ll pick new teams. “Games played today” shows who played the least.`)) return;
    setBusy(parent.id); setErr(null);
    const { data, error } = await supabase.from('hoop_games').insert({
      session_id: parent.id, title: parent.title, venue: parent.venue, starts_at: new Date().toISOString(), slots: parent.slots,
      period_seconds: parent.period_seconds, periods: parent.periods ?? 4, team_a: parent.team_a, team_b: parent.team_b, created_by: user?.id,
    }).select('id').single();
    setBusy(null);
    if (error) return setErr(errorMessage(error));
    go({ name: 'hoopGame', id: (data as any).id });
  };
  const book = async (g: Row, mine: boolean) => {
    if (!user) return;
    if (!mine && me?.status !== 'active' && !isModerator) return go({ name: 'hoopClub', club: club.id, tab: 'me' });
    setBusy(g.id); setErr(null);
    const { error } = mine
      ? await supabase.from('hoop_game_players').delete().eq('game_id', g.id).eq('profile_id', user.id)
      : await supabase.from('hoop_game_players').insert({ game_id: g.id, profile_id: user.id });
    setBusy(null);
    if (error) return setErr(errorMessage(error));
    load();
  };

  if (rows === null) return <Spinner label="Loading games…" />;
  // a schedule = its first game + any extra games ("Game 2, 3…") played the same day
  const parents = rows.filter((g) => !g.session_id);
  const kids = (g: Row) => rows.filter((x) => x.session_id === g.id);
  const liveOf = (g: Row) => (g.status === 'live' ? g : kids(g).find((x) => x.status === 'live'));
  const live = parents.filter((g) => liveOf(g));
  // newest first: the latest scheduled game on top, the most recently finished result on top
  const upcoming = parents.filter((g) => !liveOf(g) && (g.status === 'scheduled' || (isModerator && g.status === 'cancelled' && new Date(g.starts_at) > new Date())))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const lastPlayed = (g: Row) => [g, ...kids(g)].map((x) => x.ended_at || x.started_at || x.starts_at).sort().pop() || g.starts_at;
  const results = parents.filter((g) => !liveOf(g) && g.status === 'final')
    .sort((a, b) => lastPlayed(b).localeCompare(lastPlayed(a))).slice(0, 10);

  const card = (parent: Row) => {
    const lg = liveOf(parent);
    const g = lg || parent;
    const extra = kids(parent).length;
    const booked = parent.hoop_game_players.length;
    const mine = !!user && parent.hoop_game_players.some((p) => p.profile_id === user.id);
    const full = booked >= parent.slots;
    const sc = scores[g.id];
    const started = new Date(g.starts_at).getTime() < Date.now();
    return (
      <article key={g.id} className="rounded-2xl overflow-hidden border border-white/10" style={{ background: H.surface }}>
        <button onClick={() => go({ name: 'hoopGame', id: g.id })} className="w-full flex items-stretch text-left cursor-pointer">
          <span className="w-[78px] flex-shrink-0 flex flex-col items-center justify-center py-3" style={{ background: g.status === 'live' ? H.ball : g.status === 'final' ? '#2A2A2A' : H.orange, color: g.status === 'final' ? '#F4F1EE' : '#111' }}>
            <span className="text-[10px] font-bold uppercase tracking-wider">{new Date(g.starts_at).toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="font-hoop italic font-black text-[30px] leading-none">{new Date(g.starts_at).getDate()}</span>
            <span className="text-[10px] font-bold uppercase">{new Date(g.starts_at).toLocaleDateString(undefined, { month: 'short' })}</span>
          </span>
          <span className="flex-1 min-w-0 p-3 space-y-1">
            <span className="flex items-center gap-2">
              <span className="font-hoop italic font-extrabold text-[19px] uppercase text-white truncate">{g.title}{extra > 0 && lg ? ` · G${kids(parent).indexOf(lg) + 2}` : ''}</span>
              {g.status === 'live' && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--ha)] text-[9px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}
              {g.status === 'cancelled' && <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-bold text-[#A8A29E]">CANCELLED</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#A8A29E]">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[var(--hp)]" />{gameTime(g.starts_at)}</span>
              {g.venue && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 text-[var(--hp)]" />{g.venue}</span>}
            </span>
            {parent.closed_at && !lg
              ? <span className="block text-[12px] font-bold text-white">Finished · {[parent, ...kids(parent)].filter((x) => x.status === 'final').length} game{[parent, ...kids(parent)].filter((x) => x.status === 'final').length === 1 ? '' : 's'} · tap for scores</span>
              : extra > 0 && !lg
              ? <span className="block text-[12px] font-bold text-white">{[parent, ...kids(parent)].filter((x) => x.status === 'final').length} games played · tap for scores</span>
              : sc && (g.status === 'final' || g.status === 'live')
              ? <span className="block font-hoop italic font-extrabold text-[17px] text-white">{g.team_a} <span className={sc.score_a >= sc.score_b ? 'text-[var(--hp)]' : ''}>{sc.score_a}</span> – <span className={sc.score_b >= sc.score_a ? 'text-[var(--hp)]' : ''}>{sc.score_b}</span> {g.team_b}</span>
              : (
                <span className="flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, (booked / parent.slots) * 100)}%`, background: full ? H.ball : H.orange }} /></span>
                  <span className="text-[11px] font-bold text-[#E7E5E4] flex items-center gap-1"><Users className="w-3 h-3" />{booked}/{parent.slots}</span>
                </span>
              )}
          </span>
        </button>
        {isModerator && !lg && !parent.closed_at && [parent, ...kids(parent)].every((x) => x.status === 'final') && (
          <div className="mx-3 mt-1 mb-3 pt-3 border-t border-white/10">
            <button onClick={() => anotherGame(parent)} disabled={busy === parent.id} className={`${hbtn.primary} w-full !py-2`}>+ Play Game {extra + 2} on this schedule</button>
          </div>
        )}
        {parent.status === 'scheduled' && !started && !lg && (
          <div className="mx-3 mt-1 mb-3 pt-3 border-t border-white/10">
            {mine
              ? <button onClick={() => book(g, true)} disabled={busy === g.id} className={`${hbtn.ghost} w-full !py-2`}><Check className="w-4 h-4 text-[var(--hp)]" />You’re in · Cancel my slot</button>
              : me?.status === 'active' || isModerator
              ? <button onClick={() => book(g, false)} disabled={busy === g.id || full} className={`${hbtn.primary} w-full !py-2`}>{full ? 'Game is full' : 'Book my slot'}</button>
              : <button onClick={() => go({ name: 'hoopClub', club: club.id, tab: 'me' })} className={`${hbtn.ghost} w-full !py-2 !text-xs`}>{me?.status === 'pending' ? 'Waiting for the club to approve your card' : me?.status === 'suspended' ? 'You can’t book in this club' : 'Join this club to book'}</button>}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="px-3 py-4 space-y-5">
      <ClubHero club={club} photos={photos} />
      {!isModerator && me?.status !== 'active' && <JoinBanner club={club} status={me?.status} />}
      <ClubRules club={club} />

      <ErrorNote text={err} />

      {isModerator && live.length > 0 && (
        <button onClick={() => go({ name: 'hoopGame', id: liveOf(live[0])!.id })}
          className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left cursor-pointer border border-[var(--ha)]/60 animate-[pulse_2.5s_ease-in-out_infinite]" style={{ background: 'color-mix(in srgb, var(--ha) 18%, transparent)' }}>
          <span className="w-3 h-3 rounded-full bg-[var(--ha)] flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block font-hoop italic font-black text-[18px] uppercase text-white">Resume live game</span>
            <span className="block text-[11px] text-[#E7E5E4]">Your game is still running — score, clock and stats are all saved.</span>
          </span>
        </button>
      )}

      {isModerator && (
        <div className="flex gap-2">
          <button onClick={() => setCreating(true)} className={`${hbtn.primary} flex-1`}><CalendarPlus className="w-4 h-4" />Schedule a game</button>
        </div>
      )}

      {live.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="font-hoop italic font-black text-[22px] uppercase text-[var(--ha)]">Live now</h2>
          {live.map(card)}
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">Schedule</h2>
        {upcoming.length === 0
          ? <p className="px-4 py-8 rounded-2xl border border-dashed border-white/15 text-center text-[13px] text-[#A8A29E]">No games scheduled yet. Check back soon!</p>
          : upcoming.map(card)}
      </section>

      {results.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">Results</h2>
          {results.map(card)}
        </section>
      )}

      {creating && <GameForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); go({ name: 'hoopGame', id }); }} />}
    </div>
  );
};

const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); d.setHours(16, 0, 0, 0); return d; };

/** Admin: new game, or edit an existing one. */
export const GameForm: React.FC<{ game?: HoopGame; onClose: () => void; onSaved: (id: string) => void }> = ({ game, onClose, onSaved }) => {
  const { user } = useAuth();
  const { club } = useClub();
  const [f, setF] = useState({
    title: game?.title ?? 'Sunday Run', venue: game?.venue ?? '', when: localInput(game ? new Date(game.starts_at) : nextSunday()),
    slots: String(game?.slots ?? 15), periods: String(game?.periods ?? 4), minutes: String(Math.round((game?.period_seconds ?? 600) / 60)), notes: game?.notes ?? '',
    team_a: game?.team_a ?? 'Team Orange', team_b: game?.team_b ?? 'Team Gray',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const slots = Number(f.slots), minutes = Number(f.minutes), periods = Number(f.periods);
    if (!f.title.trim()) return setErr('Please give the game a name.');
    if (!f.when || Number.isNaN(new Date(f.when).getTime())) return setErr('Please pick a date and time.');
    if (!(slots >= 2 && slots <= 60)) return setErr('Slots should be between 2 and 60.');
    if (!(minutes >= 1 && minutes <= 60)) return setErr('Minutes per period should be between 1 and 60.');
    if (!(periods >= 1 && periods <= 8)) return setErr('Periods should be between 1 and 8.');
    setBusy(true); setErr(null);
    const row = {
      title: f.title.trim(), venue: f.venue.trim() || null, starts_at: new Date(f.when).toISOString(), slots, periods, period_seconds: minutes * 60,
      notes: f.notes.trim() || null, team_a: f.team_a.trim() || 'Team Orange', team_b: f.team_b.trim() || 'Team Gray',
    };
    const res = game
      ? await supabase.from('hoop_games').update(row).eq('id', game.id).select('id').single()
      : await supabase.from('hoop_games').insert({ ...row, club_id: club?.id, created_by: user?.id }).select('id').single();
    // renamed / moved schedule: its Game 2, 3… follow
    if (!res.error && game && !game.session_id) await supabase.from('hoop_games').update({ title: row.title, venue: row.venue }).eq('session_id', game.id);
    setBusy(false);
    if (res.error) return setErr(errorMessage(res.error));
    onSaved((res.data as any).id);
  };

  const lbl = 'block text-[12px] font-bold text-[#E7E5E4] mb-1';
  return (
    <Modal title={game ? 'Edit game' : 'Schedule a game'} onClose={onClose} footer={
      <>
        <ErrorNote text={err} />
        <div className="flex gap-2">
          <button onClick={onClose} className={`${hbtn.ghost} flex-1`}><X className="w-4 h-4" />Cancel</button>
          <button onClick={save} disabled={busy} className={`${hbtn.primary} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : game ? 'Save' : 'Schedule'}</button>
        </div>
      </>
    }>
      <div><label className={lbl} htmlFor="hg-title">Game name</label><input id="hg-title" className={hinput} value={f.title} onChange={set('title')} maxLength={80} /></div>
      <div><label className={lbl} htmlFor="hg-when">Date &amp; time</label><input id="hg-when" type="datetime-local" className={hinput} value={f.when} onChange={set('when')} /></div>
      <div><label className={lbl} htmlFor="hg-venue">Court / venue</label><input id="hg-venue" className={hinput} value={f.venue} onChange={set('venue')} placeholder="e.g. Matina covered court" maxLength={120} /></div>
      <div className="grid grid-cols-3 gap-2.5">
        <div><label className={lbl} htmlFor="hg-slots">Player slots</label><input id="hg-slots" inputMode="numeric" className={hinput} value={f.slots} onChange={(e) => setF({ ...f, slots: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></div>
        <div><label className={lbl} htmlFor="hg-per">Periods</label><input id="hg-per" inputMode="numeric" className={hinput} value={f.periods} onChange={(e) => setF({ ...f, periods: e.target.value.replace(/\D/g, '').slice(0, 1) })} /></div>
        <div><label className={lbl} htmlFor="hg-min">Min / period</label><input id="hg-min" inputMode="numeric" className={hinput} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div><label className={lbl} htmlFor="hg-a">Team 1 name</label><input id="hg-a" className={hinput} value={f.team_a} onChange={set('team_a')} maxLength={30} /></div>
        <div><label className={lbl} htmlFor="hg-b">Team 2 name</label><input id="hg-b" className={hinput} value={f.team_b} onChange={set('team_b')} maxLength={30} /></div>
      </div>
      <div><label className={lbl} htmlFor="hg-notes">Notes <span className="font-normal text-[#A8A29E]">(optional)</span></label><textarea id="hg-notes" rows={3} className={`${hinput} py-2.5 resize-none`} value={f.notes} onChange={set('notes')} maxLength={500} placeholder="Bring a white and a dark shirt, ₱50 court fee…" /></div>
      <p className="text-[11px] text-[#A8A29E]">{gameDate(new Date(f.when || Date.now()).toISOString())} · {gameTime(new Date(f.when || Date.now()).toISOString())}</p>
    </Modal>
  );
};

// ---------------------------------------------------------------- club header, join banner, rules
const ClubHero: React.FC<{ club: HoopClub; photos: { id: string; url: string }[] }> = ({ club, photos }) => {
  const [big, setBig] = useState<string | null>(null);
  const cover = club.cover_url || club.logo_url;
  return (
    <div className="space-y-2.5">
      {cover
        ? <div className="rounded-3xl overflow-hidden" style={{ background: H.cream }}><img src={cover} alt={club.name} className="w-full max-h-56 object-contain" /></div>
        : (
          <div className="rounded-3xl p-5 text-center" style={{ background: 'linear-gradient(140deg, var(--hp), var(--ha))' }}>
            <p className="font-hoop italic font-black text-[32px] uppercase text-[#111] leading-none">{club.name}</p>
          </div>
        )}
      {(club.tagline || club.location || club.description) && (
        <div className="space-y-1 px-1">
          {club.tagline && <p className="font-hoop italic font-extrabold text-[18px] uppercase text-white leading-tight">{club.tagline}</p>}
          {club.location && <p className="flex items-center gap-1 text-[11px] text-[#A8A29E]"><MapPin className="w-3 h-3 text-[var(--hp)]" />{club.location}</p>}
          {club.description && <p className="text-[12px] text-[#D6D3D1] leading-relaxed whitespace-pre-line">{club.description}</p>}
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-3 px-3 pb-1">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setBig(p.url)} className="flex-shrink-0 w-28 h-20 rounded-xl overflow-hidden border border-white/10 cursor-pointer" aria-label="Open photo">
              <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {big && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-3" onClick={() => setBig(null)} role="dialog" aria-label="Photo">
          <img src={big} alt="" className="max-w-full max-h-full rounded-xl" />
          <button onClick={() => setBig(null)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  );
};

const JoinBanner: React.FC<{ club: HoopClub; status?: string }> = ({ club, status }) => {
  const go = useNav();
  if (status === 'suspended') return (
    <div className="p-3.5 rounded-2xl border border-[#FF6B7A]/40 bg-[#FF6B7A]/[0.07] space-y-2">
      <p className="text-[13px] font-bold text-white">Your card in this club is suspended.</p>
      {club.owner_id && <MessageButton to={club.owner_id} label="Message the club admin" className={`${hbtn.ghost} w-full !py-2 !text-xs`} />}
    </div>
  );
  return (
    <div className="p-3.5 rounded-2xl border border-[var(--hp)]/45 space-y-2.5" style={{ background: 'color-mix(in srgb, var(--hp) 9%, transparent)' }}>
      {status === 'pending' ? (
        <>
          <p className="flex items-center gap-2 text-[14px] font-bold text-white"><Hourglass className="w-4 h-4 text-[var(--hp)]" />Your player card is waiting for approval</p>
          <p className="text-[12px] text-[#D6D3D1]">A club admin will check your request. You can book games once you’re approved.</p>
        </>
      ) : (
        <>
          <p className="font-hoop italic font-black text-[20px] uppercase text-white leading-none">Play with {club.name}</p>
          <p className="text-[12px] text-[#D6D3D1]">Fill in your player card and send it to the club. Once an admin approves it, you can book games and your stats are saved on your card.</p>
          <button onClick={() => go({ name: 'hoopClub', club: club.id, tab: 'me' })} className={`${hbtn.primary} w-full`}><IdCard className="w-4 h-4" />Join this club</button>
        </>
      )}
      {club.owner_id && <MessageButton to={club.owner_id} label="Ask the club admin a question" draft={`Hi! I’d like to know more about ${club.name}. `} className={`${hbtn.ghost} w-full !py-2 !text-xs`} />}
    </div>
  );
};

const ClubRules: React.FC<{ club: HoopClub }> = ({ club }) => {
  const rules = parseRules(club.rules);
  const k = `hoop-rules-seen-${club.id}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(k) !== '1'; } catch { return true; } });
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(k, v ? '0' : '1'); } catch { /* ignore */ } };
  if (!rules.length) return null;
  return (
    <section className="rounded-2xl border border-[var(--hp)]/35 overflow-hidden" style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--hp) 13%, transparent), rgba(17,17,17,0.6))' }}>
      <button onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer">
        <ScrollText className="w-5 h-5 text-[var(--hp)] flex-shrink-0" />
        <span className="flex-1">
          <span className="block font-sans font-bold text-[15px] text-white">Club rules</span>
          <span className="block text-[11px] text-[#A8A29E]">Please read before you book</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[#A8A29E] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <ol className="space-y-2.5">
            {rules.map(([title, text], i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[var(--hp)] text-[#111] text-[12px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <span className="text-[13px] leading-relaxed text-[#E7E5E4]">{title && <strong className="text-white">{title}. </strong>}{text}</span>
              </li>
            ))}
          </ol>
          <p className="text-[13px] font-semibold text-[var(--hp)]">Good luck, and let’s enjoy every game!</p>
          {club.owner_id && <MessageButton to={club.owner_id} label="Message the admin" className={`${hbtn.ghost} w-full !py-2 !text-xs`} />}
        </div>
      )}
    </section>
  );
};
