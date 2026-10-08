import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Ban, Check, ChevronRight, CircleDollarSign, Clock, Flag, MapPin, Minus, Pause, Pencil, Play, Plus, RotateCcw, Shuffle, SkipForward, Sparkles, Trash2, Undo2, UserPlus, Users, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, ErrorNote, Spinner } from '../components/ui';
import { AccountPicker } from '../components/MembersEditor';
import {
  H, KINDS, PERSON, boxScore, clockLeftMs, fmtClock, gameDate, gameTime, hbtn, kindPts, useServerOffset, useTick,
  type GamePlayer, type HoopEvent, type HoopGame, type Kind,
} from './lib';
import { GameForm } from './HoopGames';
import { MessageButton } from '../screens/MessagesScreen';

/** Smallest game allowed: 10 players, 5 per side. */
const MIN_PLAYERS = 10;
const MIN_PER_TEAM = 5;

const short = (name?: string | null) => {
  const parts = (name || 'Player').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

export const HoopGameScreen: React.FC<{ id: string }> = ({ id }) => {
  const go = useNav();
  const { user, isModerator } = useAuth();
  const [game, setGame] = useState<HoopGame | null | undefined>(undefined);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [events, setEvents] = useState<HoopEvent[]>([]);
  const [jersey, setJersey] = useState<Record<string, number | null>>({});
  const [sel, setSelRaw] = useState<string | null>(() => { try { return sessionStorage.getItem(`hoop-sel-${id}`); } catch { return null; } });
  const setSel = (v: string | null) => { setSelRaw(v); try { if (v) sessionStorage.setItem(`hoop-sel-${id}`, v); else sessionStorage.removeItem(`hoop-sel-${id}`); } catch { /* ignore */ } };
  // a schedule can have several games ("Game 1, Game 2…"); bookings + payments live on the first one
  const [session, setSession] = useState<(HoopGame & { hoop_game_players: { profile_id: string; team: string | null }[] })[]>([]);
  const [bookings, setBookings] = useState<GamePlayer[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardVisible, setBoardVisible] = useState(true);
  const [headerH, setHeaderH] = useState(64);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showTeams, setShowTeams] = useState(false);

  const loadSeq = useRef(0);
  const loadPlayers = useCallback(async () => {
    const my = ++loadSeq.current;   // ignore answers that come back after a newer reload
    const { data: g } = await supabase.from('hoop_games').select('id, session_id').eq('id', id).maybeSingle();
    const sid = (g as any)?.session_id || id;
    const cols = `*, profiles!hoop_game_players_profile_id_fkey(${PERSON})`;
    const [{ data }, { data: bk }, { data: ses }] = await Promise.all([
      supabase.from('hoop_game_players').select(cols).eq('game_id', id).order('booked_at'),
      sid === id ? Promise.resolve({ data: null }) : supabase.from('hoop_game_players').select(cols).eq('game_id', sid).order('booked_at'),
      supabase.from('hoop_games').select('*, hoop_game_players(profile_id, team)').or(`id.eq.${sid},session_id.eq.${sid}`).order('created_at'),
    ]);
    if (my !== loadSeq.current) return;
    const rows = (data as any as GamePlayer[]) || [];
    setPlayers(rows);
    const book = sid === id ? rows : ((bk as any as GamePlayer[]) || []);
    setBookings(book);
    setSession((ses as any[]) || []);
    const ids = [...new Set([...rows, ...book].map((r) => r.profile_id))];
    if (ids.length) {
      const { data: cards } = await supabase.from('hoop_players').select('profile_id, jersey_number').in('profile_id', ids);
      const m: Record<string, number | null> = {};
      ((cards as any[]) || []).forEach((c) => { m[c.profile_id] = c.jersey_number; });
      setJersey(m);
    }
  }, [id]);

  const load = useCallback(async () => {
    const [{ data: g }, { data: ev }] = await Promise.all([
      supabase.from('hoop_games').select('*').eq('id', id).maybeSingle(),
      supabase.from('hoop_events').select('*').eq('game_id', id).order('created_at'),
    ]);
    setGame((g as HoopGame) || null);
    setEvents((ev as HoopEvent[]) || []);
    await loadPlayers();
  }, [id, loadPlayers]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`hoop-game-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_games' }, (p: any) => {
        if (p.eventType === 'DELETE' && p.old?.id === id) { setGame(null); return; }
        if (p.new?.id === id) setGame((g) => (g ? { ...g, ...p.new } : g));
        loadPlayers();   // keeps the Game 1/2/3 list, counters and "next game" buttons current
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hoop_events', filter: `game_id=eq.${id}` }, (p: any) => {
        setEvents((xs) => (xs.some((x) => x.id === p.new.id) ? xs : [...xs, p.new as HoopEvent]));
      })
      // (deletes can't be filtered by game, so match on the id)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hoop_events' }, (p: any) => {
        setEvents((xs) => xs.filter((x) => x.id !== p.old?.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_game_players' }, () => loadPlayers())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load, loadPlayers]);

  useTick(!!game?.clock_running);
  const offset = useServerOffset();
  const now = () => Date.now() + offset;
  const left = game ? clockLeftMs(game, now()) : 0;

  // the admin's phone stops the clock at 0:00
  useEffect(() => {
    if (!isModerator || !game?.clock_running || left > 0) return;
    supabase.from('hoop_games').update({ clock_running: false, clock_started_at: null, clock_elapsed_ms: game.period_seconds * 1000 }).eq('id', game.id).then(() => {});
  }, [left, isModerator, game?.clock_running]); // eslint-disable-line react-hooks/exhaustive-deps

  const { lines, score } = useMemo(() => boxScore(events), [events]);

  // small scoreboard pinned under the header once the big one scrolls away
  useEffect(() => {
    const h = document.querySelector('header'); if (h) setHeaderH(Math.round(h.getBoundingClientRect().height));
    const el = boardRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setBoardVisible(e.isIntersecting), { rootMargin: '-70px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [game?.id]);

  if (game === undefined) return <Spinner label="Loading game…" />;
  if (game === null) return (
    <div className="px-3 py-6 space-y-3">
      <button onClick={() => go({ name: 'hoop' })} className={`${hbtn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" />All games</button>
      <p className="text-center text-[#A8A29E] py-10">This game isn’t available anymore.</p>
    </div>
  );

  const sessionId = game.session_id || game.id;
  const isFirst = sessionId === game.id;
  const root = isFirst ? game : (session.find((g) => g.id === sessionId) || game);
  const gameNo = Math.max(1, session.findIndex((g) => g.id === game.id) + 1);
  const teamA = players.filter((p) => p.team === 'A');
  const teamB = players.filter((p) => p.team === 'B');
  const bench = players.filter((p) => !p.team);
  const myBooking = user ? bookings.find((p) => p.profile_id === user.id) : undefined;
  const mine = !!myBooking;
  const full = bookings.length >= root.slots;
  const canBook = isFirst && game.status === 'scheduled' && new Date(game.starts_at).getTime() > Date.now();
  const everyone = [...bookings, ...players.filter((p) => !bookings.some((b) => b.profile_id === p.profile_id))];
  const nameOf = (pid: string) => everyone.find((p) => p.profile_id === pid)?.profiles?.display_name || 'Player';
  // how many games of this schedule each player already played (not counting this one)
  const played: Record<string, number> = {};
  session.forEach((g) => {
    if (g.id === game.id || (g.status !== 'live' && g.status !== 'final')) return;
    g.hoop_game_players.forEach((x) => { if (x.team) played[x.profile_id] = (played[x.profile_id] || 0) + 1; });
  });
  const sittingOut = bookings.filter((b) => !players.some((p) => p.profile_id === b.profile_id && p.team));
  const teamOf = (pid: string) => players.find((p) => p.profile_id === pid)?.team ?? null;
  const paidCount = bookings.filter((b) => b.paid).length;

  const run = async (fn: () => PromiseLike<{ error: any }>) => {
    setBusy(true); setErr(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return false; }
    return true;
  };
  const patchGame = async (patch: Partial<HoopGame>) => {
    const ok = await run(() => supabase.from('hoop_games').update(patch).eq('id', game.id));
    if (ok) { setGame((g) => (g ? { ...g, ...patch } : g)); loadPlayers(); }
    return ok;
  };

  // ---------- booking
  const book = () => run(() => (mine
    ? supabase.from('hoop_game_players').delete().eq('game_id', sessionId).eq('profile_id', user!.id)
    : supabase.from('hoop_game_players').insert({ game_id: sessionId, profile_id: user!.id }))).then(loadPlayers);

  // ---------- admin: teams
  const writeTeam = async (pid: string, team: 'A' | 'B' | null) => {
    const row = players.find((p) => p.profile_id === pid);
    if (isFirst || row) {
      if (!isFirst && !team && !events.some((e) => e.profile_id === pid)) return supabase.from('hoop_game_players').delete().eq('game_id', game.id).eq('profile_id', pid);
      return supabase.from('hoop_game_players').update({ team }).eq('game_id', game.id).eq('profile_id', pid);
    }
    if (!team) return { error: null };
    return supabase.from('hoop_game_players').insert({ game_id: game.id, profile_id: pid, team });
  };
  const setTeam = (pid: string, team: 'A' | 'B' | null) => run(() => writeTeam(pid, team) as any).then(loadPlayers);
  const togglePaid = (b: GamePlayer) => run(() => supabase.from('hoop_game_players').update({ paid: !b.paid, paid_at: b.paid ? null : new Date().toISOString() }).eq('game_id', sessionId).eq('profile_id', b.profile_id)).then(loadPlayers);
  /** Fills both teams with the players who have played the fewest games of this schedule. */
  const autoPick = async () => {
    const n = Number(prompt('Players per team?', '5'));
    if (!(n >= 1 && n <= 30)) return;
    const order = [...bookings].sort(() => Math.random() - 0.5).sort((a, b) => (played[a.profile_id] || 0) - (played[b.profile_id] || 0));
    const pick = order.slice(0, n * 2).map((b) => b.profile_id);
    setBusy(true); setErr(null);
    let failed = 0;
    for (const b of bookings) {
      const i = pick.indexOf(b.profile_id);
      const want = i < 0 ? null : i % 2 === 0 ? 'A' : 'B';
      if (teamOf(b.profile_id) !== want) { const r: any = await writeTeam(b.profile_id, want as any); if (r?.error) failed++; }
    }
    setBusy(false);
    if (failed) setErr(`${failed} player${failed === 1 ? '' : 's'} couldn’t be moved — check your connection and try again.`);
    loadPlayers();
  };
  const removePlayer = async (pid: string) => {
    if (!confirm(`Remove ${nameOf(pid)} from this game?${events.some((e) => e.profile_id === pid) ? '\n\nTheir stats in this game will be removed too.' : ''}`)) return;
    if (events.some((e) => e.profile_id === pid)) await supabase.from('hoop_events').delete().eq('game_id', game.id).eq('profile_id', pid);
    await run(() => supabase.from('hoop_game_players').delete().eq('game_id', game.id).eq('profile_id', pid));
    load();
  };
  const addPlayer = async (pid: string) => {
    setAdding(false);
    await run(() => supabase.from('hoop_game_players').insert({ game_id: sessionId, profile_id: pid }));
    loadPlayers();
  };
  /** Mixes the players already on a team into two new random teams. */
  const shuffle = async () => {
    const onTeams = [...teamA, ...teamB].map((p) => p.profile_id);
    if (onTeams.length < 2) return setErr('Put players on teams first (or use “Fewest games”).');
    if (!confirm(`Shuffle these ${onTeams.length} players into two new random teams?`)) return;
    const ids = onTeams.sort(() => Math.random() - 0.5);
    setBusy(true);
    let failed = 0;
    for (let i = 0; i < ids.length; i++) { const r: any = await writeTeam(ids[i], i % 2 === 0 ? 'A' : 'B'); if (r?.error) failed++; }
    setBusy(false);
    if (failed) setErr(`${failed} player${failed === 1 ? '' : 's'} couldn’t be moved — check your connection and try again.`);
    loadPlayers();
  };
  /** Admin: another game on the same schedule — the same booked players, new teams, new score. */
  /** Admin: end the whole schedule (no more games today). An empty, not-started extra game is removed. */
  const endSchedule = async () => {
    const playedGames = session.filter((g) => g.status === 'final').length;
    if (!confirm(`End this schedule?\n\n${playedGames} game${playedGames === 1 ? '' : 's'} played. No more games can be added, and everyone’s stats stay on their cards.`)) return;
    setBusy(true); setErr(null);
    for (const g of session) {
      if (g.session_id && g.status === 'scheduled') await supabase.from('hoop_games').delete().eq('id', g.id);
    }
    const { error } = await supabase.from('hoop_games').update({ closed_at: new Date().toISOString() }).eq('id', sessionId);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    if (!isFirst && game.status === 'scheduled') go({ name: 'hoopGame', id: sessionId }); else loadPlayers();
  };
  const reopenSchedule = () => run(() => supabase.from('hoop_games').update({ closed_at: null }).eq('id', sessionId)).then(loadPlayers);
  const nextGame = async () => {
    if (!confirm(`Start Game ${session.length + 1} of this schedule?\n\nYou’ll pick new teams — the counter shows who has played the least.`)) return;
    const { data, error } = await supabase.from('hoop_games').insert({
      session_id: sessionId, title: root.title, venue: root.venue, starts_at: new Date().toISOString(), slots: root.slots,
      period_seconds: game.period_seconds, team_a: game.team_a, team_b: game.team_b, created_by: user?.id,
    }).select('id').single();
    if (error) return setErr(errorMessage(error));
    go({ name: 'hoopGame', id: (data as any).id });
  };

  // ---------- admin: game flow
  const begin = async () => {
    const onCourt = teamA.length + teamB.length;
    if (onCourt < MIN_PLAYERS || teamA.length < MIN_PER_TEAM || teamB.length < MIN_PER_TEAM) {
      return setErr(`A game needs at least ${MIN_PLAYERS} players — ${MIN_PER_TEAM} on each team. Right now: ${game.team_a} ${teamA.length}, ${game.team_b} ${teamB.length}.`);
    }
    const out = sittingOut.map((p) => p.profiles?.display_name || 'Player');
    if (!confirm(`Start the game with ${onCourt} players?\n\n${game.team_a}: ${teamA.length} players\n${game.team_b}: ${teamB.length} players`
      + (out.length ? `\n\n⚠ ${out.length} booked ${out.length === 1 ? 'player is' : 'players are'} sitting out:\n${out.join(', ')}\n\nTap Cancel to put them on a team first.` : ''))) return;
    patchGame({ status: 'live', started_at: new Date().toISOString(), period: 1, clock_elapsed_ms: 0, clock_running: false, clock_started_at: null });
  };
  const finish = async () => {
    if (!confirm(`Finish the game?\n\nFinal: ${game.team_a} ${score.A} – ${score.B} ${game.team_b}\n\nEveryone’s stats will be added to their player cards.`)) return;
    patchGame({ status: 'final', ended_at: new Date().toISOString(), clock_running: false, clock_started_at: null, clock_elapsed_ms: game.period_seconds * 1000 - left });
  };
  const reopen = () => { if (confirm('Reopen this game to fix stats? It goes back to LIVE until you finish it again.')) patchGame({ status: 'live', ended_at: null }); };
  const cancelGame = () => { if (confirm('Cancel this game? Players will see it as cancelled.')) patchGame({ status: 'cancelled' }); };
  const restore = () => patchGame({ status: 'scheduled' });
  const deleteGame = async () => {
    if (!confirm(isFirst
      ? `Delete this schedule and everything in it (bookings, payments${session.length > 1 ? `, all ${session.length} games` : ''} and stats)? This can’t be undone.`
      : `Delete Game ${gameNo} and its stats? This can’t be undone.`)) return;
    if (await run(() => supabase.from('hoop_games').delete().eq('id', game.id))) go(isFirst ? { name: 'hoop' } : { name: 'hoopGame', id: sessionId });
  };

  // ---------- admin: clock
  const clockStart = () => patchGame({ clock_running: true, clock_started_at: new Date().toISOString(), ...(left <= 0 ? { clock_elapsed_ms: 0 } : {}) });
  const clockPause = () => patchGame({ clock_running: false, clock_started_at: null, clock_elapsed_ms: game.period_seconds * 1000 - clockLeftMs(game, now()) });
  const clockReset = () => patchGame({ clock_running: false, clock_started_at: null, clock_elapsed_ms: 0 });
  const nextPeriod = () => { if (confirm(`Start period ${game.period + 1}?`)) patchGame({ period: Math.min(9, game.period + 1), clock_running: false, clock_started_at: null, clock_elapsed_ms: 0 }); };
  const setMinutes = (delta: number) => {
    const s = Math.min(3600, Math.max(60, game.period_seconds + delta * 60));
    patchGame({ period_seconds: s, ...(game.clock_running ? {} : { clock_elapsed_ms: Math.min(game.clock_elapsed_ms, s * 1000) }) });
  };

  // ---------- admin: stats
  const record = async (kind: Kind) => {
    if (!sel) return setErr('Tap a player first.');
    setErr(null);
    const { data, error } = await supabase.from('hoop_events').insert({ game_id: game.id, profile_id: sel, team: 'A', kind }).select('*').single();
    if (error) return setErr(errorMessage(error));
    setEvents((xs) => (xs.some((x) => x.id === (data as any).id) ? xs : [...xs, data as HoopEvent]));
    if (navigator.vibrate) navigator.vibrate(15);
  };
  const removeEvent = async (e: HoopEvent) => {
    const { error } = await supabase.from('hoop_events').delete().eq('id', e.id);
    if (error) return setErr(errorMessage(error));
    setEvents((xs) => xs.filter((x) => x.id !== e.id));
  };
  const undo = () => { const last = events[events.length - 1]; if (last) removeEvent(last); };

  const live = game.status === 'live';
  const showScore = live || game.status === 'final';
  const winner = game.status === 'final' ? (score.A > score.B ? 'A' : score.B > score.A ? 'B' : null) : null;

  // ---------------------------------------------------------------- UI pieces
  const teamCol = (team: 'A' | 'B', list: GamePlayer[]) => (
    <div className="space-y-1.5">
      <p className="text-[10px] font-black uppercase tracking-wider truncate" style={{ color: team === 'A' ? H.orange : '#D6D3D1' }}>{team === 'A' ? game.team_a : game.team_b}</p>
      {list.map((p) => {
        const on = sel === p.profile_id;
        const l = lines[p.profile_id];
        return (
          <button key={p.profile_id} onClick={() => setSel(on ? null : p.profile_id)} aria-pressed={on}
            className={`w-full flex items-center gap-2 p-1.5 rounded-xl border text-left cursor-pointer transition-colors ${on ? 'border-[#F28C14] bg-[#F28C14]/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center font-hoop italic font-black text-[15px] flex-shrink-0" style={{ background: team === 'A' ? H.orange : '#3A3A3A', color: team === 'A' ? '#111' : '#F4F1EE' }}>{jersey[p.profile_id] ?? '–'}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-bold text-white truncate">{short(p.profiles?.display_name)}</span>
              <span className="block text-[10px] leading-tight text-[#A8A29E]"><strong className="text-white">{l?.pts ?? 0}</strong> pts · {l?.reb ?? 0} reb · {l?.ast ?? 0} ast</span>
              <span className="block text-[10px] leading-tight text-[#A8A29E]">{l?.stl ?? 0} stl · {l?.blk ?? 0} blk · {l?.tov ?? 0} to · <span className={(l?.foul ?? 0) >= 4 ? 'text-[#FF8A9C] font-bold' : ''}>{l?.foul ?? 0} foul</span></span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const playedChip = (pid: string) => {
    const n = played[pid] || 0;
    return (
      <span title={`Played ${n} game${n === 1 ? '' : 's'} of this schedule`}
        className={`px-1.5 py-0.5 rounded-md text-[9px] font-black whitespace-nowrap ${n === 0 ? 'bg-[#8FE36B]/15 text-[#8FE36B] border border-[#8FE36B]/40' : 'bg-white/10 text-[#D6D3D1] border border-white/15'}`}>
        {n === 0 ? 'FRESH' : `${n} GP`}
      </span>
    );
  };
  const rosterRow = (p: GamePlayer) => {
    const t = teamOf(p.profile_id);
    return (
      <div key={p.profile_id} className="p-2 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
        <div className="flex items-center gap-2">
          <Avatar src={p.profiles?.avatar_url} name={p.profiles?.display_name} size={30} />
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] font-bold text-white truncate">{p.profiles?.display_name || 'Member'}</span>
            <span className="flex items-center gap-1 mt-0.5">
              {session.length > 1 || !isFirst ? playedChip(p.profile_id) : null}
              <button onClick={() => togglePaid(p)} disabled={busy} aria-pressed={!!p.paid} title={p.paid ? 'Paid — tap to undo' : 'Not paid yet — tap when paid'}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black cursor-pointer border ${p.paid ? 'bg-[#53E6D4]/15 text-[#53E6D4] border-[#53E6D4]/45' : 'bg-[#FF6B7A]/10 text-[#FF8A9C] border-[#FF6B7A]/40'}`}>
                {p.paid ? <><Check className="w-2.5 h-2.5" />PAID</> : <><CircleDollarSign className="w-2.5 h-2.5" />UNPAID</>}
              </button>
            </span>
          </span>
          {isFirst && game.status === 'scheduled' && <button onClick={() => removePlayer(p.profile_id)} aria-label={`Remove ${p.profiles?.display_name}`} className="w-7 h-7 rounded-lg text-[#A8A29E] hover:text-[#FF6B7A] flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/15 text-[10px] font-black">
          {(['A', null, 'B'] as const).map((tm) => (
            <button key={String(tm)} onClick={() => setTeam(p.profile_id, tm)} disabled={busy}
              className={`flex-1 px-2 py-1.5 cursor-pointer truncate ${t === tm ? (tm === 'A' ? 'bg-[#F28C14] text-[#111]' : tm === 'B' ? 'bg-[#D6D3D1] text-[#111]' : 'bg-white/20 text-white') : 'text-[#A8A29E] hover:bg-white/10'}`}>
              {tm === 'A' ? game.team_a.toUpperCase() : tm === 'B' ? game.team_b.toUpperCase() : 'SITTING OUT'}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const sortedForRoster = [...everyone].sort((a, b) => (played[a.profile_id] || 0) - (played[b.profile_id] || 0));
  const rosterManager = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[13px] font-bold text-white flex items-center gap-1.5"><Users className="w-4 h-4 text-[#F28C14]" />Players ({bookings.length}/{root.slots}) · <span className="text-[#53E6D4]">{paidCount} paid</span></p>
        <div className="flex gap-1.5">
          <button onClick={autoPick} disabled={busy || bookings.length < 2} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`} title="Pick the players who have played the fewest games"><Sparkles className="w-3.5 h-3.5" />Fewest games</button>
          <button onClick={shuffle} disabled={busy} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`}><Shuffle className="w-3.5 h-3.5" />Shuffle</button>
          <button onClick={() => setAdding(!adding)} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`}><UserPlus className="w-3.5 h-3.5" />Add</button>
        </div>
      </div>
      <p className="text-[11px] text-[#A8A29E]">
        {teamA.length} on {game.team_a} · {teamB.length} on {game.team_b}
        {(session.length > 1 || !isFirst) && <> · <span className="text-[#8FE36B] font-bold">FRESH</span> = hasn’t played yet today, sorted first</>}
      </p>
      {adding && <AccountPicker autoFocus roles={['fan']} exclude={everyone.map((p) => p.profile_id)} onPick={(p) => addPlayer(p.id)} onCancel={() => setAdding(false)} />}
      {everyone.length === 0 && <p className="text-[12px] text-[#A8A29E]">No one has booked yet. You can add players with “Add”.</p>}
      {sortedForRoster.map((p) => rosterRow(bookings.find((b) => b.profile_id === p.profile_id) || p))}
    </div>
  );

  const boxTable = (team: 'A' | 'B', list: GamePlayer[]) => (
    <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: H.surface }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: team === 'A' ? H.orange : '#2E2E2E', color: team === 'A' ? '#111' : '#F4F1EE' }}>
        <span className="font-hoop italic font-black text-[17px] uppercase">{team === 'A' ? game.team_a : game.team_b}{winner === team && ' · W'}</span>
        <span className="font-hoop italic font-black text-[22px]">{score[team]}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[#A8A29E] border-b border-white/10">
              <th className="text-left font-bold px-3 py-1.5">PLAYER</th>
              {['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'TO', 'PF'].map((h) => <th key={h} className="font-bold px-1.5 py-1.5 text-center">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const l = lines[p.profile_id];
              return (
                <tr key={p.profile_id} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-3 py-1.5">
                    <button onClick={() => go({ name: 'hoopPlayer', id: p.profile_id })} className="flex items-center gap-1.5 font-bold text-white hover:text-[#F28C14] cursor-pointer whitespace-nowrap">
                      <span className="text-[#A8A29E] font-mono w-5 text-right">{jersey[p.profile_id] ?? ''}</span>{short(p.profiles?.display_name)}
                    </button>
                  </td>
                  {[l?.pts, l?.reb, l?.ast, l?.stl, l?.blk, l?.threes, l?.tov, l?.foul].map((v, i) => (
                    <td key={i} className={`px-1.5 py-1.5 text-center font-mono ${i === 0 ? 'font-bold text-white' : 'text-[#D6D3D1]'}`}>{v ?? 0}</td>
                  ))}
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={9} className="px-3 py-3 text-center text-[#A8A29E]">No players</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="px-3 py-4 space-y-4">
      <button onClick={() => go({ name: 'hoop' })} className={`${hbtn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" />All games</button>

      {/* mini scoreboard that stays on screen while scrolling */}
      {showScore && !boardVisible && (
        <div className="fixed left-0 right-0 z-30 flex justify-center pointer-events-none" style={{ top: headerH + 6 }}>
          <div className="pointer-events-auto flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-full border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.6)]" style={{ background: 'rgba(20,20,20,0.96)' }}>
            <span className="text-[10px] font-black uppercase text-[#F28C14] max-w-[70px] truncate">{game.team_a}</span>
            <span className="font-hoop italic font-black text-[22px] leading-none text-white tabular-nums">{score.A}</span>
            <span className="px-2 py-0.5 rounded-md bg-white/[0.08] text-center leading-tight">
              <span className={`block font-mono font-bold text-[13px] tabular-nums ${live && game.clock_running && left <= 10000 ? 'text-[#F26A2E]' : 'text-white'}`}>{fmtClock(left)}</span>
              <span className="block text-[8px] font-bold tracking-wider text-[#A8A29E]">{game.status === 'final' ? 'FINAL' : `P${game.period}`}</span>
            </span>
            <span className="font-hoop italic font-black text-[22px] leading-none text-white tabular-nums">{score.B}</span>
            <span className="text-[10px] font-black uppercase text-[#D6D3D1] max-w-[70px] truncate">{game.team_b}</span>
          </div>
        </div>
      )}

      {/* games of this schedule */}
      {session.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-1">
          {session.map((g, i) => (
            <button key={g.id} onClick={() => g.id !== game.id && go({ name: 'hoopGame', id: g.id })}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full text-[12px] font-bold border cursor-pointer ${g.id === game.id ? 'bg-[#F28C14] border-[#F28C14] text-[#111]' : 'bg-white/[0.05] border-white/15 text-[#E7E5E4]'}`}>
              {g.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-[#F26A2E] animate-pulse" />}
              Game {i + 1}{g.status === 'final' ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}

      {/* SCOREBOARD */}
      <div ref={boardRef} className="rounded-3xl overflow-hidden border border-white/10" style={{ background: 'linear-gradient(180deg, #1F1F1F, #141414)' }}>
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${H.orange}, ${H.ball})` }} />
        <div className="p-4 space-y-3">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h1 className="font-hoop italic font-black text-[26px] uppercase text-white leading-none">{game.title}{session.length > 1 && <span className="text-[#F28C14]"> · G{gameNo}</span>}</h1>
              {live && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F26A2E] text-[10px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}
              {game.status === 'final' && <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-black text-white">FINAL</span>}
              {game.status === 'cancelled' && <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-black text-[#A8A29E]">CANCELLED</span>}
            </div>
            <p className="flex flex-wrap items-center justify-center gap-x-3 text-[11px] text-[#A8A29E]">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#F28C14]" />{gameDate(game.starts_at)} · {gameTime(game.starts_at)}</span>
              {game.venue && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-[#F28C14]" />{game.venue}</span>}
            </p>
          </div>

          {showScore ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="text-center min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#F28C14] truncate">{game.team_a}</p>
                <p className={`font-hoop italic font-black text-[56px] leading-none ${winner === 'B' ? 'text-[#78716C]' : 'text-white'}`}>{score.A}</p>
              </div>
              <div className="text-center px-2">
                <p className={`font-mono font-bold text-[26px] tabular-nums ${live && left <= 10000 && game.clock_running ? 'text-[#F26A2E]' : 'text-white'}`}>{fmtClock(left)}</p>
                <p className="text-[10px] font-bold tracking-wider text-[#A8A29E]">{game.status === 'final' ? 'FINAL' : `PERIOD ${game.period}`}</p>
              </div>
              <div className="text-center min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#D6D3D1] truncate">{game.team_b}</p>
                <p className={`font-hoop italic font-black text-[56px] leading-none ${winner === 'A' ? 'text-[#78716C]' : 'text-white'}`}>{score.B}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-[13px]">
              <span className="flex items-center gap-1.5 font-bold text-white"><Users className="w-4 h-4 text-[#F28C14]" />{isFirst ? `${bookings.length} / ${root.slots} booked` : `${teamA.length + teamB.length} picked for this game`}</span>
            </div>
          )}

          {game.notes && <p className="text-[12px] text-[#D6D3D1] text-center whitespace-pre-line">{game.notes}</p>}

          {canBook && (
            mine
              ? <button onClick={book} disabled={busy} className={`${hbtn.ghost} w-full`}><Check className="w-4 h-4 text-[#F28C14]" />You’re in · Cancel my slot</button>
              : <button onClick={book} disabled={busy || full} className={`${hbtn.primary} w-full`}>{full ? 'Game is full' : 'Book my slot'}</button>
          )}

          {/* payment status for a booked player */}
          {myBooking && !isModerator && game.status !== 'cancelled' && (
            <div className={`p-3 rounded-2xl border space-y-2 ${myBooking.paid ? 'border-[#53E6D4]/40 bg-[#53E6D4]/[0.07]' : 'border-[#FF6B7A]/40 bg-[#FF6B7A]/[0.07]'}`}>
              <p className="flex items-center gap-2 text-[13px] font-bold text-white">
                {myBooking.paid
                  ? <><Check className="w-4 h-4 text-[#53E6D4]" />Payment confirmed — you’re all set!</>
                  : <><CircleDollarSign className="w-4 h-4 text-[#FF8A9C]" />Payment not confirmed yet</>}
              </p>
              {!myBooking.paid && <p className="text-[11px] text-[#D6D3D1]">Please pay ahead of the game and send your receipt to the admin so your slot is confirmed.</p>}
              {root.created_by && root.created_by !== user?.id && (
                <MessageButton to={root.created_by} label={myBooking.paid ? 'Message the admin' : 'Message admin to confirm payment'}
                  draft={myBooking.paid ? '' : `Hi! I booked "${root.title}" on ${gameDate(root.starts_at)} · ${gameTime(root.starts_at)}. Here’s my payment for my slot: `}
                  className={`${myBooking.paid ? hbtn.ghost : hbtn.primary} w-full !py-2 !text-xs`} />
              )}
            </div>
          )}
        </div>
      </div>

      <ErrorNote text={err} />

      {/* ADMIN CONSOLE */}
      {isModerator && game.status === 'scheduled' && (
        <section className="rounded-2xl p-3.5 space-y-3 border border-[#F28C14]/40" style={{ background: 'rgba(242,140,20,0.06)' }}>
          <p className="text-[11px] font-black tracking-wider text-[#F28C14]">ADMIN · {isFirst ? 'GAME SETUP' : `GAME ${gameNo} SETUP`}</p>
          {!isFirst && <button onClick={endSchedule} disabled={busy} className={`${hbtn.ghost} w-full !py-2 !text-xs`}><Flag className="w-3.5 h-3.5" />Skip this game & end the schedule</button>}
          {rosterManager}
          {(() => {
            const n = teamA.length + teamB.length;
            const ok = n >= MIN_PLAYERS && teamA.length >= MIN_PER_TEAM && teamB.length >= MIN_PER_TEAM;
            return (
              <div className={`p-2.5 rounded-xl border text-center space-y-0.5 ${ok ? 'border-[#53E6D4]/40 bg-[#53E6D4]/[0.07]' : 'border-[#FF6B7A]/40 bg-[#FF6B7A]/[0.07]'}`}>
                <p className="font-hoop italic font-black text-[18px] text-white">{game.team_a} {teamA.length} <span className="text-[#A8A29E]">vs</span> {teamB.length} {game.team_b}</p>
                <p className={`text-[11px] font-bold ${ok ? 'text-[#53E6D4]' : 'text-[#FF8A9C]'}`}>
                  {ok ? `${n} players ready${sittingOut.length ? ` · ${sittingOut.length} sitting out` : ''}` : `Need at least ${MIN_PLAYERS} players (${MIN_PER_TEAM} per team) to start`}
                </p>
              </div>
            );
          })()}
          <button onClick={begin} disabled={busy || teamA.length < MIN_PER_TEAM || teamB.length < MIN_PER_TEAM} className={`${hbtn.primary} w-full !py-3 !text-base`}><Play className="w-5 h-5 fill-current" />Begin game</button>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditing(true)} className={`${hbtn.ghost} !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />Edit details</button>
            {isFirst && <button onClick={cancelGame} className={`${hbtn.ghost} !py-2 !text-xs`}><Ban className="w-3.5 h-3.5" />Cancel game</button>}
            <button onClick={deleteGame} className={`${hbtn.ghost} !py-2 !text-xs !text-[#FF6B7A]`}><Trash2 className="w-3.5 h-3.5" />Delete</button>
          </div>
        </section>
      )}

      {isModerator && live && (
        <section className="rounded-2xl p-3.5 space-y-3.5 border border-[#F28C14]/40" style={{ background: 'rgba(242,140,20,0.06)' }}>
          <p className="text-[11px] font-black tracking-wider text-[#F28C14]">ADMIN · LIVE CONSOLE</p>

          {/* clock */}
          <div className="flex flex-wrap items-center gap-2">
            {game.clock_running
              ? <button onClick={clockPause} disabled={busy} className={`${hbtn.primary} !py-2`}><Pause className="w-4 h-4 fill-current" />Pause</button>
              : <button onClick={clockStart} disabled={busy} className={`${hbtn.primary} !py-2`}><Play className="w-4 h-4 fill-current" />{game.clock_elapsed_ms ? 'Resume' : 'Start clock'}</button>}
            <button onClick={clockReset} disabled={busy} className={`${hbtn.ghost} !py-2 !px-3`} aria-label="Reset clock"><RotateCcw className="w-4 h-4" /></button>
            <button onClick={nextPeriod} disabled={busy} className={`${hbtn.ghost} !py-2 !px-3 !text-xs`}><SkipForward className="w-4 h-4" />Next period</button>
            <span className="flex items-center gap-1 ml-auto">
              <button onClick={() => setMinutes(-1)} aria-label="One minute less per period" className={hbtn.icon}><Minus className="w-4 h-4" /></button>
              <span className="text-[11px] font-bold text-white w-12 text-center">{Math.round(game.period_seconds / 60)} min</span>
              <button onClick={() => setMinutes(1)} aria-label="One minute more per period" className={hbtn.icon}><Plus className="w-4 h-4" /></button>
            </span>
          </div>

          {/* players */}
          <p className="text-[11px] text-[#A8A29E]">Tap a player, then tap what they did.</p>
          <p className="text-[11px] font-bold text-white">On the court: {teamA.length + teamB.length} players ({teamA.length} vs {teamB.length})</p>
          <div className="grid grid-cols-2 gap-2">{teamCol('A', teamA)}{teamCol('B', teamB)}</div>
          {sittingOut.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-[#A8A29E]">Sitting out ({sittingOut.length}) — tap a team to sub them in</p>
              {sittingOut.map((b) => (
                <div key={b.profile_id} className="flex items-center gap-2 p-1.5 rounded-xl bg-white/[0.03] border border-white/10">
                  <Avatar src={b.profiles?.avatar_url} name={b.profiles?.display_name} size={26} />
                  <span className="flex-1 min-w-0 text-[12px] font-bold text-white truncate">{b.profiles?.display_name}</span>
                  <button onClick={() => setTeam(b.profile_id, 'A')} disabled={busy} className="px-2 py-1 rounded-lg text-[10px] font-black bg-[#F28C14] text-[#111] cursor-pointer max-w-[90px] truncate">+ {game.team_a}</button>
                  <button onClick={() => setTeam(b.profile_id, 'B')} disabled={busy} className="px-2 py-1 rounded-lg text-[10px] font-black bg-[#D6D3D1] text-[#111] cursor-pointer max-w-[90px] truncate">+ {game.team_b}</button>
                </div>
              ))}
            </div>
          )}

          {/* stat buttons */}
          <div className="sticky bottom-[84px] z-20 -mx-1 p-2 rounded-2xl border border-white/15 space-y-2" style={{ background: 'rgba(20,20,20,0.97)' }}>
            <p className="text-[11px] text-center font-bold truncate" style={{ color: sel ? H.orange : '#A8A29E' }}>{sel ? `${nameOf(sel)}${jersey[sel] != null ? ` #${jersey[sel]}` : ''}` : 'No player selected'}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {KINDS.map((k) => (
                <button key={k.k} onClick={() => record(k.k)} disabled={!sel}
                  className="h-12 rounded-xl font-hoop italic font-black text-[18px] cursor-pointer active:scale-95 transition-transform disabled:opacity-35 disabled:cursor-not-allowed"
                  style={{ background: k.pts ? k.tone : `${k.tone}22`, color: k.pts ? '#111' : k.tone, border: k.pts ? 'none' : `1px solid ${k.tone}66` }}>
                  {k.label}
                </button>
              ))}
              <button onClick={undo} disabled={!events.length} aria-label="Undo last" className="h-12 rounded-xl bg-white/[0.06] border border-white/15 text-white flex items-center justify-center cursor-pointer disabled:opacity-35"><Undo2 className="w-5 h-5" /></button>
            </div>
          </div>

          {/* play-by-play */}
          {events.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-[#A8A29E]">Latest plays</p>
              {[...events].reverse().slice(0, 6).map((e) => {
                const k = KINDS.find((x) => x.k === e.kind)!;
                return (
                  <div key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] text-[12px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.team === 'A' ? H.orange : '#D6D3D1' }} />
                    <span className="flex-1 min-w-0 truncate text-white">{nameOf(e.profile_id)} <strong style={{ color: k.tone }}>{kindPts(e.kind) ? k.label : k.short}</strong></span>
                    <span className="text-[10px] text-[#A8A29E]">P{e.period}</span>
                    <button onClick={() => removeEvent(e)} aria-label="Remove this play" className="text-[#A8A29E] hover:text-[#FF6B7A] cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={() => setShowTeams(!showTeams)} className="w-full flex items-center justify-between text-[12px] font-bold text-[#D6D3D1] cursor-pointer">
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-[#F28C14]" />Change teams / add a player</span>
            <ChevronRight className={`w-4 h-4 transition-transform ${showTeams ? 'rotate-90' : ''}`} />
          </button>
          {showTeams && rosterManager}

          <button onClick={finish} disabled={busy} className={`${hbtn.danger} w-full !py-3`}><Flag className="w-5 h-5" />Finish game</button>
        </section>
      )}

      {root.closed_at ? (
        <div className="p-3.5 rounded-2xl border border-white/15 text-center space-y-2" style={{ background: H.surface }}>
          <p className="font-hoop italic font-black text-[20px] uppercase text-white">Schedule finished</p>
          <p className="text-[12px] text-[#A8A29E]">{session.filter((g) => g.status === 'final').length} games played · ended {gameTime(root.closed_at)}</p>
          {isModerator && <button onClick={reopenSchedule} disabled={busy} className={`${hbtn.ghost} !py-2 !text-xs`}><RotateCcw className="w-3.5 h-3.5" />Reopen schedule</button>}
        </div>
      ) : isModerator && game.status === 'final' && !session.some((g) => g.status === 'live') && (
        <div className="space-y-2">
          {!session.some((g) => g.status === 'scheduled' && g.session_id) && (
            <button onClick={nextGame} className={`${hbtn.primary} w-full !py-3 !text-base`}><Plus className="w-5 h-5" />Start Game {session.length + 1} with the next players</button>
          )}
          <button onClick={endSchedule} disabled={busy} className={`${hbtn.ghost} w-full !py-3`}><Flag className="w-4 h-4" />End schedule — no more games today</button>
        </div>
      )}
      {!root.closed_at && isModerator && game.status === 'final' && session.some((g) => g.status === 'scheduled' && g.session_id) && (
        <button onClick={() => go({ name: 'hoopGame', id: session.find((g) => g.status === 'scheduled' && g.session_id)!.id })} className={`${hbtn.primary} w-full`}>Go to the next game <ChevronRight className="w-4 h-4" /></button>
      )}

      {/* payments overview for the admin while the schedule is still upcoming / after it */}
      {isModerator && game.status !== 'scheduled' && isFirst && bookings.length > 0 && (
        <details className="rounded-2xl border border-white/10 p-3" style={{ background: H.surface }}>
          <summary className="cursor-pointer text-[13px] font-bold text-white flex items-center gap-1.5"><CircleDollarSign className="w-4 h-4 text-[#53E6D4]" />Payments · {paidCount}/{bookings.length} paid</summary>
          <div className="pt-2 space-y-1.5">
            {bookings.map((b) => (
              <div key={b.profile_id} className="flex items-center gap-2">
                <Avatar src={b.profiles?.avatar_url} name={b.profiles?.display_name} size={26} />
                <span className="flex-1 min-w-0 text-[12px] text-white truncate">{b.profiles?.display_name}</span>
                <button onClick={() => togglePaid(b)} className={`px-2 py-1 rounded-md text-[10px] font-black border cursor-pointer ${b.paid ? 'bg-[#53E6D4]/15 text-[#53E6D4] border-[#53E6D4]/45' : 'bg-[#FF6B7A]/10 text-[#FF8A9C] border-[#FF6B7A]/40'}`}>{b.paid ? 'PAID' : 'UNPAID'}</button>
              </div>
            ))}
          </div>
        </details>
      )}

      {isModerator && (game.status === 'final' || game.status === 'cancelled') && (
        <div className="flex flex-wrap gap-2">
          {game.status === 'final' && <button onClick={reopen} className={`${hbtn.ghost} !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />Reopen to fix stats</button>}
          {game.status === 'cancelled' && <button onClick={restore} className={`${hbtn.ghost} !py-2 !text-xs`}><RotateCcw className="w-3.5 h-3.5" />Un-cancel</button>}
          <button onClick={deleteGame} className={`${hbtn.ghost} !py-2 !text-xs !text-[#FF6B7A]`}><Trash2 className="w-3.5 h-3.5" />{isFirst ? 'Delete schedule' : `Delete Game ${gameNo}`}</button>
        </div>
      )}

      {/* ROTATION: who already played which game of this schedule */}
      {bookings.length > 0 && (session.length > 1 || game.status !== 'scheduled') && (() => {
        const cols = session.map((g, i) => ({ g, n: i + 1, map: new Map(g.hoop_game_players.filter((x) => x.team).map((x) => [x.profile_id, x.team])) }));
        const total = (pid: string) => cols.filter((c) => (c.g.status === 'live' || c.g.status === 'final') && c.map.has(pid)).length;
        const rows = [...bookings].sort((x, y) => total(x.profile_id) - total(y.profile_id) || (x.profiles?.display_name || '').localeCompare(y.profiles?.display_name || ''));
        return (
          <section className="space-y-2.5">
            <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">Games played today</h2>
            <p className="-mt-1.5 text-[11px] text-[#A8A29E]">Everyone booked on this schedule and which games they played. Players with the fewest games are listed first — give them the next game.</p>
            <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: H.surface }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[#A8A29E] border-b border-white/10">
                      <th className="text-left font-bold px-3 py-2">PLAYER</th>
                      {cols.map((c) => <th key={c.g.id} className={`font-bold px-2 py-2 text-center ${c.g.id === game.id ? 'text-[#F28C14]' : ''}`}>G{c.n}</th>)}
                      <th className="font-bold px-3 py-2 text-center">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => {
                      const t = total(b.profile_id);
                      return (
                        <tr key={b.profile_id} className="border-b border-white/[0.05] last:border-0">
                          <td className="px-3 py-1.5">
                            <span className="flex items-center gap-2 min-w-0">
                              <Avatar src={b.profiles?.avatar_url} name={b.profiles?.display_name} size={24} />
                              <span className="font-bold text-white truncate max-w-[120px]">{short(b.profiles?.display_name)}</span>
                            </span>
                          </td>
                          {cols.map((c) => {
                            const team = c.map.get(b.profile_id);
                            const done = c.g.status === 'live' || c.g.status === 'final';
                            return (
                              <td key={c.g.id} className="px-2 py-1.5 text-center">
                                {team
                                  ? <span className={`inline-flex w-5 h-5 rounded-md items-center justify-center text-[10px] font-black ${done ? '' : 'border border-dashed'}`}
                                      style={done ? { background: team === 'A' ? H.orange : '#D6D3D1', color: '#111' } : { borderColor: team === 'A' ? H.orange : '#D6D3D1', color: team === 'A' ? H.orange : '#D6D3D1' }}
                                      title={done ? 'Played' : 'Picked for this game'}>{done ? '✓' : '•'}</span>
                                  : <span className="text-[#57534E]">–</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-center">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${t === 0 ? 'bg-[#8FE36B]/15 text-[#8FE36B]' : 'bg-white/10 text-white'}`}>{t === 0 ? 'FRESH' : t}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[10px] text-[#78716C]">✓ played (orange / gray = team) · dashed = picked for an upcoming game</p>
          </section>
        );
      })()}

      {/* BOX SCORE */}
      {showScore && (
        <section className="space-y-2.5">
          <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">Box score</h2>
          {boxTable('A', teamA)}
          {boxTable('B', teamB)}
        </section>
      )}

      {/* WHO'S PLAYING (before the game) */}
      {!showScore && !(isModerator && game.status === 'scheduled') && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">Who’s playing</h2>
            <span className="text-[12px] font-bold text-[#A8A29E]"><span className="text-[#F28C14] font-black">{players.length}</span> / {root.slots} booked</span>
          </div>
          {players.length === 0 ? <p className="text-[13px] text-[#A8A29E]">No one yet — be the first to book!</p> : (
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
              {players.map((p, i) => (
                <button key={p.profile_id} onClick={() => go({ name: 'hoopPlayer', id: p.profile_id })} className="flex flex-col items-center gap-1 min-w-0 cursor-pointer">
                  <span className="relative">
                    <span className="absolute -top-1 -left-1 z-10 min-w-[20px] h-5 px-1 rounded-full bg-[#F28C14] text-[#111] text-[10px] font-black flex items-center justify-center border-2 border-[#111]">{i + 1}</span>
                    <Avatar src={p.profiles?.avatar_url} name={p.profiles?.display_name} size={54} />
                    {p.team && <span className="absolute -bottom-1 -right-1 px-1 rounded text-[8px] font-black" style={{ background: p.team === 'A' ? H.orange : '#D6D3D1', color: '#111' }}>{p.team === 'A' ? game.team_a.slice(0, 6) : game.team_b.slice(0, 6)}</span>}
                  </span>
                  <span className="text-[11px] font-bold text-white max-w-full truncate">{short(p.profiles?.display_name)}</span>
                  {(() => {
                    const paid = !!bookings.find((b) => b.profile_id === p.profile_id)?.paid;   // payments live on the schedule's bookings
                    return (
                      <span className={`-mt-0.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black border ${paid ? 'bg-[#53E6D4]/15 text-[#53E6D4] border-[#53E6D4]/45' : 'bg-[#FF6B7A]/10 text-[#FF8A9C] border-[#FF6B7A]/40'}`}>
                        {paid ? <><Check className="w-2.5 h-2.5" />PAID</> : <><CircleDollarSign className="w-2.5 h-2.5" />UNPAID</>}
                      </span>
                    );
                  })()}
                </button>
              ))}
            </div>
          )}
          {bench.length > 0 && teamA.length + teamB.length > 0 && <p className="text-[11px] text-[#A8A29E]">{bench.length} not on a team yet.</p>}
        </section>
      )}

      {editing && <GameForm game={game} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
};
