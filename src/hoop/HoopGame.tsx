import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Ban, Check, ChevronRight, Clock, Flag, MapPin, Minus, Pause, Pencil, Play, Plus, RotateCcw, Shuffle, SkipForward, Trash2, Undo2, UserPlus, Users, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, ErrorNote, Spinner } from '../components/ui';
import { AccountPicker } from '../components/MembersEditor';
import {
  H, KINDS, PERSON, boxScore, clockLeftMs, fmtClock, gameDate, gameTime, hbtn, kindPts, useTick,
  type GamePlayer, type HoopEvent, type HoopGame, type Kind,
} from './lib';
import { GameForm } from './HoopGames';

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
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showTeams, setShowTeams] = useState(false);

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase.from('hoop_game_players').select(`*, profiles!hoop_game_players_profile_id_fkey(${PERSON})`).eq('game_id', id).order('booked_at');
    const rows = (data as any as GamePlayer[]) || [];
    setPlayers(rows);
    const ids = rows.map((r) => r.profile_id);
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hoop_games', filter: `id=eq.${id}` }, (p: any) => setGame((g) => (g ? { ...g, ...p.new } : g)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hoop_events', filter: `game_id=eq.${id}` }, (p: any) => {
        setEvents((xs) => (xs.some((x) => x.id === p.new.id) ? xs : [...xs, p.new as HoopEvent]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hoop_events', filter: `game_id=eq.${id}` }, (p: any) => {
        setEvents((xs) => xs.filter((x) => x.id !== p.old?.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_game_players', filter: `game_id=eq.${id}` }, () => loadPlayers())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load, loadPlayers]);

  useTick(!!game?.clock_running);
  const left = game ? clockLeftMs(game) : 0;

  // the admin's phone stops the clock at 0:00
  useEffect(() => {
    if (!isModerator || !game?.clock_running || left > 0) return;
    supabase.from('hoop_games').update({ clock_running: false, clock_started_at: null, clock_elapsed_ms: game.period_seconds * 1000 }).eq('id', game.id).then(() => {});
  }, [left, isModerator, game?.clock_running]); // eslint-disable-line react-hooks/exhaustive-deps

  const { lines, score } = useMemo(() => boxScore(events), [events]);

  if (game === undefined) return <Spinner label="Loading game…" />;
  if (game === null) return (
    <div className="px-3 py-6 space-y-3">
      <button onClick={() => go({ name: 'hoop' })} className={`${hbtn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" />All games</button>
      <p className="text-center text-[#A8A29E] py-10">This game isn’t available anymore.</p>
    </div>
  );

  const teamA = players.filter((p) => p.team === 'A');
  const teamB = players.filter((p) => p.team === 'B');
  const bench = players.filter((p) => !p.team);
  const mine = !!user && players.some((p) => p.profile_id === user.id);
  const full = players.length >= game.slots;
  const canBook = game.status === 'scheduled' && new Date(game.starts_at).getTime() > Date.now();
  const nameOf = (pid: string) => players.find((p) => p.profile_id === pid)?.profiles?.display_name || 'Player';

  const run = async (fn: () => PromiseLike<{ error: any }>) => {
    setBusy(true); setErr(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return false; }
    return true;
  };
  const patchGame = (patch: Partial<HoopGame>) => run(() => supabase.from('hoop_games').update(patch).eq('id', game.id));

  // ---------- booking
  const book = () => run(() => (mine
    ? supabase.from('hoop_game_players').delete().eq('game_id', game.id).eq('profile_id', user!.id)
    : supabase.from('hoop_game_players').insert({ game_id: game.id, profile_id: user!.id }))).then(loadPlayers);

  // ---------- admin: teams
  const setTeam = (pid: string, team: 'A' | 'B' | null) => run(() => supabase.from('hoop_game_players').update({ team }).eq('game_id', game.id).eq('profile_id', pid)).then(loadPlayers);
  const removePlayer = async (pid: string) => {
    if (!confirm(`Remove ${nameOf(pid)} from this game?${events.some((e) => e.profile_id === pid) ? '\n\nTheir stats in this game will be removed too.' : ''}`)) return;
    if (events.some((e) => e.profile_id === pid)) await supabase.from('hoop_events').delete().eq('game_id', game.id).eq('profile_id', pid);
    await run(() => supabase.from('hoop_game_players').delete().eq('game_id', game.id).eq('profile_id', pid));
    load();
  };
  const addPlayer = async (pid: string) => {
    setAdding(false);
    await run(() => supabase.from('hoop_game_players').insert({ game_id: game.id, profile_id: pid }));
    loadPlayers();
  };
  const shuffle = async () => {
    if (players.length < 2) return;
    if ((teamA.length || teamB.length) && !confirm('Shuffle everyone into two new random teams?')) return;
    const ids = players.map((p) => p.profile_id).sort(() => Math.random() - 0.5);
    setBusy(true);
    for (let i = 0; i < ids.length; i++) await supabase.from('hoop_game_players').update({ team: i % 2 === 0 ? 'A' : 'B' }).eq('game_id', game.id).eq('profile_id', ids[i]);
    setBusy(false);
    loadPlayers();
  };

  // ---------- admin: game flow
  const begin = async () => {
    if (!teamA.length || !teamB.length) return setErr('Put at least one player on each team first.');
    if (!confirm(`Start the game?\n\n${game.team_a}: ${teamA.length} players\n${game.team_b}: ${teamB.length} players`)) return;
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
    if (!confirm('Delete this game and everything in it (bookings and stats)? This can’t be undone.')) return;
    if (await run(() => supabase.from('hoop_games').delete().eq('id', game.id))) go({ name: 'hoop' });
  };

  // ---------- admin: clock
  const now = () => Date.now();
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
              <span className="block text-[10px] text-[#A8A29E]">{l?.pts ?? 0} pts · {l?.reb ?? 0} reb · {l?.ast ?? 0} ast</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const rosterRow = (p: GamePlayer) => (
    <div key={p.profile_id} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/10">
      <Avatar src={p.profiles?.avatar_url} name={p.profiles?.display_name} size={30} />
      <span className="flex-1 min-w-0 text-[12px] font-bold text-white truncate">{p.profiles?.display_name || 'Member'}</span>
      <div className="flex rounded-lg overflow-hidden border border-white/15 text-[10px] font-black">
        {(['A', null, 'B'] as const).map((t) => (
          <button key={String(t)} onClick={() => setTeam(p.profile_id, t)} disabled={busy}
            className={`px-2 py-1.5 cursor-pointer ${p.team === t ? (t === 'A' ? 'bg-[#F28C14] text-[#111]' : t === 'B' ? 'bg-[#D6D3D1] text-[#111]' : 'bg-white/20 text-white') : 'text-[#A8A29E] hover:bg-white/10'}`}>
            {t === 'A' ? short(game.team_a).toUpperCase().slice(0, 8) : t === 'B' ? short(game.team_b).toUpperCase().slice(0, 8) : 'BENCH'}
          </button>
        ))}
      </div>
      <button onClick={() => removePlayer(p.profile_id)} aria-label={`Remove ${p.profiles?.display_name}`} className="w-7 h-7 rounded-lg text-[#A8A29E] hover:text-[#FF6B7A] flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
    </div>
  );

  const rosterManager = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-white flex items-center gap-1.5"><Users className="w-4 h-4 text-[#F28C14]" />Teams ({players.length}{game.status === 'scheduled' ? `/${game.slots}` : ''})</p>
        <div className="flex gap-1.5">
          <button onClick={shuffle} disabled={busy || players.length < 2} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`}><Shuffle className="w-3.5 h-3.5" />Shuffle</button>
          <button onClick={() => setAdding(!adding)} className={`${hbtn.ghost} !px-2.5 !py-1.5 !text-xs`}><UserPlus className="w-3.5 h-3.5" />Add</button>
        </div>
      </div>
      {adding && <AccountPicker autoFocus roles={['fan']} exclude={players.map((p) => p.profile_id)} onPick={(p) => addPlayer(p.id)} onCancel={() => setAdding(false)} />}
      {players.length === 0 && <p className="text-[12px] text-[#A8A29E]">No one has booked yet. You can add players with “Add”.</p>}
      {players.map(rosterRow)}
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

      {/* SCOREBOARD */}
      <div className="rounded-3xl overflow-hidden border border-white/10" style={{ background: 'linear-gradient(180deg, #1F1F1F, #141414)' }}>
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${H.orange}, ${H.ball})` }} />
        <div className="p-4 space-y-3">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h1 className="font-hoop italic font-black text-[26px] uppercase text-white leading-none">{game.title}</h1>
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
              <span className="flex items-center gap-1.5 font-bold text-white"><Users className="w-4 h-4 text-[#F28C14]" />{players.length} / {game.slots} booked</span>
            </div>
          )}

          {game.notes && <p className="text-[12px] text-[#D6D3D1] text-center whitespace-pre-line">{game.notes}</p>}

          {canBook && (
            mine
              ? <button onClick={book} disabled={busy} className={`${hbtn.ghost} w-full`}><Check className="w-4 h-4 text-[#F28C14]" />You’re in · Cancel my slot</button>
              : <button onClick={book} disabled={busy || full} className={`${hbtn.primary} w-full`}>{full ? 'Game is full' : 'Book my slot'}</button>
          )}
        </div>
      </div>

      <ErrorNote text={err} />

      {/* ADMIN CONSOLE */}
      {isModerator && game.status === 'scheduled' && (
        <section className="rounded-2xl p-3.5 space-y-3 border border-[#F28C14]/40" style={{ background: 'rgba(242,140,20,0.06)' }}>
          <p className="text-[11px] font-black tracking-wider text-[#F28C14]">ADMIN · GAME SETUP</p>
          {rosterManager}
          <button onClick={begin} disabled={busy} className={`${hbtn.primary} w-full !py-3 !text-base`}><Play className="w-5 h-5 fill-current" />Begin game</button>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditing(true)} className={`${hbtn.ghost} !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />Edit details</button>
            <button onClick={cancelGame} className={`${hbtn.ghost} !py-2 !text-xs`}><Ban className="w-3.5 h-3.5" />Cancel game</button>
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
          <div className="grid grid-cols-2 gap-2">{teamCol('A', teamA)}{teamCol('B', teamB)}</div>

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

      {isModerator && (game.status === 'final' || game.status === 'cancelled') && (
        <div className="flex flex-wrap gap-2">
          {game.status === 'final' && <button onClick={reopen} className={`${hbtn.ghost} !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />Reopen to fix stats</button>}
          {game.status === 'cancelled' && <button onClick={restore} className={`${hbtn.ghost} !py-2 !text-xs`}><RotateCcw className="w-3.5 h-3.5" />Un-cancel</button>}
          <button onClick={deleteGame} className={`${hbtn.ghost} !py-2 !text-xs !text-[#FF6B7A]`}><Trash2 className="w-3.5 h-3.5" />Delete game</button>
        </div>
      )}

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
          <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">Who’s playing</h2>
          {players.length === 0 ? <p className="text-[13px] text-[#A8A29E]">No one yet — be the first to book!</p> : (
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
              {players.map((p) => (
                <button key={p.profile_id} onClick={() => go({ name: 'hoopPlayer', id: p.profile_id })} className="flex flex-col items-center gap-1 min-w-0 cursor-pointer">
                  <span className="relative">
                    <Avatar src={p.profiles?.avatar_url} name={p.profiles?.display_name} size={54} />
                    {p.team && <span className="absolute -bottom-1 -right-1 px-1 rounded text-[8px] font-black" style={{ background: p.team === 'A' ? H.orange : '#D6D3D1', color: '#111' }}>{p.team === 'A' ? game.team_a.slice(0, 6) : game.team_b.slice(0, 6)}</span>}
                  </span>
                  <span className="text-[11px] font-bold text-white max-w-full truncate">{short(p.profiles?.display_name)}</span>
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
