import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check, ChevronDown, Clock, MapPin, ScrollText, Users, X } from 'lucide-react';
import { MessageButton } from '../screens/MessagesScreen';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ErrorNote, Modal, Spinner } from '../components/ui';
import { H, hbtn, hinput, gameDate, gameTime, type HoopGame } from './lib';

type Row = HoopGame & { hoop_game_players: { profile_id: string; team: string | null }[] };

export const HoopGames: React.FC = () => {
  const go = useNav();
  const { user, isModerator } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scores, setScores] = useState<Record<string, { score_a: number; score_b: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const scoreT = useRef<ReturnType<typeof setTimeout>>();   // live scores: one refresh per burst of taps
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 45 * 864e5).toISOString();
    const { data } = await supabase.from('hoop_games').select('*, hoop_game_players(profile_id, team)').gte('starts_at', since).order('starts_at');
    const list = (data as Row[]) || [];
    setRows(list);
    const done = list.filter((g) => g.status === 'live' || g.status === 'final').map((g) => g.id);
    if (done.length) {
      const { data: s } = await supabase.from('hoop_game_scores').select('*').in('game_id', done);
      const m: Record<string, { score_a: number; score_b: number }> = {};
      ((s as any[]) || []).forEach((x) => { m[x.game_id] = x; });
      setScores(m);
    }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel(`hoop-list-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_games' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_game_players' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_events' }, () => { clearTimeout(scoreT.current); scoreT.current = setTimeout(load, 800); })
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
      period_seconds: parent.period_seconds, team_a: parent.team_a, team_b: parent.team_b, created_by: user?.id,
    }).select('id').single();
    setBusy(null);
    if (error) return setErr(errorMessage(error));
    go({ name: 'hoopGame', id: (data as any).id });
  };
  const book = async (g: Row, mine: boolean) => {
    if (!user) return;
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
              {g.status === 'live' && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F26A2E] text-[9px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}
              {g.status === 'cancelled' && <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-bold text-[#A8A29E]">CANCELLED</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#A8A29E]">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#F28C14]" />{gameTime(g.starts_at)}</span>
              {g.venue && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 text-[#F28C14]" />{g.venue}</span>}
            </span>
            {parent.closed_at && !lg
              ? <span className="block text-[12px] font-bold text-white">Finished · {[parent, ...kids(parent)].filter((x) => x.status === 'final').length} game{[parent, ...kids(parent)].filter((x) => x.status === 'final').length === 1 ? '' : 's'} · tap for scores</span>
              : extra > 0 && !lg
              ? <span className="block text-[12px] font-bold text-white">{[parent, ...kids(parent)].filter((x) => x.status === 'final').length} games played · tap for scores</span>
              : sc && (g.status === 'final' || g.status === 'live')
              ? <span className="block font-hoop italic font-extrabold text-[17px] text-white">{g.team_a} <span className={sc.score_a >= sc.score_b ? 'text-[#F28C14]' : ''}>{sc.score_a}</span> – <span className={sc.score_b >= sc.score_a ? 'text-[#F28C14]' : ''}>{sc.score_b}</span> {g.team_b}</span>
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
              ? <button onClick={() => book(g, true)} disabled={busy === g.id} className={`${hbtn.ghost} w-full !py-2`}><Check className="w-4 h-4 text-[#F28C14]" />You’re in · Cancel my slot</button>
              : <button onClick={() => book(g, false)} disabled={busy === g.id || full} className={`${hbtn.primary} w-full !py-2`}>{full ? 'Game is full' : 'Book my slot'}</button>}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="px-3 py-4 space-y-5">
      {/* hero */}
      <div className="rounded-3xl overflow-hidden" style={{ background: H.cream }}>
        <img src="/hoop-method-logo.jpg" alt="Sunday Hoop Method" className="w-full max-h-56 object-contain" />
      </div>
      <ClubRules adminId={rows.find((g) => g.created_by && g.created_by !== user?.id)?.created_by ?? null} />

      <ErrorNote text={err} />

      {isModerator && live.length > 0 && (
        <button onClick={() => go({ name: 'hoopGame', id: liveOf(live[0])!.id })}
          className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left cursor-pointer border border-[#F26A2E]/60 animate-[pulse_2.5s_ease-in-out_infinite]" style={{ background: 'rgba(242,106,46,0.18)' }}>
          <span className="w-3 h-3 rounded-full bg-[#F26A2E] flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block font-hoop italic font-black text-[18px] uppercase text-white">Resume live game</span>
            <span className="block text-[11px] text-[#E7E5E4]">Your game is still running — score, clock and stats are all saved.</span>
          </span>
        </button>
      )}

      {isModerator && (
        <button onClick={() => setCreating(true)} className={`${hbtn.primary} w-full`}><CalendarPlus className="w-4 h-4" />Schedule a game</button>
      )}

      {live.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="font-hoop italic font-black text-[22px] uppercase text-[#F26A2E]">Live now</h2>
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
  const [f, setF] = useState({
    title: game?.title ?? 'Sunday Run', venue: game?.venue ?? '', when: localInput(game ? new Date(game.starts_at) : nextSunday()),
    slots: String(game?.slots ?? 15), minutes: String(Math.round((game?.period_seconds ?? 600) / 60)), notes: game?.notes ?? '',
    team_a: game?.team_a ?? 'Team Orange', team_b: game?.team_b ?? 'Team Gray',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const slots = Number(f.slots), minutes = Number(f.minutes);
    if (!f.title.trim()) return setErr('Please give the game a name.');
    if (!f.when || Number.isNaN(new Date(f.when).getTime())) return setErr('Please pick a date and time.');
    if (!(slots >= 2 && slots <= 60)) return setErr('Slots should be between 2 and 60.');
    if (!(minutes >= 1 && minutes <= 60)) return setErr('Minutes per period should be between 1 and 60.');
    setBusy(true); setErr(null);
    const row = {
      title: f.title.trim(), venue: f.venue.trim() || null, starts_at: new Date(f.when).toISOString(), slots, period_seconds: minutes * 60,
      notes: f.notes.trim() || null, team_a: f.team_a.trim() || 'Team Orange', team_b: f.team_b.trim() || 'Team Gray',
    };
    const res = game
      ? await supabase.from('hoop_games').update(row).eq('id', game.id).select('id').single()
      : await supabase.from('hoop_games').insert({ ...row, created_by: user?.id }).select('id').single();
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
      <div className="grid grid-cols-2 gap-2.5">
        <div><label className={lbl} htmlFor="hg-slots">Player slots</label><input id="hg-slots" inputMode="numeric" className={hinput} value={f.slots} onChange={(e) => setF({ ...f, slots: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></div>
        <div><label className={lbl} htmlFor="hg-min">Minutes / period</label><input id="hg-min" inputMode="numeric" className={hinput} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></div>
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

// ---------------------------------------------------------------- club rules (top of the Games screen)
const RULES: [string, string][] = [
  ['Book ahead', 'Slots are limited, so book your slot before game day.'],
  ['Pay ahead', 'Pay before the schedule. If your slot is still unpaid a day before the game, it may be given to someone else or removed.'],
  ['Proper attire', 'Wear proper basketball shoes and clothes — no slippers, no improper attire, no jewelry.'],
  ['Play at your own risk', 'This is just a friendly game, so take care of yourself and each other. The club has no budget for injuries and can’t pay for medicine or hospital bills. Members may chip in as a group to help, but the club can’t shoulder the cost.'],
  ['The app can have bugs', 'If something looks wrong with slots, schedules or stats, let the admin know.'],
  ['We’re still growing', 'The club isn’t perfect. Concerns or suggestions? Message the admin (God) anytime.'],
];

const ClubRules: React.FC<{ adminId: string | null }> = ({ adminId }) => {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('hoop-rules-seen') !== '1'; } catch { return true; } });
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem('hoop-rules-seen', v ? '0' : '1'); } catch { /* ignore */ } };
  return (
    <section className="rounded-2xl border border-[#F28C14]/35 overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(242,140,20,0.13), rgba(17,17,17,0.6))' }}>
      <button onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer">
        <ScrollText className="w-5 h-5 text-[#F28C14] flex-shrink-0" />
        <span className="flex-1">
          <span className="block font-sans font-bold text-[15px] text-white">Club rules</span>
          <span className="block text-[11px] text-[#A8A29E]">Please read before you book</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[#A8A29E] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <ol className="space-y-2.5">
            {RULES.map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F28C14] text-[#111] text-[12px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <span className="text-[13px] leading-relaxed text-[#E7E5E4]"><strong className="text-white">{title}.</strong> {text}</span>
              </li>
            ))}
          </ol>
          <p className="text-[13px] font-semibold text-[#F28C14]">Good luck, and let’s enjoy every game!</p>
          {adminId && <MessageButton to={adminId} label="Message the admin" className={`${hbtn.ghost} w-full !py-2 !text-xs`} />}
        </div>
      )}
    </section>
  );
};
