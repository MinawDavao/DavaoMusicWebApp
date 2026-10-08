import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------- look & feel (from the Sunday Hoop Method logo)
export const H = {
  bg: '#111111',          // court-night black
  surface: '#1A1A1A',
  card: '#222222',
  line: 'rgba(255,255,255,0.10)',
  orange: '#F28C14',      // logo orange
  ball: '#F26A2E',        // basketball orange
  gray: '#7A7A7A',        // logo "HOOP" gray
  cream: '#F6EFEC',       // paper background of the logo
  text: '#F4F1EE',
  muted: '#A8A29E',
};

export const hbtn = {
  primary: 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F28C14] text-[#111] font-bold text-sm hover:bg-[#FF9C2A] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors',
  ghost: 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-[#F4F1EE] font-bold text-sm hover:bg-white/10 disabled:opacity-50 cursor-pointer transition-colors',
  danger: 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#E5484D] text-white font-bold text-sm hover:bg-[#D13C41] disabled:opacity-50 cursor-pointer',
  icon: 'inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] border border-white/15 text-[#D6D3D1] hover:text-white hover:bg-white/10 cursor-pointer',
};
export const hinput = 'w-full min-h-[44px] px-3.5 rounded-xl bg-[#151515] border border-white/15 text-[14px] text-white placeholder:text-[#78716C] outline-none focus:border-[#F28C14]';

// ---------------------------------------------------------------- data
export interface HoopPerson { id: string; display_name: string; username: string; avatar_url: string | null; role: string; is_verified?: boolean }
export interface HoopCard { profile_id: string; jersey_number: number | null; position: string | null; height: string | null; created_at: string; profiles?: HoopPerson | null }
export interface HoopGame {
  id: string; title: string; venue: string | null; starts_at: string; slots: number; notes: string | null;
  status: 'scheduled' | 'live' | 'final' | 'cancelled'; team_a: string; team_b: string;
  period: number; period_seconds: number; clock_running: boolean; clock_started_at: string | null; clock_elapsed_ms: number;
  started_at: string | null; ended_at: string | null; created_at: string;
}
export interface GamePlayer { game_id: string; profile_id: string; team: 'A' | 'B' | null; booked_at: string; profiles?: HoopPerson | null }
export type Kind = 'p1' | 'p2' | 'p3' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'foul';
export interface HoopEvent { id: string; game_id: string; profile_id: string; team: 'A' | 'B'; kind: Kind; period: number; created_at: string }
export interface HoopStats {
  profile_id: string; games: number; wins: number; losses: number;
  pts: number; threes: number; reb: number; ast: number; stl: number; blk: number; tov: number; fouls: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; tpg: number; topg: number; fpg: number; best_pts: number;
}

export const PERSON = 'id, display_name, username, avatar_url, role, is_verified';

export const KINDS: { k: Kind; label: string; short: string; pts?: number; tone: string }[] = [
  { k: 'p1', label: '+1', short: 'FT', pts: 1, tone: '#F28C14' },
  { k: 'p2', label: '+2', short: '2PT', pts: 2, tone: '#F28C14' },
  { k: 'p3', label: '+3', short: '3PT', pts: 3, tone: '#F26A2E' },
  { k: 'reb', label: 'REB', short: 'Rebound', tone: '#4FA3FF' },
  { k: 'ast', label: 'AST', short: 'Assist', tone: '#53E6D4' },
  { k: 'stl', label: 'STL', short: 'Steal', tone: '#8FE36B' },
  { k: 'blk', label: 'BLK', short: 'Block', tone: '#C17BFF' },
  { k: 'tov', label: 'TO', short: 'Turnover', tone: '#A8A29E' },
  { k: 'foul', label: 'FOUL', short: 'Foul', tone: '#FF6B7A' },
];
export const kindPts = (k: Kind) => (k === 'p1' ? 1 : k === 'p2' ? 2 : k === 'p3' ? 3 : 0);

export interface Line { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; foul: number; threes: number }
export const emptyLine = (): Line => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, foul: 0, threes: 0 });
/** Box score from the event list. */
export function boxScore(events: HoopEvent[]) {
  const lines: Record<string, Line> = {};
  const score = { A: 0, B: 0 };
  for (const e of events) {
    const l = (lines[e.profile_id] ||= emptyLine());
    const p = kindPts(e.kind);
    l.pts += p; score[e.team] += p;
    if (e.kind === 'p3') l.threes++;
    if (e.kind === 'reb') l.reb++; if (e.kind === 'ast') l.ast++; if (e.kind === 'stl') l.stl++;
    if (e.kind === 'blk') l.blk++; if (e.kind === 'tov') l.tov++; if (e.kind === 'foul') l.foul++;
  }
  return { lines, score };
}

// ---------------------------------------------------------------- game clock
export function clockLeftMs(g: Pick<HoopGame, 'period_seconds' | 'clock_running' | 'clock_started_at' | 'clock_elapsed_ms'>, now = Date.now()) {
  const run = g.clock_running && g.clock_started_at ? Math.max(0, now - new Date(g.clock_started_at).getTime()) : 0;
  return Math.max(0, g.period_seconds * 1000 - (g.clock_elapsed_ms + run));
}
export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** Re-renders every 250 ms while the clock is running. */
export function useTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [active]);
}

export const gameDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const gameTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export async function fetchStats(ids: string[]): Promise<Record<string, HoopStats>> {
  if (!ids.length) return {};
  const { data } = await supabase.from('hoop_player_stats').select('*').in('profile_id', ids);
  const out: Record<string, HoopStats> = {};
  ((data as HoopStats[]) || []).forEach((s) => { out[s.profile_id] = s; });
  return out;
}

export const fmt1 = (n: number | null | undefined) => (n == null ? '0.0' : Number(n).toFixed(1));
