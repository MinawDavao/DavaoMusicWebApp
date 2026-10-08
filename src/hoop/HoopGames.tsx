import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Check, Clock, MapPin, Users, X } from 'lucide-react';
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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

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
  const live = rows.filter((g) => g.status === 'live');
  const upcoming = rows.filter((g) => g.status === 'scheduled' || (isModerator && g.status === 'cancelled' && new Date(g.starts_at) > new Date()));
  const results = rows.filter((g) => g.status === 'final').reverse().slice(0, 10);

  const card = (g: Row) => {
    const booked = g.hoop_game_players.length;
    const mine = !!user && g.hoop_game_players.some((p) => p.profile_id === user.id);
    const full = booked >= g.slots;
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
              <span className="font-hoop italic font-extrabold text-[19px] uppercase text-white truncate">{g.title}</span>
              {g.status === 'live' && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F26A2E] text-[9px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}
              {g.status === 'cancelled' && <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-bold text-[#A8A29E]">CANCELLED</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#A8A29E]">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#F28C14]" />{gameTime(g.starts_at)}</span>
              {g.venue && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 text-[#F28C14]" />{g.venue}</span>}
            </span>
            {sc && (g.status === 'final' || g.status === 'live')
              ? <span className="block font-hoop italic font-extrabold text-[17px] text-white">{g.team_a} <span className={sc.score_a >= sc.score_b ? 'text-[#F28C14]' : ''}>{sc.score_a}</span> – <span className={sc.score_b >= sc.score_a ? 'text-[#F28C14]' : ''}>{sc.score_b}</span> {g.team_b}</span>
              : (
                <span className="flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, (booked / g.slots) * 100)}%`, background: full ? H.ball : H.orange }} /></span>
                  <span className="text-[11px] font-bold text-[#E7E5E4] flex items-center gap-1"><Users className="w-3 h-3" />{booked}/{g.slots}</span>
                </span>
              )}
          </span>
        </button>
        {g.status === 'scheduled' && !started && (
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
      <div className="px-5 py-4 rounded-2xl border border-[#F28C14]/30 text-center" style={{ background: 'linear-gradient(135deg, rgba(242,140,20,0.14), rgba(242,106,46,0.04))' }}>
        <p className="font-sans font-medium text-[15px] leading-relaxed tracking-[0.01em] text-[#F4F1EE]">
          The MINAW DVO basketball club. Book a slot, ball out, and your stats land on your player card.
        </p>
      </div>

      <ErrorNote text={err} />

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
