import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Ban, Check, IdCard, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, Clock, Flag, MapPin, Minus, Pause, Pencil, Play, Plus, RotateCcw, Shuffle, SkipForward, Sparkles, Trash2, Undo2, UserPlus, Users, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ErrorNote, Spinner } from '../components/ui';
import {
  GP_COLS, H, KINDS, boxScore, byArrival, clockLeftMs, normEvent, normPlayer, periodName, fmtClock, gameDate, gameTime, hbtn, kindPts, useServerOffset, useTick,
  type GamePlayer, type HoopEvent, type HoopGame, type Kind, useClub,
} from './lib';
import { MemberPicker } from './HoopPlayer';
import { GameForm } from './HoopGames';
import { HoopFace } from './HoopFace';
import { GameCardModal, loadNightCard, type GameCardInfo } from './GameCard';
import { confirmDelete } from '../components/ConfirmDelete';
import { MessageButton } from '../screens/MessagesScreen';

/** Smallest game allowed: 10 players, 5 per side. */
const MIN_PLAYERS = 10;
const MIN_PER_TEAM = 5;

const short = (name?: string | null) => {
  const parts = (name || 'Player').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

/** A phone held sideways (short and wide). Tablets and computers keep the normal page. */
function usePhoneLandscape() {
  const q = '(orientation: landscape) and (max-height: 560px) and (pointer: coarse)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const f = () => setOn(m.matches);
    f(); m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, []);
  return on;
}

export const HoopGameScreen: React.FC<{ id: string }> = ({ id }) => {
  const go = useNav();
  const { user } = useAuth();
  const { club, isAdmin: isModerator, isOwner: isMainAdmin, me } = useClub();
  const clubHome = { name: 'hoopClub' as const, club: club!.id };
  const [game, setGame] = useState<HoopGame | null | undefined>(undefined);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [events, setEvents] = useState<HoopEvent[]>([]);
  const [jersey, setJersey] = useState<Record<string, number | null>>({});
  const [faces, setFaces] = useState<Record<string, { url: string; crop: any }>>({});
  const [sel, setSelRaw] = useState<string | null>(() => { try { return sessionStorage.getItem(`hoop-sel-${id}`); } catch { return null; } });
  const setSel = (v: string | null) => { setSelRaw(v); try { if (v) sessionStorage.setItem(`hoop-sel-${id}`, v); else sessionStorage.removeItem(`hoop-sel-${id}`); } catch { /* ignore */ } };
  // someone else subbed the selected player out (live update): drop the selection so stats don't go to the bench
  useEffect(() => { if (sel && players.some((p) => p.profile_id === sel && p.on_court === false)) setSel(null); }, [players, sel]);   // eslint-disable-line react-hooks/exhaustive-deps
  // a schedule can have several games ("Game 1, Game 2…"); bookings + payments live on the first one
  const [session, setSession] = useState<(HoopGame & { hoop_game_players: { profile_id: string; team: string | null }[] })[]>([]);
  const [bookings, setBookings] = useState<GamePlayer[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardVisible, setBoardVisible] = useState(true);
  const [headerH, setHeaderH] = useState(64);
  const [busy, setBusy] = useState(false);
  const [showRot, setShowRot] = useState(false);   // "Games played today" table: hidden until tapped
  const [showNext, setShowNext] = useState(false);   // next game's line-up panel
  const [latePick, setLatePick] = useState(false);   // line-up panel: picking a club player who just arrived
  const lateAdd = useRef(false);   // the next club player picked is marked as arrived
  const creatingNext = useRef<Promise<string> | null>(null);   // the next game being created (double taps reuse it)
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [night, setNight] = useState<GameCardInfo | null>(null);   // my card for the whole schedule
  const [subFor, setSubFor] = useState<string | null>(null);   // live game: the player being subbed out (choose who comes in)
  const removing = useRef<Set<string>>(new Set());   // stats being deleted right now (fast − / Undo taps never pick the same one twice)

  const loadSeq = useRef(0);
  const loadPlayers = useCallback(async () => {
    const my = ++loadSeq.current;   // ignore answers that come back after a newer reload
    const { data: g } = await supabase.from('hoop_games').select('id, session_id').eq('id', id).maybeSingle();
    const sid = (g as any)?.session_id || id;
    const cols = GP_COLS;
    const [{ data }, { data: bk }, { data: ses }] = await Promise.all([
      supabase.from('hoop_game_players').select(cols).eq('game_id', id).order('booked_at'),
      sid === id ? Promise.resolve({ data: null }) : supabase.from('hoop_game_players').select(cols).eq('game_id', sid).order('booked_at'),
      supabase.from('hoop_games').select('*, hoop_game_players(profile_id, guest_id, member_id, team)').or(`id.eq.${sid},session_id.eq.${sid}`).order('created_at'),
    ]);
    if (my !== loadSeq.current) return;
    const rows = ((data as any[]) || []).map(normPlayer);
    setPlayers(rows);
    const book = sid === id ? rows : ((bk as any[]) || []).map(normPlayer);
    setBookings(book);
    setSession(((ses as any[]) || []).map((g) => ({ ...g, hoop_game_players: (g.hoop_game_players || []).map((x: any) => ({ profile_id: x.member_id || x.guest_id || x.profile_id, team: x.team })) })));
    // jersey numbers + card photos come with each booking (from the player's club card)
    const m: Record<string, number | null> = {};
    const f: Record<string, { url: string; crop: any }> = {};
    [...rows, ...book].forEach((r) => { if (r.is_guest) return; m[r.profile_id] = r.jersey ?? null; if (r.face) f[r.profile_id] = r.face; });
    setJersey(m); setFaces(f);
  }, [id]);

  const load = useCallback(async () => {
    const [{ data: g }, { data: ev }] = await Promise.all([
      supabase.from('hoop_games').select('*').eq('id', id).maybeSingle(),
      supabase.from('hoop_events').select('*').eq('game_id', id).order('created_at'),
    ]);
    setGame((g as HoopGame) || null);
    setEvents(((ev as any[]) || []).map(normEvent));
    await loadPlayers();
  }, [id, loadPlayers]);

  // the games of this schedule — live updates from other clubs' games are ignored
  const mineRef = useRef<Set<string>>(new Set([id]));
  useEffect(() => { mineRef.current = new Set([id, ...session.map((g) => g.id)]); }, [id, session]);
  const isMine = (p: any) => {
    const r = p.new && Object.keys(p.new).length ? p.new : p.old;
    return !r?.id || mineRef.current.has(r.id) || (!!r.session_id && mineRef.current.has(r.session_id));
  };
  const lateReload = useRef<ReturnType<typeof setTimeout>>();
  const myPlayers = (p: any) => { const gid = p.new?.game_id ?? p.old?.game_id; return !gid || mineRef.current.has(gid); };

  useEffect(() => {
    load();
    const ch = supabase.channel(`hoop-game-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_games' }, (p: any) => {
        if (p.eventType === 'DELETE' && p.old?.id === id) { setGame(null); return; }
        if (p.new?.id === id) setGame((g) => (g ? { ...g, ...p.new } : g));
        if (isMine(p)) loadPlayers();   // keeps the Game 1/2/3 list, counters and "next game" buttons current
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hoop_events', filter: `game_id=eq.${id}` }, (p: any) => {
        setEvents((xs) => (xs.some((x) => x.id === p.new.id) ? xs : [...xs, normEvent(p.new)]));
      })
      // (deletes can't be filtered by game, so match on the id)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hoop_events' }, (p: any) => {
        setEvents((xs) => xs.filter((x) => x.id !== p.old?.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_game_players' }, (p: any) => {
        if (myPlayers(p)) loadPlayers();
        else { clearTimeout(lateReload.current); lateReload.current = setTimeout(loadPlayers, 900); }   // maybe a game of this schedule we haven't loaded yet
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load, loadPlayers]); // eslint-disable-line react-hooks/exhaustive-deps

  useTick(!!game?.clock_running);
  const landscape = usePhoneLandscape();   // phone turned sideways → full-screen courtside view during a live game
  const [courtsideOff, setCourtsideOff] = useState(false);   // closed with ✕ → back to the normal page until the phone turns again
  useEffect(() => { if (!landscape) setCourtsideOff(false); }, [landscape]);
  const offset = useServerOffset();
  const now = () => Date.now() + offset;
  const left = game ? clockLeftMs(game, now()) : 0;

  // the admin's phone stops the clock at 0:00 (once per run of the clock)
  const stopSent = useRef<string | null>(null);
  useEffect(() => {
    if (!isModerator || !game?.clock_running || left > 0) return;
    const key = `${game.id}-${game.period}-${game.clock_started_at}`;
    if (stopSent.current === key) return;
    stopSent.current = key;
    const patch = { clock_running: false, clock_started_at: null, clock_elapsed_ms: game.period_seconds * 1000 };
    supabase.from('hoop_games').update(patch).eq('id', game.id).then(({ error }) => {
      if (error) stopSent.current = null; else setGame((g) => (g ? { ...g, ...patch } : g));
    });
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
      <button onClick={() => go(clubHome)} className={`${hbtn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" />All games</button>
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
  const myBooking = user ? bookings.find((p) => p.account_id === user.id) : undefined;
  const isMember = me?.status === 'active';
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
  // sitting out: in Game 2, 3… whoever played the fewest games today comes first (they're up next), then arrival order
  const sittingOut = bookings.filter((b) => !players.some((p) => p.profile_id === b.profile_id && p.team))
    .sort((a, b) => (game.session_id ? (played[a.profile_id] || 0) - (played[b.profile_id] || 0) : 0) || byArrival(a, b));
  const teamOf = (pid: string) => players.find((p) => p.profile_id === pid)?.team ?? null;
  const paidCount = bookings.filter((b) => b.paid).length;
  const periods = game.periods ?? 4;
  // guests (not on the app) use their guest id as the player key; writes go to the right column
  const isGuest = (pid: string) => !!everyone.find((p) => p.profile_id === pid)?.is_guest;
  const col = (pid: string) => (isGuest(pid) ? 'guest_id' : 'member_id');
  const who = (pid: string) => (isGuest(pid) ? { guest_id: pid, guest_name: nameOf(pid) } : { member_id: pid });
  // first come, first play: arrival order (arrivals live on the schedule's bookings)
  const bookingOf = (pid: string) => bookings.find((b) => b.profile_id === pid);
  const queue = [...bookings].sort(byArrival);
  const arrivedN = bookings.filter((b) => b.arrived_at).length;
  // "only players at the court" kicks in when the admin is marking arrivals — not because of a guest or a
  // late player added on the spot (they're booked and marked arrived at the same moment)
  const addedOnSpot = (b: GamePlayer) => !!b.is_guest || !!b.guest_id || (!!b.arrived_at && Math.abs(Date.parse(b.arrived_at) - Date.parse(b.booked_at)) < 120000);
  const arrivalsOn = bookings.some((b) => b.arrived_at && !addedOnSpot(b));
  const present = (b: GamePlayer) => !arrivalsOn || !!b.arrived_at;
  const canPlay = (b: GamePlayer) => !b.removed && !b.left_at && b.member_status !== 'suspended';
  // ---------- NEXT UP: the line-up for the next game, ready before this one even starts.
  // Games each player will have played once THIS game is done (this game counts for whoever is on a team),
  // fewest first; ties go to whoever arrived first (then booking order). Once arrivals are marked, only players at the court.
  const afterThis = (pid: string) => (played[pid] || 0) + (players.some((p) => p.profile_id === pid && p.team) ? 1 : 0);
  // sized by who is on the court (subs on the bench don't make the next game bigger)
  const perTeam = Math.max(teamA.filter((p) => p.on_court !== false).length, teamB.filter((p) => p.on_court !== false).length) || MIN_PER_TEAM;
  const lineupPool = bookings.filter((b) => canPlay(b) && present(b));
  const lineupOrder = [...lineupPool].sort((a, b) => afterThis(a.profile_id) - afterThis(b.profile_id) || byArrival(a, b));
  const nextUp = lineupOrder.slice(0, perTeam * 2).map((b, i) => ({ b, team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B' }));
  const waitingAfter = lineupOrder.slice(perTeam * 2);
  const arrivalRank = (pid: string) => { const b = bookingOf(pid); return b?.arrived_at ? queue.indexOf(b) + 1 : 0; };
  const byQueue = (a: GamePlayer, b: GamePlayer) => byArrival(bookingOf(a.profile_id) || a, bookingOf(b.profile_id) || b);

  const run = async (fn: () => PromiseLike<{ error: any }>) => {
    setBusy(true); setErr(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return false; }
    return true;
  };
  const patchGame = async (patch: Partial<HoopGame>) => {
    if (patch.clock_elapsed_ms != null) patch = { ...patch, clock_elapsed_ms: Math.max(0, Math.round(patch.clock_elapsed_ms)) };
    const ok = await run(() => supabase.from('hoop_games').update(patch).eq('id', game.id));
    if (ok) { setGame((g) => (g ? { ...g, ...patch } : g)); loadPlayers(); }
    return ok;
  };

  // ---------- booking
  const book = () => (!mine && !isMember && !isModerator ? Promise.resolve(go({ name: 'hoopClub', club: club!.id, tab: 'me' })) : run(() => (mine
    ? supabase.from('hoop_game_players').delete().eq('game_id', sessionId).eq('profile_id', user!.id)
    : supabase.from('hoop_game_players').insert({ game_id: sessionId, profile_id: user!.id }))).then(loadPlayers));

  // ---------- admin: teams
  const writeTeam = async (pid: string, team: 'A' | 'B' | null) => {
    const row = players.find((p) => p.profile_id === pid);
    if (row?.team && team !== row.team && events.some((e) => e.profile_id === pid)) {
      return { error: { message: `${nameOf(pid)} already has stats in this game, so they stay on ${row.team === 'A' ? game.team_a : game.team_b} (their stats and games played need it). To fix a wrong stat, tap the − under that stat.` } };
    }
    if (isFirst || row) {
      if (!isFirst && !team && !events.some((e) => e.profile_id === pid)) return supabase.from('hoop_game_players').delete().eq('game_id', game.id).eq(col(pid), pid);
      // a team change (or going to sitting out) always puts the player back on the court, never straight onto a bench
      return supabase.from('hoop_game_players').update(team === row?.team ? { team } : { team, on_court: true }).eq('game_id', game.id).eq(col(pid), pid);
    }
    if (!team) return { error: null };
    // upsert: a double tap (or a slow reload) never fails with “already on this game”
    return supabase.from('hoop_game_players').upsert({ game_id: game.id, ...who(pid), team, on_court: true }, { onConflict: isGuest(pid) ? 'game_id,guest_id' : 'game_id,member_id' });
  };
  const setTeam = (pid: string, team: 'A' | 'B' | null) => run(() => writeTeam(pid, team) as any).then(loadPlayers);
  const togglePaid = (b: GamePlayer) => run(() => supabase.from('hoop_game_players').update({ paid: !b.paid, paid_at: b.paid ? null : new Date().toISOString() }).eq('game_id', sessionId).eq(col(b.profile_id), b.profile_id)).then(loadPlayers);
  /** Admin: tap when a player shows up at the court — first to arrive plays first. Tap again to undo. */
  const toggleArrived = (b: GamePlayer) => run(() => supabase.from('hoop_game_players').update({ arrived_at: b.arrived_at ? null : new Date(now()).toISOString() }).eq('game_id', sessionId).eq(col(b.profile_id), b.profile_id)).then(loadPlayers);
  /** Admin: change how many players can book this schedule. */
  const setSlots = async (n: number) => {
    if (n < Math.max(2, bookings.length)) return setErr(n < 2 ? 'At least 2 slots.' : `${bookings.length} players already booked — remove someone first to go lower.`);
    if (n > 60) return;
    const ok = await run(() => supabase.from('hoop_games').update({ slots: n }).eq('id', sessionId));
    if (ok) { if (isFirst) setGame((g) => (g ? { ...g, slots: n } : g)); loadPlayers(); }
  };
  /** Admin: a player who isn't on the app yet. They play and score in this schedule, but nothing is saved to any card. */
  const addGuest = async () => {
    const name = (prompt('Guest player’s name (not on the app yet):') || '').trim().slice(0, 40);
    if (!name) return;
    setAdding(false);
    await run(() => supabase.from('hoop_game_players').insert({ game_id: sessionId, guest_id: crypto.randomUUID(), guest_name: name, arrived_at: new Date(now()).toISOString() }));
    loadPlayers();
  };
  /** Fills both teams with the players who have played the fewest games of this schedule. */
  const autoPick = async () => {
    const n = Number(prompt('Players per team?', '5'));
    if (!(n >= 1 && n <= 30)) return;
    // fewest games first; ties go to whoever arrived first. Once arrivals are marked, players not at the court yet are skipped.
    const pool = bookings.filter((b) => canPlay(b) && present(b));
    if (pool.length < n * 2 && !confirm(`Only ${pool.length} ${arrivalsOn ? 'arrived' : 'booked'} — fill the teams anyway?`)) return;
    const order = [...pool].sort((a, b) => (played[a.profile_id] || 0) - (played[b.profile_id] || 0) || byArrival(a, b));
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
    const hasStats = events.some((e) => e.profile_id === pid);
    if (!(await confirmDelete({ title: `Remove ${nameOf(pid)} from this game?`, message: hasStats ? 'Their stats in this game will be removed too.' : undefined, typeToConfirm: hasStats, confirmLabel: 'Remove' }))) return;
    if (events.some((e) => e.profile_id === pid)) await supabase.from('hoop_events').delete().eq('game_id', game.id).eq(col(pid), pid);
    await run(() => supabase.from('hoop_game_players').delete().eq('game_id', game.id).eq(col(pid), pid));
    load();
  };
  /** Admin: a club member (with or without an account), or any Fan account — adding them also approves their club card. */
  const addPlayer = async (p: { member_id?: string; profile_id?: string }) => {
    setAdding(false);
    const here = lateAdd.current; lateAdd.current = false; setLatePick(false);
    await run(() => supabase.from('hoop_game_players').insert({ game_id: sessionId, ...p, ...(here ? { arrived_at: new Date(now()).toISOString() } : {}) }));
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
    const prepared = session.filter((g) => g.session_id && g.status === 'scheduled');
    if (!confirm(`End this schedule?\n\n${playedGames} game${playedGames === 1 ? '' : 's'} played. No more games can be added, and everyone’s stats stay on their cards.`
      + (prepared.length ? `\n\nThe prepared next game (not played yet) will be removed.` : ''))) return;
    setBusy(true); setErr(null);
    for (const g of prepared) {
      const { error: de } = await supabase.from('hoop_games').delete().eq('id', g.id);
      if (de) { setBusy(false); return setErr(errorMessage(de)); }
    }
    const { error } = await supabase.from('hoop_games').update({ closed_at: new Date().toISOString() }).eq('id', sessionId);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    if (!isFirst && game.status === 'scheduled') go({ name: 'hoopGame', id: sessionId }); else loadPlayers();
  };
  const reopenSchedule = () => run(() => supabase.from('hoop_games').update({ closed_at: null }).eq('id', sessionId)).then(loadPlayers);
  const nextGame = async () => {
    const lineup = nextUp.map(({ b }) => b.profiles?.display_name || 'Player');
    if (!confirm(`Start Game ${session.length + 1} of this schedule?\n\nEveryone starts as sitting out — you pick the new teams.`
      + (lineup.length ? `\n\nUp next (played the least): ${lineup.join(', ')}` : ''))) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from('hoop_games').insert({
      session_id: sessionId, title: root.title, venue: root.venue, starts_at: new Date().toISOString(), slots: root.slots,
      period_seconds: game.period_seconds, periods, team_a: game.team_a, team_b: game.team_b, created_by: user?.id,
    }).select('id').single();
    if (error && (error as any).code === '23505') {   // a next game was already prepared → open it
      const { data: ex } = await supabase.from('hoop_games').select('id').eq('session_id', sessionId).eq('status', 'scheduled').maybeSingle();
      setBusy(false);
      if (ex) return go({ name: 'hoopGame', id: (ex as any).id as string });
    }
    if (error) { setBusy(false); return setErr(errorMessage(error)); }
    setBusy(false);
    go({ name: 'hoopGame', id: (data as any).id as string });   // no teams yet: everyone is sitting out until the admin picks
  };

  // ---------- admin: set up the NEXT game's teams while this one is still being played
  const nextG = session.find((g) => g.session_id && g.status === 'scheduled' && g.id !== game.id) || null;
  const playedGames = session.filter((g) => g.status === 'live' || g.status === 'final');
  const latestPlayed = playedGames[playedGames.length - 1];
  const nextNo = nextG ? session.indexOf(nextG) + 1 : session.length + 1;
  const nextTeam = (pid: string) => (nextG?.hoop_game_players.find((x) => x.profile_id === pid)?.team as 'A' | 'B' | null) ?? null;
  const nextPool = bookings.filter((b) => canPlay(b) && present(b))
    .sort((a, b) => afterThis(a.profile_id) - afterThis(b.profile_id) || byArrival(a, b));
  const pickNext = async (pid: string, team: 'A' | 'B' | null) => {
    setBusy(true); setErr(null);
    try {
      let gid = nextG?.id;
      if (!gid) {
        if (!team) return;
        creatingNext.current = creatingNext.current || makeNextGame();
        try { gid = await creatingNext.current; } catch (e) { creatingNext.current = null; throw e; }
      }
      const q = isGuest(pid) ? { col: 'guest_id', on: 'game_id,guest_id' } : { col: 'member_id', on: 'game_id,member_id' };
      const { error } = team
        ? await supabase.from('hoop_game_players').upsert({ game_id: gid, ...who(pid), team }, { onConflict: q.on })
        : await supabase.from('hoop_game_players').delete().eq('game_id', gid).eq(q.col, pid);
      if (error) throw error;
    } catch (e) { setErr(errorMessage(e)); }
    await loadPlayers();
    creatingNext.current = null;   // the next game is in the list now
    setBusy(false);
  };
  /** Creates the next (scheduled) game once; if one already exists (another admin was faster), uses that one. */
  const makeNextGame = async (): Promise<string> => {
    const { data, error } = await supabase.from('hoop_games').insert({
      session_id: sessionId, title: root.title, venue: root.venue, starts_at: new Date().toISOString(), slots: root.slots,
      period_seconds: game.period_seconds, periods, team_a: game.team_a, team_b: game.team_b, created_by: user?.id,
    }).select('id').single();
    if (!error) return (data as any).id as string;
    if ((error as any).code !== '23505') throw error;
    const { data: ex } = await supabase.from('hoop_games').select('id').eq('session_id', sessionId).eq('status', 'scheduled').maybeSingle();
    if (!ex) throw error;
    return (ex as any).id as string;
  };

  /** Admin: a player has to leave (emergency…): off the next game's team, out of the pick lists; stats and payment stay. */
  const markLeft = async (b: GamePlayer, left: boolean) => {
    if (left && !confirm(`${nameOf(b.profile_id)} left the court?\n\nThey come off Game ${nextNo}'s team and won't be suggested for the next games. Their stats and payment stay.`)) return;
    setBusy(true); setErr(null);
    const r1 = await supabase.from('hoop_game_players').update({ left_at: left ? new Date().toISOString() : null }).eq('game_id', sessionId).eq(col(b.profile_id), b.profile_id);
    const r2 = !r1.error && left && nextG && nextTeam(b.profile_id)
      ? await supabase.from('hoop_game_players').delete().eq('game_id', nextG.id).eq(col(b.profile_id), b.profile_id) : { error: null };
    setBusy(false);
    if (r1.error || r2.error) setErr(errorMessage(r1.error || r2.error));
    loadPlayers();
  };
  const leftEarly = bookings.filter((b) => b.left_at);
  const nextPanel = isModerator && !root.closed_at && !!latestPlayed && latestPlayed.id === game.id;

  // ---------- admin: game flow
  const begin = async () => {
    const other = session.find((g) => g.id !== game.id && g.status === 'live');
    if (other) return setErr(`Game ${session.indexOf(other) + 1} is still live. Finish it first, then start this one.`);
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
  const cancelGame = async () => { if (await confirmDelete({ title: 'Cancel this game?', message: 'Players will see it as cancelled. You can un-cancel it later.', confirmLabel: 'Cancel game' })) patchGame({ status: 'cancelled' }); };
  const restore = () => patchGame({ status: 'scheduled' });
  const deleteGame = async () => {
    const played = isFirst ? session.filter((g) => g.status === 'final' || g.status === 'live').length : (game.status === 'final' || game.status === 'live' ? 1 : 0);
    if (played > 0 && !isMainAdmin) return setErr('Only the club owner can delete a game that was already played.');
    if (!(await confirmDelete({
      title: isFirst ? 'Delete this whole schedule?' : `Delete Game ${gameNo}?`,
      message: isFirst
        ? `Everything in it is deleted for good: bookings, payments, the team chat${session.length > 1 ? `, all ${session.length} games` : ''}${played ? ' and every player’s stats from these games' : ''}.`
        : `Its score and every player’s stats from this game are deleted for good.`,
      typeToConfirm: true,
    }))) return;
    if (await run(() => supabase.from('hoop_games').delete().eq('id', game.id))) go(isFirst ? clubHome : { name: 'hoopGame', id: sessionId });
  };

  // ---------- admin: clock
  const clockStart = () => patchGame({ clock_running: true, clock_started_at: new Date(now()).toISOString(), ...(left <= 0 ? { clock_elapsed_ms: 0 } : {}) });
  const clockPause = () => patchGame({ clock_running: false, clock_started_at: null, clock_elapsed_ms: game.period_seconds * 1000 - clockLeftMs(game, now()) });
  const clockReset = () => patchGame({ clock_running: false, clock_started_at: null, clock_elapsed_ms: 0 });
  const lastPeriod = game.period >= periods;
  const nextPeriod = () => {
    const name = periodName(game.period + 1, periods);
    if (game.period >= 9) return setErr('That’s the most periods a game can have — finish the game.');
    if (confirm(lastPeriod ? `Go to overtime (${name})?` : `Start period ${name} of ${periods}?`)) patchGame({ period: game.period + 1, clock_running: false, clock_started_at: null, clock_elapsed_ms: 0 });
  };
  const setPeriods = (n: number) => { if (n >= 1 && n <= 8 && n !== periods) patchGame({ periods: n } as any); };
  const setMinutes = (delta: number) => {
    const s = Math.min(3600, Math.max(60, game.period_seconds + delta * 60));
    patchGame({ period_seconds: s, ...(game.clock_running ? {} : { clock_elapsed_ms: Math.min(game.clock_elapsed_ms, s * 1000) }) });
  };

  // ---------- admin: stats
  const addEvent = async (pid: string, kind: Kind) => {
    setErr(null);
    const { data, error } = await supabase.from('hoop_events').insert({ game_id: game.id, ...(isGuest(pid) ? { guest_id: pid } : { member_id: pid }), team: 'A', kind }).select('*').single();
    if (error) { setErr(errorMessage(error)); return false; }
    setEvents((xs) => (xs.some((x) => x.id === (data as any).id) ? xs : [...xs, normEvent(data)]));
    if (navigator.vibrate) navigator.vibrate(15);
    return true;
  };
  const record = async (kind: Kind) => {
    if (!sel) return setErr('Tap a player first.');
    if (players.some((p) => p.profile_id === sel && p.on_court === false)) { setSel(null); return setErr('That player is on the bench. Tap a player on the court.'); }
    await addEvent(sel, kind);
  };
  /** Fix mode: take back the player's most recent stat of this kind. */
  const takeBack = (pid: string, kind: Kind) => {
    const last = [...events].reverse().find((e) => e.profile_id === pid && e.kind === kind && !removing.current.has(e.id));
    if (last) removeEvent(last);
  };
  /** Latest plays: change a wrong stat into the right one (e.g. +3 → +2). */
  const changePlay = async (e: HoopEvent, kind: Kind) => {
    setChanging(null);
    if (kind === e.kind) return;
    if (await addEvent(e.profile_id, kind)) await removeEvent(e);
  };
  const removeEvent = async (e: HoopEvent) => {
    if (removing.current.has(e.id)) return;
    removing.current.add(e.id);
    const { error } = await supabase.from('hoop_events').delete().eq('id', e.id);
    removing.current.delete(e.id);
    if (error) return setErr(errorMessage(error));
    setEvents((xs) => xs.filter((x) => x.id !== e.id));
  };
  const undo = () => { const last = [...events].reverse().find((e) => !removing.current.has(e.id)); if (last) removeEvent(last); };

  const live = game.status === 'live';
  const showScore = live || game.status === 'final';
  const winner = game.status === 'final' ? (score.A > score.B ? 'A' : score.B > score.A ? 'B' : null) : null;
  // one-game cards (finished games): Game 1, 2, 3… of this schedule
  const cardInfo = (pid: string): GameCardInfo | null => {
    const t = teamOf(pid);
    if (!t) return null;
    const mineS = score[t], theirs = score[t === 'A' ? 'B' : 'A'];
    return { title: root.title, gameNo, startsAt: game.started_at || game.starts_at, result: mineS > theirs ? 'W' : mineS < theirs ? 'L' : 'T', mine: mineS, theirs, line: lines[pid] };
  };
  const myCardInfo = game.status === 'final' && me ? cardInfo(me.id) : null;

  // ---------------------------------------------------------------- UI pieces
  // ---------- subs (live game): a player goes to the bench but keeps their team + stats; someone else comes in
  const onCourt = (p: GamePlayer) => p.on_court !== false;
  const setOnCourt = (pid: string, on: boolean) => supabase.from('hoop_game_players').update({ on_court: on }).eq('game_id', game.id).eq(col(pid), pid);
  const swapSub = async (outPid: string, inPid: string, team: 'A' | 'B') => {
    setBusy(true); setErr(null);
    try {
      const r1 = await setOnCourt(outPid, false);
      if (r1.error) throw r1.error;
      const row = players.find((p) => p.profile_id === inPid);
      if (!(row && row.team === team)) {
        const r2: any = await writeTeam(inPid, team);
        if (r2?.error) { await setOnCourt(outPid, true); throw r2.error; }
      }
      const r3 = await setOnCourt(inPid, true);
      if (r3.error) { await setOnCourt(outPid, true); throw r3.error; }
      if (sel === outPid) setSel(inPid);
      setSubFor(null);
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
    loadPlayers();
  };
  const backIn = (pid: string) => run(() => setOnCourt(pid, true) as any).then(loadPlayers);

  const teamCol = (team: 'A' | 'B', list: GamePlayer[]) => {
    const court = list.filter(onCourt), bench = list.filter((p) => !onCourt(p));
    const canSub = isModerator && live;
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-black uppercase tracking-wider truncate" style={{ color: team === 'A' ? H.orange : '#D6D3D1' }}>{team === 'A' ? game.team_a : game.team_b}</p>
        {court.map((p) => {
          const on = sel === p.profile_id;
          const l = lines[p.profile_id];
          return (
            <div key={p.profile_id} className="space-y-1">
              <div className={`flex items-stretch rounded-xl border transition-colors ${on ? 'border-[var(--hp)] bg-[var(--hp)]/15' : 'border-white/10 bg-white/[0.03]'}`}>
                <button onClick={() => setSel(on ? null : p.profile_id)} aria-pressed={on}
                  className="flex-1 min-w-0 flex items-center gap-2 p-1.5 text-left cursor-pointer hover:bg-white/[0.04] rounded-l-xl">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center font-hoop italic font-black text-[15px] flex-shrink-0" style={{ background: team === 'A' ? H.orange : '#3A3A3A', color: team === 'A' ? '#111' : '#F4F1EE' }}>{jersey[p.profile_id] ?? '–'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-bold text-white truncate">{short(p.profiles?.display_name)}</span>
                    <span className="block text-[10px] leading-tight text-[#A8A29E]"><strong className="text-white">{l?.pts ?? 0}</strong> pts · {l?.reb ?? 0} reb · {l?.ast ?? 0} ast</span>
                    <span className="block text-[10px] leading-tight text-[#A8A29E]">{l?.stl ?? 0} stl · {l?.blk ?? 0} blk · {l?.tov ?? 0} to · <span className={(l?.foul ?? 0) >= 4 ? 'text-[#FF8A9C] font-bold' : ''}>{l?.foul ?? 0} foul</span></span>
                  </span>
                </button>
                {canSub && (
                  <button onClick={() => setSubFor(subFor === p.profile_id ? null : p.profile_id)} aria-expanded={subFor === p.profile_id} aria-label={`Sub out ${p.profiles?.display_name || 'player'}`}
                    className={`w-10 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 border-l border-white/10 rounded-r-xl cursor-pointer text-[9px] font-black ${subFor === p.profile_id ? 'bg-[var(--hp)] text-[#111]' : 'text-[#D6D3D1] hover:bg-white/[0.06]'}`}>
                    <Shuffle className="w-3.5 h-3.5" />SUB
                  </button>
                )}
              </div>
              {canSub && subFor === p.profile_id && (() => {
                const cands = [...bench.filter((b) => b.profile_id !== p.profile_id && !bookingOf(b.profile_id)?.left_at), ...sittingOut.filter((b) => canPlay(b) && present(bookingOf(b.profile_id) || b))];
                return (
                  <div className="p-2 rounded-xl border border-[var(--hp)]/50 space-y-1.5" style={{ background: 'color-mix(in srgb, var(--hp) 8%, #141414)' }}>
                    <p className="text-[10px] font-bold text-white">{short(p.profiles?.display_name)} goes to the bench — who comes in?</p>
                    {cands.length === 0 && <p className="text-[10px] text-[#A8A29E]">No one is available. Add a player with “Change teams / add a player”.</p>}
                    {cands.map((c) => (
                      <button key={c.profile_id} onClick={() => swapSub(p.profile_id, c.profile_id, team)} disabled={busy}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-left cursor-pointer hover:border-[var(--hp)]">
                        <HoopFace avatar={c.profiles?.avatar_url} name={c.profiles?.display_name} cardPhoto={faces[c.profile_id]?.url} cardCrop={faces[c.profile_id]?.crop} size={22} />
                        <span className="flex-1 min-w-0 text-[11px] font-bold text-white truncate">{short(c.profiles?.display_name)}</span>
                        <span className="text-[9px] font-black text-[var(--hp)]">{c.team === team ? 'BENCH' : 'IN'}</span>
                      </button>
                    ))}
                    <button onClick={() => setSubFor(null)} className="w-full text-[10px] font-bold text-[#A8A29E] cursor-pointer py-0.5">Cancel</button>
                  </div>
                );
              })()}
            </div>
          );
        })}
        {bench.length > 0 && (
          <div className="pt-1 space-y-1">
            <p className="text-[9px] font-black tracking-wider text-[#78716C]">BENCH · stats still count</p>
            {bench.map((p) => {
              const l = lines[p.profile_id];
              return (
                <div key={p.profile_id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg border border-dashed border-white/15 opacity-70">
                  <span className="w-6 h-6 rounded-md flex items-center justify-center font-hoop italic font-black text-[12px] flex-shrink-0 bg-white/10 text-[#D6D3D1]">{jersey[p.profile_id] ?? '–'}</span>
                  <span className="flex-1 min-w-0 text-[11px] font-bold text-[#D6D3D1] truncate">{short(p.profiles?.display_name)} <span className="font-normal text-[#A8A29E]">{l?.pts ?? 0}p</span></span>
                  {canSub && <button onClick={() => backIn(p.profile_id)} disabled={busy} className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-white/10 text-white cursor-pointer">BACK IN</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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
          <HoopFace avatar={p.profiles?.avatar_url} name={p.profiles?.display_name} cardPhoto={faces[p.profile_id]?.url} cardCrop={faces[p.profile_id]?.crop} size={30} />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-[12px] font-bold text-white truncate">{p.profiles?.display_name || 'Member'}</span>
              {p.is_guest && <span className="px-1 rounded text-[8px] font-black bg-white/15 text-[#D6D3D1] flex-shrink-0">GUEST</span>}
            </span>
            <span className="flex flex-wrap items-center gap-1 mt-0.5">
              {(() => {
                const b = bookingOf(p.profile_id) || p;
                const r = arrivalRank(p.profile_id);
                return (
                  <button onClick={() => toggleArrived(b)} disabled={busy} aria-pressed={!!b.arrived_at} title={b.arrived_at ? 'Arrived — tap to undo' : 'Tap when this player arrives at the court'}
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black cursor-pointer border ${b.arrived_at ? 'bg-[var(--hp)]/20 text-[var(--hp)] border-[var(--hp)]/50' : 'bg-white/[0.04] text-[#A8A29E] border-white/15 border-dashed'}`}>
                    {b.arrived_at ? <><CheckCircle2 className="w-2.5 h-2.5" />ARRIVED #{r}</> : 'NOT HERE YET'}
                  </button>
                );
              })()}
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
              className={`flex-1 px-2 py-1.5 cursor-pointer truncate ${t === tm ? (tm === 'A' ? 'bg-[var(--hp)] text-[#111]' : tm === 'B' ? 'bg-[#D6D3D1] text-[#111]' : 'bg-white/20 text-white') : 'text-[#A8A29E] hover:bg-white/10'}`}>
              {tm === 'A' ? game.team_a.toUpperCase() : tm === 'B' ? game.team_b.toUpperCase() : 'SITTING OUT'}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // fewest games of this schedule first, then first come, first play
  const sortedForRoster = [...everyone].sort((a, b) => (played[a.profile_id] || 0) - (played[b.profile_id] || 0) || byQueue(a, b));
  const rosterManager = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[13px] font-bold text-white flex items-center gap-1.5"><Users className="w-4 h-4 text-[var(--hp)]" />Players ({bookings.length}/{root.slots}) · <span className="text-[#53E6D4]">{paidCount} paid</span> · <span className="text-[var(--hp)]">{arrivedN} here</span></p>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={autoPick} disabled={busy || bookings.length < 2} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`} title="Pick the players who have played the fewest games"><Sparkles className="w-3.5 h-3.5" />Fewest games</button>
          <button onClick={shuffle} disabled={busy} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`}><Shuffle className="w-3.5 h-3.5" />Shuffle</button>
          <button onClick={() => setAdding(!adding)} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`}><UserPlus className="w-3.5 h-3.5" />Add member</button>
          <button onClick={addGuest} disabled={busy} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`} title="Someone who isn’t on the app yet"><Plus className="w-3.5 h-3.5" />Guest</button>
        </div>
      </div>
      <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/10">
        <span className="flex-1 text-[12px] font-bold text-white">Slots <span className="font-normal text-[#A8A29E]">· how many can book</span></span>
        <button onClick={() => setSlots(root.slots - 1)} disabled={busy || root.slots <= Math.max(2, bookings.length)} aria-label="One slot less" className={`${hbtn.icon} !w-8 !h-8 disabled:opacity-35`}><Minus className="w-4 h-4" /></button>
        <span className="w-8 text-center font-hoop italic font-black text-[18px] text-white tabular-nums">{root.slots}</span>
        <button onClick={() => setSlots(root.slots + 1)} disabled={busy || root.slots >= 60} aria-label="One slot more" className={`${hbtn.icon} !w-8 !h-8 disabled:opacity-35`}><Plus className="w-4 h-4" /></button>
      </div>
      <p className="text-[11px] text-[#A8A29E]">
        {teamA.length} on {game.team_a} · {teamB.length} on {game.team_b}
        {(session.length > 1 || !isFirst) && <> · <span className="text-[#8FE36B] font-bold">FRESH</span> = hasn’t played yet today, sorted first</>}
      </p>
      <p className="text-[11px] text-[#A8A29E]">First come, first play — tap <span className="text-[var(--hp)] font-bold">NOT HERE YET</span> when a player arrives. The list follows arrival order. <span className="text-white font-bold">Guests</span> play and score, but their stats aren’t saved.</p>
      {adding && <MemberPicker clubId={club!.id} exclude={everyone.map((p) => p.profile_id)} excludeAccounts={everyone.map((p) => p.account_id || '')} onPick={addPlayer} onCancel={() => setAdding(false)} />}
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
                    <button onClick={() => !p.is_guest && go({ name: 'hoopPlayer', id: p.profile_id })} className={`flex items-center gap-1.5 font-bold text-white whitespace-nowrap ${p.is_guest ? 'cursor-default' : 'hover:text-[var(--hp)] cursor-pointer'}`}>
                      <span className="text-[#A8A29E] font-mono w-5 text-right">{jersey[p.profile_id] ?? ''}</span>{short(p.profiles?.display_name)}
                      {p.is_guest && <span className="px-1 rounded text-[8px] font-black bg-white/15 text-[#D6D3D1]">GUEST</span>}
                    </button>
                    {game.status === 'final' && !p.is_guest && (
                      <button onClick={() => setCardFor(p.profile_id)} aria-label={`${p.profiles?.display_name || 'Player'}’s card for this game`} title="Card for this game"
                        className="ml-1 inline-flex align-middle items-center justify-center w-6 h-6 rounded-md bg-[var(--hp)]/15 text-[var(--hp)] cursor-pointer hover:bg-[var(--hp)]/30"><IdCard className="w-3.5 h-3.5" /></button>
                    )}
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

  // ---------------------------------------------------------------- COURTSIDE (phone in landscape, live or final game)
  const sideCol = (team: 'A' | 'B', list: GamePlayer[]) => (
    <div className="min-h-0 flex flex-col">
      <p className="px-1 pb-1 text-[10px] font-black uppercase tracking-wider truncate" style={{ color: team === 'A' ? H.orange : '#D6D3D1' }}>{team === 'A' ? game.team_a : game.team_b}</p>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
        {[...list.filter(onCourt), ...list.filter((x) => !onCourt(x))].map((p) => {   // fixed order (no jumping around); bench last
          const on = sel === p.profile_id, l = lines[p.profile_id];
          const benched = !onCourt(p);
          const pick = isModerator && live && !benched;
          const Tag = pick ? 'button' : 'div';
          return (
            <Tag key={p.profile_id} {...(pick ? { onClick: () => setSel(on ? null : p.profile_id), 'aria-pressed': on } : {})}
              className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded-lg border text-left ${pick ? 'cursor-pointer' : ''} ${benched ? 'opacity-45 border-dashed border-white/15' : on ? 'border-[var(--hp)] bg-[var(--hp)]/20' : 'border-white/10 bg-white/[0.03]'}`}>
              <span className="w-6 h-6 rounded-md flex items-center justify-center font-hoop italic font-black text-[13px] flex-shrink-0" style={{ background: team === 'A' ? H.orange : '#3A3A3A', color: team === 'A' ? '#111' : '#F4F1EE' }}>{jersey[p.profile_id] ?? '–'}</span>
              <span className="flex-1 min-w-0 text-[12px] font-bold text-white truncate">{short(p.profiles?.display_name)}</span>
              <span className="font-mono text-[11px] text-[#D6D3D1] whitespace-nowrap"><strong className="text-white text-[13px]">{l?.pts ?? 0}</strong>p {l?.reb ?? 0}r {l?.ast ?? 0}a{(l?.foul ?? 0) ? <span className={(l?.foul ?? 0) >= 4 ? ' text-[#FF8A9C] font-bold' : ''}> {l?.foul}f</span> : null}</span>
            </Tag>
          );
        })}
      </div>
    </div>
  );
  const courtside = (
    <div className="fixed inset-0 z-[48] flex flex-col text-white" style={{ background: H.bg, paddingLeft: 'max(10px, env(safe-area-inset-left))', paddingRight: 'max(10px, env(safe-area-inset-right))' }}>
      {/* scoreboard bar */}
      <div className="flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5 border-b border-white/10">
        <div className="flex items-center justify-end gap-3 min-w-0">
          <span className="text-[13px] font-black uppercase tracking-wider text-[var(--hp)] truncate">{game.team_a}</span>
          <span className={`font-hoop italic font-black text-[52px] leading-none tabular-nums ${winner === 'B' ? 'text-[#78716C]' : 'text-white'}`}>{score.A}</span>
        </div>
        <div className="text-center px-3 py-1 rounded-xl bg-white/[0.06] border border-white/10 min-w-[120px]">
          <p className={`font-mono font-bold text-[30px] leading-none tabular-nums ${live && left <= 10000 && game.clock_running ? 'text-[var(--ha)]' : 'text-white'}`}>{fmtClock(left)}</p>
          <p className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-wider text-[#A8A29E]">
            {live && <span className="flex items-center gap-1 px-1 rounded bg-[var(--ha)] text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}
            {game.status === 'final' ? 'FINAL' : game.period > periods ? periodName(game.period, periods) : `PERIOD ${game.period}/${periods}`}
          </p>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`font-hoop italic font-black text-[52px] leading-none tabular-nums ${winner === 'A' ? 'text-[#78716C]' : 'text-white'}`}>{score.B}</span>
          <span className="text-[13px] font-black uppercase tracking-wider text-[#D6D3D1] truncate">{game.team_b}</span>
          <button onClick={() => setCourtsideOff(true)} aria-label="Close the sideways view" className="ml-auto w-9 h-9 flex-shrink-0 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      </div>
      {err && <p role="alert" className="flex-shrink-0 mt-1 px-3 py-1.5 rounded-lg bg-[#FF6B7A]/15 border border-[#FF6B7A]/40 text-[12px] text-[#FFB3BD]">{err}</p>}

      {/* teams on the sides, controls (admin) or latest plays (everyone else) in the middle */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_minmax(250px,1.15fr)_1fr] gap-2.5 py-2">
        {sideCol('A', teamA)}
        <div className="min-h-0 flex flex-col gap-1.5">
          {isModerator && live ? (
            <>
              <div className="flex items-center gap-1.5">
                {game.clock_running
                  ? <button onClick={clockPause} disabled={busy} className={`${hbtn.primary} !py-1.5 !px-3 !text-xs flex-1`}><Pause className="w-4 h-4 fill-current" />Pause</button>
                  : <button onClick={clockStart} disabled={busy} className={`${hbtn.primary} !py-1.5 !px-3 !text-xs flex-1`}><Play className="w-4 h-4 fill-current" />{game.clock_elapsed_ms ? 'Resume' : 'Start'}</button>}
                <button onClick={nextPeriod} disabled={busy} className={`${hbtn.ghost} !py-1.5 !px-2.5 !text-xs`}><SkipForward className="w-4 h-4" />{lastPeriod ? 'OT' : `P${game.period + 1}`}</button>
                <button onClick={undo} disabled={!events.length} aria-label="Undo the last stat" className={`${hbtn.ghost} !py-1.5 !px-2.5 !text-xs`}><Undo2 className="w-4 h-4" /></button>
              </div>
              <p className="text-[11px] font-bold truncate text-center" style={{ color: sel ? H.orange : '#A8A29E' }}>{sel ? `${nameOf(sel)}${jersey[sel] != null ? ` #${jersey[sel]}` : ''}` : 'Tap a player on either side'}</p>
              <div className="flex-1 min-h-0 grid grid-cols-5 grid-rows-2 gap-1.5">
                {KINDS.map((k) => {
                  const n = sel ? events.filter((e) => e.profile_id === sel && e.kind === k.k).length : 0;
                  return (
                    <div key={k.k} className="flex flex-col rounded-xl overflow-hidden min-h-0" style={{ border: k.pts ? 'none' : `1px solid ${k.tone}66`, opacity: sel ? 1 : 0.4 }}>
                      <button onClick={() => record(k.k)} disabled={!sel} aria-label={`Add ${k.short}`}
                        className="flex-1 min-h-0 font-hoop italic font-black text-[17px] cursor-pointer active:brightness-125 disabled:cursor-not-allowed"
                        style={{ background: k.pts ? k.tone : `${k.tone}22`, color: k.pts ? '#111' : k.tone }}>{k.label}</button>
                      <button onClick={() => sel && takeBack(sel, k.k)} disabled={!sel || !n} aria-label={`Take back one ${k.short}`}
                        className="h-6 flex-shrink-0 flex items-center justify-center gap-1 bg-black/55 text-[11px] font-black text-white cursor-pointer disabled:cursor-not-allowed">
                        <Minus className={`w-3 h-3 ${n ? 'text-[#FF8A9C]' : 'text-white/25'}`} /><span className={n ? '' : 'text-white/35'}>{n}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {lastPeriod && <p className="text-[10px] text-center text-[var(--hp)]">Last period — turn your phone upright to finish the game.</p>}
            </>
          ) : (
            <>
              <p className="text-[10px] font-black tracking-wider text-[#A8A29E] text-center">{game.status === 'final' ? 'FINAL · BOX SCORE ON THE SIDES' : 'LATEST PLAYS'}</p>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                {[...events].reverse().slice(0, 30).map((e) => {
                  const k = KINDS.find((x) => x.k === e.kind)!;
                  return (
                    <div key={e.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.03] text-[12px]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.team === 'A' ? H.orange : '#D6D3D1' }} />
                      <span className="flex-1 min-w-0 truncate">{nameOf(e.profile_id)} <strong style={{ color: k.tone }}>{kindPts(e.kind) ? k.label : k.short}</strong></span>
                      <span className="text-[10px] text-[#78716C]">{e.period > periods ? periodName(e.period, periods) : `P${e.period}`}</span>
                    </div>
                  );
                })}
                {!events.length && <p className="text-center text-[12px] text-[#78716C] pt-4">No plays yet.</p>}
              </div>
            </>
          )}
        </div>
        {sideCol('B', teamB)}
      </div>
    </div>
  );

  return (
    <div className="px-3 py-4 space-y-4">
      <button onClick={() => go(clubHome)} className={`${hbtn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" />All games</button>

      {/* mini scoreboard that stays on screen while scrolling */}
      {showScore && !boardVisible && (
        <div className="fixed left-0 right-0 z-30 flex justify-center pointer-events-none" style={{ top: headerH + 6 }}>
          <div className="pointer-events-auto flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-full border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.6)]" style={{ background: 'rgba(20,20,20,0.96)' }}>
            <span className="text-[10px] font-black uppercase text-[var(--hp)] max-w-[70px] truncate">{game.team_a}</span>
            <span className="font-hoop italic font-black text-[22px] leading-none text-white tabular-nums">{score.A}</span>
            <span className="px-2 py-0.5 rounded-md bg-white/[0.08] text-center leading-tight">
              <span className={`block font-mono font-bold text-[13px] tabular-nums ${live && game.clock_running && left <= 10000 ? 'text-[var(--ha)]' : 'text-white'}`}>{fmtClock(left)}</span>
              <span className="block text-[8px] font-bold tracking-wider text-[#A8A29E]">{game.status === 'final' ? 'FINAL' : game.period > periods ? periodName(game.period, periods) : `P${game.period}/${periods}`}</span>
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
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full text-[12px] font-bold border cursor-pointer ${g.id === game.id ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-white/[0.05] border-white/15 text-[#E7E5E4]'}`}>
              {g.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--ha)] animate-pulse" />}
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
              <h1 className="font-hoop italic font-black text-[26px] uppercase text-white leading-none">{root.title}{session.length > 1 && <span className="text-[var(--hp)]"> · G{gameNo}</span>}</h1>
              {live && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--ha)] text-[10px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}
              {game.status === 'final' && <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-black text-white">FINAL</span>}
              {game.status === 'cancelled' && <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-black text-[#A8A29E]">CANCELLED</span>}
            </div>
            <p className="flex flex-wrap items-center justify-center gap-x-3 text-[11px] text-[#A8A29E]">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[var(--hp)]" />{gameDate(game.starts_at)} · {gameTime(game.starts_at)}</span>
              {game.venue && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-[var(--hp)]" />{game.venue}</span>}
            </p>
          </div>

          {showScore ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="text-center min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-[var(--hp)] truncate">{game.team_a}</p>
                <p className={`font-hoop italic font-black text-[56px] leading-none ${winner === 'B' ? 'text-[#78716C]' : 'text-white'}`}>{score.A}</p>
              </div>
              <div className="text-center px-2">
                <p className={`font-mono font-bold text-[26px] tabular-nums ${live && left <= 10000 && game.clock_running ? 'text-[var(--ha)]' : 'text-white'}`}>{fmtClock(left)}</p>
                <p className="text-[10px] font-bold tracking-wider text-[#A8A29E]">{game.status === 'final' ? 'FINAL' : game.period > periods ? `OVERTIME${game.period - periods > 1 ? ` ${game.period - periods}` : ''}` : `PERIOD ${game.period} OF ${periods}`}</p>
              </div>
              <div className="text-center min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#D6D3D1] truncate">{game.team_b}</p>
                <p className={`font-hoop italic font-black text-[56px] leading-none ${winner === 'A' ? 'text-[#78716C]' : 'text-white'}`}>{score.B}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-[13px]">
              <span className="flex items-center gap-1.5 font-bold text-white"><Users className="w-4 h-4 text-[var(--hp)]" />{isFirst ? `${bookings.length} / ${root.slots} booked` : `${teamA.length + teamB.length} picked for this game`}</span>
            </div>
          )}

          {game.notes && <p className="text-[12px] text-[#D6D3D1] text-center whitespace-pre-line">{game.notes}</p>}

          {canBook && (
            mine
              ? <button onClick={book} disabled={busy} className={`${hbtn.ghost} w-full`}><Check className="w-4 h-4 text-[var(--hp)]" />You’re in · Cancel my slot</button>
              : isMember || isModerator
              ? <button onClick={book} disabled={busy || full} className={`${hbtn.primary} w-full`}>{full ? 'Game is full' : 'Book my slot'}</button>
              : <button onClick={book} className={`${hbtn.ghost} w-full !text-xs`}>{me?.status === 'pending' ? 'Waiting for the club to approve your card' : me?.status === 'suspended' ? 'You can’t book in this club' : 'Join this club to book'}</button>
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
        <section className="rounded-2xl p-3.5 space-y-3 border border-[var(--hp)]/40" style={{ background: 'color-mix(in srgb, var(--hp) 6%, transparent)' }}>
          <p className="text-[11px] font-black tracking-wider text-[var(--hp)]">ADMIN · {isFirst ? 'GAME SETUP' : `GAME ${gameNo} SETUP`}</p>
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
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[12px] font-bold text-white">Periods</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setPeriods(n)} disabled={busy} aria-pressed={periods === n}
                    className={`w-9 h-8 rounded-lg text-[13px] font-black cursor-pointer border ${periods === n ? 'bg-[var(--hp)] text-[#111] border-[var(--hp)]' : 'bg-white/[0.04] text-[#D6D3D1] border-white/15'}`}>{n}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[12px] font-bold text-white">Minutes per period</span>
              <button onClick={() => setMinutes(-1)} disabled={busy} aria-label="One minute less per period" className={`${hbtn.icon} !w-8 !h-8`}><Minus className="w-4 h-4" /></button>
              <span className="w-12 text-center text-[13px] font-black text-white">{Math.round(game.period_seconds / 60)} min</span>
              <button onClick={() => setMinutes(1)} disabled={busy} aria-label="One minute more per period" className={`${hbtn.icon} !w-8 !h-8`}><Plus className="w-4 h-4" /></button>
            </div>
            <p className="text-[10px] text-[#A8A29E]">{periods} × {Math.round(game.period_seconds / 60)} min{periods > 1 ? ` = ${periods * Math.round(game.period_seconds / 60)} min game` : ''} · overtime is available if it’s tied</p>
          </div>
          {session.some((g) => g.id !== game.id && g.status === 'live') && (
            <p className="text-[12px] font-bold text-[#FFC34D] text-center">Game {session.findIndex((g) => g.id !== game.id && g.status === 'live') + 1} is still live — finish it first, then begin this one. Teams set here are kept.</p>
          )}
          <button onClick={begin} disabled={busy || teamA.length < MIN_PER_TEAM || teamB.length < MIN_PER_TEAM || session.some((g) => g.id !== game.id && g.status === 'live')} className={`${hbtn.primary} w-full !py-3 !text-base`}><Play className="w-5 h-5 fill-current" />Begin game</button>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditing(true)} className={`${hbtn.ghost} !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />Edit details</button>
            {isFirst && <button onClick={cancelGame} className={`${hbtn.ghost} !py-2 !text-xs`}><Ban className="w-3.5 h-3.5" />Cancel game</button>}
            <button onClick={deleteGame} className={`${hbtn.ghost} !py-2 !text-xs !text-[#FF6B7A]`}><Trash2 className="w-3.5 h-3.5" />Delete</button>
          </div>
        </section>
      )}

      {isModerator && live && (
        <section className="rounded-2xl p-3.5 space-y-3.5 border border-[var(--hp)]/40" style={{ background: 'color-mix(in srgb, var(--hp) 6%, transparent)' }}>
          <p className="text-[11px] font-black tracking-wider text-[var(--hp)]">ADMIN · LIVE CONSOLE</p>

          {/* clock */}
          <div className="flex flex-wrap items-center gap-2">
            {game.clock_running
              ? <button onClick={clockPause} disabled={busy} className={`${hbtn.primary} !py-2`}><Pause className="w-4 h-4 fill-current" />Pause</button>
              : <button onClick={clockStart} disabled={busy} className={`${hbtn.primary} !py-2`}><Play className="w-4 h-4 fill-current" />{game.clock_elapsed_ms ? 'Resume' : 'Start clock'}</button>}
            <button onClick={clockReset} disabled={busy} className={`${hbtn.ghost} !py-2 !px-3`} aria-label="Reset clock"><RotateCcw className="w-4 h-4" /></button>
            <button onClick={nextPeriod} disabled={busy} className={`${hbtn.ghost} !py-2 !px-3 !text-xs`}><SkipForward className="w-4 h-4" />{lastPeriod ? 'Overtime' : `Period ${game.period + 1}`}</button>
            <span className="flex items-center gap-1 ml-auto">
              <button onClick={() => setMinutes(-1)} aria-label="One minute less per period" className={hbtn.icon}><Minus className="w-4 h-4" /></button>
              <span className="text-[11px] font-bold text-white w-12 text-center">{Math.round(game.period_seconds / 60)} min</span>
              <button onClick={() => setMinutes(1)} aria-label="One minute more per period" className={hbtn.icon}><Plus className="w-4 h-4" /></button>
            </span>
          </div>

          {lastPeriod && <p className="text-[11px] font-bold text-[var(--hp)]">{game.period > periods ? 'Overtime' : `Last period (${periods} of ${periods})`} — tap “Finish game” when time’s up{score.A === score.B ? ', or “Overtime” if it’s still tied' : ''}.</p>}

          {/* players */}
          <p className="text-[11px] text-[#A8A29E]">Tap a player, then tap what they did.</p>
          <p className="text-[11px] font-bold text-white">On the court: {teamA.filter(onCourt).length + teamB.filter(onCourt).length} players ({teamA.filter(onCourt).length} vs {teamB.filter(onCourt).length}) <span className="font-normal text-[#A8A29E]">· tap SUB to swap a player</span></p>
          <div className="grid grid-cols-2 gap-2">{teamCol('A', teamA)}{teamCol('B', teamB)}</div>
          {!live && sittingOut.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-[#A8A29E]">Sitting out ({sittingOut.length}) — tap a team to sub them in</p>
              {sittingOut.map((b) => (
                <div key={b.profile_id} className="flex items-center gap-2 p-1.5 rounded-xl bg-white/[0.03] border border-white/10">
                  <HoopFace avatar={b.profiles?.avatar_url} name={b.profiles?.display_name} cardPhoto={faces[b.profile_id]?.url} cardCrop={faces[b.profile_id]?.crop} size={26} />
                  <span className="flex-1 min-w-0 text-[12px] font-bold text-white truncate">{b.profiles?.display_name}</span>
                  <button onClick={() => setTeam(b.profile_id, 'A')} disabled={busy} className="px-2 py-1 rounded-lg text-[10px] font-black bg-[var(--hp)] text-[#111] cursor-pointer max-w-[90px] truncate">+ {game.team_a}</button>
                  <button onClick={() => setTeam(b.profile_id, 'B')} disabled={busy} className="px-2 py-1 rounded-lg text-[10px] font-black bg-[#D6D3D1] text-[#111] cursor-pointer max-w-[90px] truncate">+ {game.team_b}</button>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => setShowTeams(!showTeams)} aria-expanded={showTeams}
            className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left cursor-pointer transition-colors"
            style={{ borderColor: 'var(--hp)', background: showTeams ? 'color-mix(in srgb, var(--hp) 22%, #141414)' : 'color-mix(in srgb, var(--hp) 10%, #141414)' }}>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--hp)] text-[#111] flex-shrink-0"><Users className="w-5 h-5" /></span>
            <span className="flex-1 min-w-0">
              <span className="block font-hoop italic font-black text-[19px] uppercase text-white leading-none">Change teams / add a player</span>
              <span className="block text-[11px] text-[#D6D3D1] mt-1">Swap sides, sub players in or out, add a late player or guest</span>
            </span>
            <ChevronRight className={`w-5 h-5 text-[var(--hp)] transition-transform ${showTeams ? 'rotate-90' : ''}`} />
          </button>
          {showTeams && rosterManager}

          {/* stat buttons: tap the big button to ADD, the − bar under it to TAKE ONE BACK (shows the player's count) */}
          <div className="sticky bottom-[84px] z-20 -mx-1 p-2 rounded-2xl border border-white/15 space-y-2" style={{ background: 'rgba(20,20,20,0.97)' }}>
            <div className="flex items-center gap-2">
              <p className="flex-1 min-w-0 text-[12px] font-bold truncate" style={{ color: sel ? H.orange : '#A8A29E' }}>
                {sel ? <>{nameOf(sel)}{jersey[sel] != null ? ` #${jersey[sel]}` : ''} <span className="font-normal text-[#A8A29E]">· {lines[sel]?.pts ?? 0} pts</span></> : 'Tap a player above first'}
              </p>
              <button onClick={undo} disabled={!events.length} aria-label="Undo the last stat" className="flex items-center gap-1 px-2.5 h-8 rounded-lg bg-white/[0.06] border border-white/15 text-[11px] font-bold text-white cursor-pointer disabled:opacity-35"><Undo2 className="w-4 h-4" />Undo last</button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {KINDS.map((k) => {
                const n = sel ? events.filter((e) => e.profile_id === sel && e.kind === k.k).length : 0;
                return (
                  <div key={k.k} className="flex flex-col rounded-xl overflow-hidden" style={{ border: k.pts ? 'none' : `1px solid ${k.tone}66`, opacity: sel ? 1 : 0.4 }}>
                    <button onClick={() => record(k.k)} disabled={!sel} aria-label={`Add ${k.short}`}
                      className="h-11 font-hoop italic font-black text-[18px] cursor-pointer active:brightness-125 disabled:cursor-not-allowed"
                      style={{ background: k.pts ? k.tone : `${k.tone}22`, color: k.pts ? '#111' : k.tone }}>{k.label}</button>
                    <button onClick={() => sel && takeBack(sel, k.k)} disabled={!sel || !n} aria-label={`Take back one ${k.short}${n ? ` (has ${n})` : ''}`}
                      className="h-7 flex items-center justify-center gap-1 bg-black/55 text-white text-[12px] font-black cursor-pointer active:bg-black/80 disabled:cursor-not-allowed">
                      <Minus className={`w-3.5 h-3.5 ${n ? 'text-[#FF8A9C]' : 'text-white/25'}`} /><span className={n ? '' : 'text-white/35'}>{n}</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-center text-[#78716C]">Big button = add · <Minus className="inline w-3 h-3 -mt-0.5" /> = take one back from this player</p>
          </div>

          {/* play-by-play */}
          {events.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-[#A8A29E]">Latest plays <span className="font-normal">· tap <Pencil className="inline w-3 h-3" /> to change a wrong stat, <X className="inline w-3 h-3" /> to remove it</span></p>
              {[...events].reverse().slice(0, 8).map((e) => {
                const k = KINDS.find((x) => x.k === e.kind)!;
                return (
                  <div key={e.id} className="rounded-lg bg-white/[0.03]">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.team === 'A' ? H.orange : '#D6D3D1' }} />
                      <span className="flex-1 min-w-0 truncate text-white">{nameOf(e.profile_id)} <strong style={{ color: k.tone }}>{kindPts(e.kind) ? k.label : k.short}</strong></span>
                      <span className="text-[10px] text-[#A8A29E]">{e.period > periods ? periodName(e.period, periods) : `P${e.period}`}</span>
                      <button onClick={() => setChanging(changing === e.id ? null : e.id)} aria-label="Change this play" aria-expanded={changing === e.id} className={`cursor-pointer ${changing === e.id ? 'text-[var(--hp)]' : 'text-[#A8A29E] hover:text-white'}`}><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => removeEvent(e)} aria-label="Remove this play" className="text-[#A8A29E] hover:text-[#FF6B7A] cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {changing === e.id && (
                      <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                        <span className="w-full text-[10px] text-[#A8A29E]">Change to:</span>
                        {KINDS.filter((x) => x.k !== e.kind).map((x) => (
                          <button key={x.k} onClick={() => changePlay(e, x.k)} className="px-2 h-7 rounded-md font-hoop italic font-black text-[13px] cursor-pointer"
                            style={{ background: x.pts ? x.tone : `${x.tone}22`, color: x.pts ? '#111' : x.tone, border: x.pts ? 'none' : `1px solid ${x.tone}66` }}>{x.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}



          <button onClick={finish} disabled={busy} className={`${hbtn.danger} w-full !py-3`}><Flag className="w-5 h-5" />Finish game</button>
        </section>
      )}

      {/* NEXT UP: next game's line-up, prepared while this game is being set up / played */}
      {!nextPanel && !root.closed_at && game.status !== 'cancelled' && bookings.length > 0 && (session.length === 0 || session[session.length - 1].id === game.id) && (
        <section className="rounded-2xl p-3.5 space-y-3 border border-[var(--hp)]/40" style={{ background: 'color-mix(in srgb, var(--hp) 7%, #161616)' }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-black tracking-wider text-[var(--hp)]">NEXT UP · GAME {Math.max(session.length, 1) + 1}</p>
              <p className="text-[11px] text-[#A8A29E] mt-0.5">Who plays next: fewest games first, then who arrived first{arrivalsOn ? ' (only players at the court)' : ''}. You pick their teams when the next game starts.</p>
            </div>
            <span className="px-2 py-1 rounded-lg bg-white/[0.06] text-[10px] font-bold text-[#D6D3D1] whitespace-nowrap">{perTeam} vs {perTeam}</span>
          </div>
          {teamA.length + teamB.length === 0 && game.status === 'scheduled' && (
            <p className="text-[11px] text-[#FFC34D]">Pick this game’s teams first — the next line-up then skips whoever plays now.</p>
          )}
          {nextUp.length === 0 ? <p className="text-[12px] text-[#A8A29E]">No players yet.</p> : (
            <div className="grid grid-cols-2 gap-1.5">
              {nextUp.map(({ b }, i) => {
                const n = afterThis(b.profile_id);
                const r = arrivalRank(b.profile_id);
                return (
                  <div key={b.profile_id} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-black/25 border border-white/10">
                    <span className="w-4 text-[9px] font-black text-[#78716C] text-center">{i + 1}</span>
                    <HoopFace avatar={b.profiles?.avatar_url} name={b.profiles?.display_name} cardPhoto={faces[b.profile_id]?.url} cardCrop={faces[b.profile_id]?.crop} size={24} />
                    <span className="flex-1 min-w-0 text-[11px] font-bold text-white truncate">{short(b.profiles?.display_name)}</span>
                    <span className={`px-1 rounded text-[8px] font-black ${n === 0 ? 'bg-[#8FE36B]/15 text-[#8FE36B]' : 'bg-white/10 text-[#D6D3D1]'}`} title={`${n} game${n === 1 ? '' : 's'} played after this one`}>{n === 0 ? 'FRESH' : `${n} GP`}</span>
                    {r > 0 && <span className="text-[8px] font-black text-[var(--hp)]" title="Arrival order">#{r}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {nextUp.length > 0 && nextUp.length < perTeam * 2 && <p className="text-[11px] text-[#FFC34D]">Only {nextUp.length} player{nextUp.length === 1 ? '' : 's'} available{arrivalsOn ? ' at the court' : ''} — need {perTeam * 2} for {perTeam} vs {perTeam}.</p>}
          {waitingAfter.length > 0 && (
            <p className="text-[11px] text-[#A8A29E] leading-relaxed"><span className="font-bold text-white">Waiting after that:</span> {waitingAfter.map((b) => `${short(b.profiles?.display_name)} (${afterThis(b.profile_id)} GP)`).join(' · ')}</p>
          )}
        </section>
      )}

      {root.closed_at ? (
        <div className="p-3.5 rounded-2xl border border-white/15 text-center space-y-2" style={{ background: H.surface }}>
          <p className="font-hoop italic font-black text-[20px] uppercase text-white">Schedule finished</p>
          <p className="text-[12px] text-[#A8A29E]">{session.filter((g) => g.status === 'final').length} games played · ended {gameTime(root.closed_at)}</p>
          {me && (
            <button onClick={async () => {
              setBusy(true); setErr(null);
              const n = await loadNightCard(me.id, root.id).catch(() => null);
              setBusy(false);
              if (!n) return setErr('You didn’t play a finished game in this schedule, so there’s no night card yet.');
              setNight(n);
            }} disabled={busy} className={`${hbtn.primary} w-full !py-2.5`}><IdCard className="w-4 h-4" />My card for the whole night</button>
          )}
          {isModerator && <button onClick={reopenSchedule} disabled={busy} className={`${hbtn.ghost} !py-2 !text-xs`}><RotateCcw className="w-3.5 h-3.5" />Reopen schedule</button>}
        </div>
      ) : isModerator && game.status === 'final' && !session.some((g) => g.status === 'live') && (
        <div className="space-y-2">
          {!session.some((g) => g.status === 'scheduled' && g.session_id) && (
            <button onClick={nextGame} disabled={busy} className={`${hbtn.primary} w-full !py-3 !text-base`}><Plus className="w-5 h-5" />Start Game {session.length + 1} — pick new teams</button>
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
                <HoopFace avatar={b.profiles?.avatar_url} name={b.profiles?.display_name} cardPhoto={faces[b.profile_id]?.url} cardCrop={faces[b.profile_id]?.crop} size={26} />
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

      {/* NEXT GAME LINE-UP: pick Game N+1's teams while this game is still going (admins) */}
      {nextPanel && (() => {
        const nA = (nextG?.hoop_game_players || []).filter((x) => x.team === 'A').length, nB = (nextG?.hoop_game_players || []).filter((x) => x.team === 'B').length;
        const teamBtn = (pid: string, t: 'A' | 'B') => {
          const on = nextTeam(pid) === t;
          return (
            <button onClick={() => pickNext(pid, on ? null : t)} disabled={busy} aria-pressed={on}
              aria-label={`${on ? 'Take off' : 'Put on'} ${t === 'A' ? game.team_a : game.team_b} for Game ${nextNo}: ${nameOf(pid)}`}
              className={`h-8 min-w-[52px] px-2 rounded-lg text-[10px] font-black cursor-pointer border ${on ? 'border-transparent' : 'border-white/15 text-[#A8A29E] bg-transparent hover:border-white/35'}`}
              style={on ? { background: t === 'A' ? H.orange : '#D6D3D1', color: '#111' } : undefined}>{(t === 'A' ? game.team_a : game.team_b).replace(/^team\s+/i, '').slice(0, 7).toUpperCase()}</button>
          );
        };
        return (
          <section className="space-y-2.5">
            <button onClick={() => setShowNext(!showNext)} aria-expanded={showNext}
              className="w-full flex items-center gap-3 p-3 rounded-2xl border text-left cursor-pointer"
              style={{ borderColor: 'color-mix(in srgb, var(--hp) 55%, transparent)', background: 'linear-gradient(110deg, color-mix(in srgb, var(--hp) 16%, #141414), #141414 80%)' }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--hp)] text-[#111] flex-shrink-0"><Shuffle className="w-5 h-5" /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-hoop italic font-black text-[20px] uppercase text-white leading-none">Line-up for Game {nextNo}</span>
                <span className="block text-[11px] text-[#D6D3D1] mt-1">{nA + nB ? `${game.team_a} ${nA} · ${game.team_b} ${nB} ready` : 'Set the next teams now'} · {showNext ? 'tap to hide' : 'tap to show'}</span>
              </span>
              <ChevronDown className={`w-5 h-5 text-[#D6D3D1] flex-shrink-0 transition-transform ${showNext ? 'rotate-180' : ''}`} />
            </button>
            {showNext && (
              <div className="rounded-2xl p-3 space-y-2 border border-white/10" style={{ background: H.surface }}>
                <p className="text-[11px] text-[#A8A29E] leading-snug">Everyone {arrivalsOn ? 'at the court' : 'booked'}, <span className="text-[#8FE36B] font-bold">fresh</span> players first. Tap a team to put them in Game {nextNo}; tap again to take them off. When this game ends, Game {nextNo} is ready to start.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { lateAdd.current = !latePick; setLatePick(!latePick); }} disabled={busy} className={`${hbtn.ghost} !py-2 !text-xs`}><UserPlus className="w-3.5 h-3.5" />Just arrived: club player</button>
                  <button onClick={addGuest} disabled={busy} className={`${hbtn.ghost} !py-2 !text-xs`}><Plus className="w-3.5 h-3.5" />Just arrived: guest</button>
                </div>
                {latePick && <MemberPicker clubId={club!.id} exclude={everyone.map((p) => p.profile_id)} excludeAccounts={everyone.map((p) => p.account_id || '')} onPick={addPlayer} onCancel={() => { lateAdd.current = false; setLatePick(false); }} />}
                {nextPool.length === 0 ? <p className="text-[12px] text-[#A8A29E]">No players yet.</p> : nextPool.map((b) => {
                  const n = afterThis(b.profile_id);
                  const nowOn = teamOf(b.profile_id);
                  return (
                    <div key={b.profile_id} className="flex items-center gap-2 p-1.5 rounded-xl bg-black/25 border border-white/[0.07]">
                      <HoopFace avatar={b.profiles?.avatar_url} name={b.profiles?.display_name} cardPhoto={faces[b.profile_id]?.url} cardCrop={faces[b.profile_id]?.crop} size={28} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-bold text-white truncate">{short(b.profiles?.display_name)}</span>
                        <span className="flex items-center gap-1 mt-0.5">
                          <span className={`px-1 rounded text-[8px] font-black ${n === 0 ? 'bg-[#8FE36B]/15 text-[#8FE36B]' : 'bg-white/10 text-[#D6D3D1]'}`}>{n === 0 ? 'FRESH' : `${n} GP`}</span>
                          {nowOn && game.status === 'live' && <span className="text-[9px] text-[#A8A29E]">playing now</span>}
                        </span>
                      </span>
                      {teamBtn(b.profile_id, 'A')}{teamBtn(b.profile_id, 'B')}
                      <button onClick={() => markLeft(b, true)} disabled={busy} aria-label={`${nameOf(b.profile_id)} left the court`} title="Left the court"
                        className="h-8 w-9 flex-shrink-0 rounded-lg border border-white/10 text-[9px] font-black text-[#A8A29E] hover:text-[#FF8A9C] hover:border-[#FF8A9C]/50 cursor-pointer">LEFT</button>
                    </div>
                  );
                })}
                {(() => {
                  // on the next game's team but not in the list anymore (left, suspended, not at the court…)
                  const hidden = (nextG?.hoop_game_players || []).filter((x) => x.team && !nextPool.some((b) => b.profile_id === x.profile_id));
                  return hidden.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <p className="text-[10px] font-black tracking-wider text-[#FFC34D]">ON GAME {nextNo} BUT NOT AVAILABLE</p>
                      {hidden.map((x) => (
                        <div key={x.profile_id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[#FFC34D]/[0.06] border border-[#FFC34D]/25">
                          <span className="flex-1 min-w-0 text-[12px] text-[#E7E5E4] truncate">{nameOf(x.profile_id)} · {x.team === 'A' ? game.team_a : game.team_b}</span>
                          <button onClick={() => pickNext(x.profile_id, null)} disabled={busy} aria-label={`Take ${nameOf(x.profile_id)} off Game ${nextNo}`} className="px-2 py-1 rounded-md border border-white/15 text-[10px] font-black text-[#D6D3D1] cursor-pointer hover:border-white/35">TAKE OFF</button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {leftEarly.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[10px] font-black tracking-wider text-[#78716C]">LEFT EARLY · not in the next games</p>
                    {leftEarly.map((b) => (
                      <div key={b.profile_id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.03]">
                        <span className="flex-1 min-w-0 text-[12px] text-[#A8A29E] truncate">{short(b.profiles?.display_name)}</span>
                        <button onClick={() => markLeft(b, false)} disabled={busy} aria-label={`${nameOf(b.profile_id)} is back`} className="px-2 py-1 rounded-md border border-white/15 text-[10px] font-black text-[#D6D3D1] cursor-pointer hover:border-white/35">BACK</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* ROTATION: who already played which game of this schedule */}
      {bookings.length > 0 && (session.length > 1 || game.status !== 'scheduled') && (() => {
        const cols = session.map((g, i) => ({ g, n: i + 1, map: new Map(g.hoop_game_players.filter((x) => x.team).map((x) => [x.profile_id, x.team])) }));
        const total = (pid: string) => cols.filter((c) => (c.g.status === 'live' || c.g.status === 'final') && c.map.has(pid)).length;
        const rows = [...bookings].sort((x, y) => total(x.profile_id) - total(y.profile_id) || (x.profiles?.display_name || '').localeCompare(y.profiles?.display_name || ''));
        return (
          <section className="space-y-2.5">
            <button onClick={() => setShowRot(!showRot)} aria-expanded={showRot}
              className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/10 text-left cursor-pointer hover:border-white/25" style={{ background: H.surface }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--hp)]/15 text-[var(--hp)] flex-shrink-0"><Users className="w-5 h-5" /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-hoop italic font-black text-[20px] uppercase text-white leading-none">Games played today</span>
                <span className="block text-[11px] text-[#A8A29E] mt-1">{rows.length} player{rows.length === 1 ? '' : 's'} · who played which game · {showRot ? 'tap to hide' : 'tap to show'}</span>
              </span>
              <ChevronDown className={`w-5 h-5 text-[#D6D3D1] flex-shrink-0 transition-transform ${showRot ? 'rotate-180' : ''}`} />
            </button>
            {showRot && <>
            <p className="text-[11px] text-[#A8A29E]">Everyone booked on this schedule and which games they played. Players with the fewest games are listed first — give them the next game.</p>
            <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: H.surface }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[#A8A29E] border-b border-white/10">
                      <th className="text-left font-bold px-3 py-2">PLAYER</th>
                      {cols.map((c) => <th key={c.g.id} className={`font-bold px-2 py-2 text-center ${c.g.id === game.id ? 'text-[var(--hp)]' : ''}`}>G{c.n}</th>)}
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
                              <HoopFace avatar={b.profiles?.avatar_url} name={b.profiles?.display_name} cardPhoto={faces[b.profile_id]?.url} cardCrop={faces[b.profile_id]?.crop} size={24} />
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
            </>}
          </section>
        );
      })()}

      {/* BOX SCORE */}
      {showScore && (
        <section className="space-y-2.5">
          <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">Box score</h2>
          {myCardInfo && (
            <button onClick={() => setCardFor(me!.id)} className="w-full flex items-center gap-3 p-3 rounded-2xl border text-left cursor-pointer"
              style={{ borderColor: 'color-mix(in srgb, var(--hp) 55%, transparent)', background: 'linear-gradient(110deg, color-mix(in srgb, var(--hp) 20%, #141414), #141414 75%)' }}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-[var(--hp)] text-[#111] flex-shrink-0"><IdCard className="w-6 h-6" /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-hoop italic font-black text-[19px] uppercase text-white leading-none">My card for this game</span>
                <span className="block text-[11px] text-[#D6D3D1] mt-1">{myCardInfo.line?.pts ?? 0} pts · {myCardInfo.line?.reb ?? 0} reb · {myCardInfo.line?.ast ?? 0} ast — save it or share it</span>
              </span>
            </button>
          )}
          {game.status === 'final' && <p className="text-[11px] text-[#A8A29E]">Tap the card icon next to a player to see their card for this game.</p>}
          {boxTable('A', teamA)}
          {boxTable('B', teamB)}
        </section>
      )}

      {/* WHO'S PLAYING (before the game) */}
      {!showScore && !(isModerator && game.status === 'scheduled') && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">Who’s playing</h2>
            <span className="text-[12px] font-bold text-[#A8A29E]"><span className="text-[var(--hp)] font-black">{players.length}</span> / {root.slots} booked</span>
          </div>
          {players.length === 0 ? <p className="text-[13px] text-[#A8A29E]">No one yet — be the first to book!</p> : (
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
              {[...players].sort(byQueue).map((p, i) => (
                <button key={p.profile_id} onClick={() => !p.is_guest && go({ name: 'hoopPlayer', id: p.profile_id })} className={`flex flex-col items-center gap-1 min-w-0 ${p.is_guest ? 'cursor-default' : 'cursor-pointer'}`}>
                  <span className="relative">
                    <span className="absolute -top-1 -left-1 z-10 min-w-[20px] h-5 px-1 rounded-full bg-[var(--hp)] text-[#111] text-[10px] font-black flex items-center justify-center border-2 border-[#111]">{i + 1}</span>
                    <HoopFace avatar={p.profiles?.avatar_url} name={p.profiles?.display_name} cardPhoto={faces[p.profile_id]?.url} cardCrop={faces[p.profile_id]?.crop} size={54} />
                    {p.team && <span className="absolute -bottom-1 -right-1 px-1 rounded text-[8px] font-black" style={{ background: p.team === 'A' ? H.orange : '#D6D3D1', color: '#111' }}>{p.team === 'A' ? game.team_a.slice(0, 6) : game.team_b.slice(0, 6)}</span>}
                  </span>
                  <span className="text-[11px] font-bold text-white max-w-full truncate">{short(p.profiles?.display_name)}</span>
                  {(p.is_guest || bookingOf(p.profile_id)?.arrived_at) && (
                    <span className="-mt-1 text-[8px] font-black tracking-wide text-[var(--hp)]">{p.is_guest ? 'GUEST' : ''}{p.is_guest && bookingOf(p.profile_id)?.arrived_at ? ' · ' : ''}{bookingOf(p.profile_id)?.arrived_at ? 'HERE' : ''}</span>
                  )}
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
      {landscape && !courtsideOff && (live || game.status === 'final') && courtside}
      {night && me && <GameCardModal memberId={me.id} info={night} onClose={() => setNight(null)} />}
      {cardFor && cardInfo(cardFor) && <GameCardModal memberId={cardFor} info={cardInfo(cardFor)!} onClose={() => setCardFor(null)} />}
    </div>
  );
};
