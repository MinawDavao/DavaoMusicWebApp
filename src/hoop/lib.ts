import { createContext, useContext, useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------- look & feel (from the Sunday Hoop Method logo)
export const H = {
  bg: '#111111',          // court-night black
  surface: '#1A1A1A',
  card: '#222222',
  line: 'rgba(255,255,255,0.10)',
  orange: 'var(--hp)',    // club colour (default: logo orange #F28C14)
  ball: 'var(--ha)',      // club accent (default: basketball orange #F26A2E)
  gray: '#7A7A7A',        // logo "HOOP" gray
  cream: '#F6EFEC',       // paper background of the logo
  text: '#F4F1EE',
  muted: '#A8A29E',
};

export const hbtn = {
  primary: 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--hp)] text-[#111] font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors',
  ghost: 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-[#F4F1EE] font-bold text-sm hover:bg-white/10 disabled:opacity-50 cursor-pointer transition-colors',
  danger: 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#E5484D] text-white font-bold text-sm hover:bg-[#D13C41] disabled:opacity-50 cursor-pointer',
  icon: 'inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] border border-white/15 text-[#D6D3D1] hover:text-white hover:bg-white/10 cursor-pointer',
};
export const hinput = 'w-full min-h-[44px] px-3.5 rounded-xl bg-[#151515] border border-white/15 text-[14px] text-white placeholder:text-[#78716C] outline-none focus:border-[var(--hp)]';

// ---------------------------------------------------------------- data
export interface HoopPerson { id: string; display_name: string; username: string; avatar_url: string | null; role: string; is_verified?: boolean }
export interface HoopCard { profile_id: string; jersey_number: number | null; position: string | null; height: string | null; created_at: string; card_photo_url?: string | null; card_photo_crop?: any; profiles?: HoopPerson | null }
export interface HoopGame {
  id: string; title: string; venue: string | null; starts_at: string; slots: number; notes: string | null;
  status: 'scheduled' | 'live' | 'final' | 'cancelled'; team_a: string; team_b: string;
  period: number; period_seconds: number; clock_running: boolean; clock_started_at: string | null; clock_elapsed_ms: number;
  started_at: string | null; ended_at: string | null; created_at: string; session_id: string | null; created_by: string | null; closed_at?: string | null; periods?: number;
}
/**
 * A booking / team row. `profile_id` here is the PLAYER KEY: the club member id, or for a GUEST the guest id
 * (see normPlayer). The real account id (if any) is `account_id`.
 */
export interface GamePlayer {
  game_id: string; profile_id: string; team: 'A' | 'B' | null; booked_at: string; paid?: boolean; paid_at?: string | null;
  arrived_at?: string | null; guest_id?: string | null; guest_name?: string | null; is_guest?: boolean; profiles?: HoopPerson | null;
  member_id?: string | null; account_id?: string | null; jersey?: number | null; face?: { url: string; crop: any } | null;
  /** the player was removed from the club (row kept only for past box scores) */ removed?: boolean;
  /** false = subbed out to the bench during the game (keeps their team and stats) */ on_court?: boolean;
  /** set = left the court during the schedule (emergency…): skipped for the next games, stats kept */ left_at?: string | null;
  member_status?: 'pending' | 'active' | 'suspended' | null;
}
export type Kind = 'p1' | 'p2' | 'p3' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'foul';
export interface HoopEvent { id: string; game_id: string; profile_id: string; account_id?: string | null; member_id?: string | null; guest_id?: string | null; team: 'A' | 'B'; kind: Kind; period: number; created_at: string }
export interface HoopStats {
  member_id: string; games: number; wins: number; losses: number;
  pts: number; threes: number; reb: number; ast: number; stl: number; blk: number; tov: number; fouls: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; tpg: number; topg: number; fpg: number; best_pts: number;
  /** set = a ONE-GAME card ("Sunday Run 2 · G2 · W 29-25"): cards show PTS/REB/AST… totals instead of per-game averages */
  game_label?: string;
}

/** Columns for a booking row with the player's account and club card. */
export const GP_COLS = `*, profiles!hoop_game_players_profile_id_fkey(${'id, display_name, username, avatar_url, role, is_verified'}), member:hoop_members!hoop_game_players_member_id_fkey(id, name, photo_url, jersey_number, card_photo_url, card_photo_crop, status)`;
/** Every booking is keyed by the club member id (guests: their guest id), so lists / keys work the same for everyone. */
export const normPlayer = (r: any): GamePlayer => {
  if (r?.guest_id) return { ...r, account_id: null, profile_id: r.guest_id, is_guest: true, profiles: { id: r.guest_id, display_name: r.guest_name || 'Guest', username: '', avatar_url: null, role: 'guest' } };
  const m = r?.member;
  return {
    ...r, account_id: r?.profile_id ?? null, profile_id: r?.member_id || r?.profile_id,
    profiles: r?.profiles || { id: r?.member_id, display_name: m?.name || 'Player', username: '', avatar_url: m?.photo_url ?? null, role: 'offline' },
    member_status: m?.status ?? null,
    jersey: m?.jersey_number ?? null, face: m?.card_photo_url ? { url: m.card_photo_url, crop: m.card_photo_crop } : null,
  };
};
export const normEvent = (e: any): HoopEvent => ({ ...e, account_id: e?.profile_id ?? null, profile_id: e?.member_id || e?.guest_id || e?.profile_id });
/** First come, first play: players who arrived (in arrival order), then everyone else in booking order. */
export const byArrival = (a: Pick<GamePlayer, 'arrived_at' | 'booked_at'>, b: Pick<GamePlayer, 'arrived_at' | 'booked_at'>) =>
  (a.arrived_at ? 0 : 1) - (b.arrived_at ? 0 : 1)
  || (a.arrived_at && b.arrived_at ? a.arrived_at.localeCompare(b.arrived_at) : 0)
  || a.booked_at.localeCompare(b.booked_at);
/** "1", "2"… then "OT", "OT2" once the game goes past its periods. */
export const periodName = (p: number, periods = 4) => (p <= periods ? String(p) : p - periods === 1 ? 'OT' : `OT${p - periods}`);

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
/** Difference between this phone's clock and the server's, so every phone shows the same game clock. */
let serverOffset: number | null = null;
export function useServerOffset() {
  const [off, setOff] = useState(serverOffset ?? 0);
  useEffect(() => {
    if (serverOffset !== null) return;
    const t0 = Date.now();
    supabase.rpc('hoop_now').then(({ data }) => {
      if (!data) return;
      const t1 = Date.now();
      serverOffset = new Date(data as string).getTime() - (t0 + t1) / 2;
      setOff(serverOffset);
    });
  }, []);
  return off;
}

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

/** Career stats per club card (member id). */
export async function fetchStats(memberIds: string[]): Promise<Record<string, HoopStats>> {
  if (!memberIds.length) return {};
  const { data } = await supabase.from('hoop_member_stats').select('*').in('member_id', memberIds);
  const out: Record<string, HoopStats> = {};
  ((data as HoopStats[]) || []).forEach((s) => { out[s.member_id] = s; });
  return out;
}

export const fmt1 = (n: number | null | undefined) => (n == null ? '0.0' : Number(n).toFixed(1));
// ---------- one-game cards: the same card designs, but with that game's numbers
const ONE_GAME: Record<string, string> = { PPG: 'PTS', RPG: 'REB', APG: 'AST', SPG: 'STL', BPG: 'BLK' };
/** 'PPG' → 'PTS' on a one-game card */
export const statLabel = (k: string, s?: Pick<HoopStats, 'game_label'> | null) => (s?.game_label ? ONE_GAME[k] ?? k : k);
/** 14.7 on the average card, 23 on a one-game card */
export const statNum = (v: number | null | undefined, s?: Pick<HoopStats, 'game_label'> | null) => (s?.game_label ? String(Math.round(v ?? 0)) : fmt1(v));
/** A player's line from one game, shaped like their stats so any card design can show it. */
export function oneGameStats(memberId: string, l: { pts: number; reb: number; ast: number; stl: number; blk: number; threes: number; tov?: number; foul?: number } | null | undefined, label: string, result: 'W' | 'L' | 'T'): HoopStats {
  const x = l || { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, threes: 0 };
  return {
    member_id: memberId, games: 1, wins: result === 'W' ? 1 : 0, losses: result === 'L' ? 1 : 0,
    pts: x.pts, threes: x.threes, reb: x.reb, ast: x.ast, stl: x.stl, blk: x.blk, tov: x.tov ?? 0, fouls: x.foul ?? 0,
    ppg: x.pts, rpg: x.reb, apg: x.ast, spg: x.stl, bpg: x.blk, tpg: x.threes, topg: x.tov ?? 0, fpg: x.foul ?? 0, best_pts: x.pts,
    game_label: label,
  };
}

/** A whole schedule (night) added up: totals of every game the player played that night. */
export function nightStats(memberId: string, l: { pts: number; reb: number; ast: number; stl: number; blk: number; threes: number; tov?: number; foul?: number }, label: string, n: { games: number; wins: number; losses: number; best: number }): HoopStats {
  return {
    member_id: memberId, games: n.games, wins: n.wins, losses: n.losses,
    pts: l.pts, threes: l.threes, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov ?? 0, fouls: l.foul ?? 0,
    ppg: l.pts, rpg: l.reb, apg: l.ast, spg: l.stl, bpg: l.blk, tpg: l.threes, topg: l.tov ?? 0, fpg: l.foul ?? 0, best_pts: n.best,
    game_label: label,
  };
}

// ---------------------------------------------------------------- clubs
export interface HoopClub {
  id: string; name: string; tagline: string | null; description: string | null; rules: string | null; location: string | null;
  logo_url: string | null; cover_url: string | null; theme: { primary?: string; accent?: string } | null; owner_id: string | null;
  is_hidden: boolean; created_at: string;
  /** subscription: active until (null = no end); billing_free = never pays (the main admin's own clubs) */
  paid_until?: string | null; billing_free?: boolean;
  /** this club's own 1-of-1 card artwork (null = no 1-of-1 / card packs yet) */
  oneofone_url?: string | null;
  /** this club's numbered "Selected" card artwork (only 10 ever) — null = none */
  selected_url?: string | null;
}

// ---------- club subscriptions (₱400/month after a 30-day free trial; paid by GCash, confirmed by the main admin)
export const CLUB_PRICE = 400;
export const GCASH_NUMBER = '0906 275 2429';
export const GCASH_QR = '/gcash-qr.png';   // put the GCash QR picture at public/gcash-qr.png (it shows once it's there)
export const TRIAL_DAYS = 30;
export function clubBilling(c: Pick<HoopClub, 'paid_until' | 'billing_free' | 'created_at'> | null | undefined) {
  if (!c || c.billing_free || !c.paid_until) return { free: true, active: true, daysLeft: Infinity, until: null as Date | null, trial: false };
  const until = new Date(c.paid_until);
  const ms = until.getTime() - Date.now();
  const trial = until.getTime() - new Date(c.created_at).getTime() <= (TRIAL_DAYS + 1) * 864e5;   // never extended = still the free month
  return { free: false, active: ms > 0, daysLeft: Math.max(0, Math.ceil(ms / 864e5)), until, trial };
}
export const longDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
/** One player card per club. Offline players (no account) have no profile_id and use name / photo_url. */
export interface HoopMember {
  id: string; club_id: string; profile_id: string | null; name: string | null; photo_url: string | null;
  jersey_number: number | null; position: string | null; height: string | null; card_photo_url: string | null; card_photo_crop: any;
  status: 'pending' | 'active' | 'suspended'; note: string | null; created_at: string; approved_at: string | null;
  /** the player's own pick for their My Card: 'level1'…'level3' or 'one:<1-of-1 id>' (null = follow their level) */
  card_choice?: string | null;
  profiles?: (HoopPerson & { is_suspended?: boolean }) | null;
}
export const MEMBER_COLS = `*, profiles!hoop_members_profile_id_fkey(${PERSON}, is_suspended)`;
/** The face / name shown for a member: their account, or (offline players) the name + photo the admin entered. */
export const personOf = (m: Pick<HoopMember, 'id' | 'name' | 'photo_url' | 'profiles'>): HoopPerson =>
  m.profiles || { id: m.id, display_name: m.name || 'Player', username: '', avatar_url: m.photo_url, role: 'offline' };

export const THEMES: { name: string; primary: string; accent: string }[] = [
  { name: 'Hoop Orange', primary: '#F28C14', accent: '#F26A2E' },
  { name: 'Gold', primary: '#F5C542', accent: '#E8A317' },
  { name: 'Lime', primary: '#9BE15D', accent: '#4CC38A' },
  { name: 'Teal', primary: '#3DDBD9', accent: '#1FB5C7' },
  { name: 'Sky', primary: '#5AB8FF', accent: '#3D7DFF' },
  { name: 'Violet', primary: '#B894FF', accent: '#8E6BFF' },
  { name: 'Pink', primary: '#FF7EB6', accent: '#FF4F8B' },
  { name: 'Red', primary: '#FF6B5B', accent: '#E5484D' },
  { name: 'Silver', primary: '#D9DEE5', accent: '#9BA6B2' },
];
const HEX = /^#[0-9a-f]{6}$/i;
/** Dark text sits on the club colour, so very dark custom colours are lightened until they're readable. */
function readable(hex: string) {
  if (!HEX.test(hex)) return null;
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = () => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  for (let i = 0; i < 12 && lum() < 0.5; i++) { r = r + (255 - r) * 0.18; g = g + (255 - g) * 0.18; b = b + (255 - b) * 0.18; }
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
}
export const themeVars = (t?: HoopClub['theme'] | null) => ({
  '--hp': readable(t?.primary || '') || '#F28C14',
  '--ha': readable(t?.accent || '') || '#F26A2E',
}) as CSSProperties;

/** The club the screen is about (null on the clubs list), with what the viewer may do there. */
export interface ClubCtx {
  club: HoopClub | null; isAdmin: boolean; isOwner: boolean; me: HoopMember | null; reload: () => void;
}
export const ClubContext = createContext<ClubCtx>({ club: null, isAdmin: false, isOwner: false, me: null, reload: () => {} });
export const useClub = () => useContext(ClubContext);

/** Club rules are stored one per line: "Title — text" (the title part is optional). */
export const parseRules = (rules: string | null | undefined): [string, string][] =>
  (rules || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.{2,60}?)\s+[—–-]\s+(.+)$/);
    return m ? [m[1], m[2]] : ['', l];
  });

/** True for the club's owner / admins and the main admin (inside a club screen). */
export const useHoopAdmin = (): boolean => useClub().isAdmin;

/** The app's main admin (robertvtemployee@gmail.com). Card series + the card 2 preview are only for this account. */
export const HOOP_MAIN_ADMIN_ID = '6a06f84b-ef85-4c61-9734-1948af7e2c83';

/**
 * Cards follow Hoop Method: a card Hoop Method has given out unlocks for every club at the same schedule number
 * (e.g. packs + 1-of-1 from a club's 2nd schedule, Chosen from its 3rd). `*_from` is null until Hoop Method releases it;
 * `played` = closed, played schedules so far. Hoop Method itself (lead) has everything it has a design for.
 */
export interface ClubUnlocks { lead: boolean; played: number; packs_from: number | null; chosen_from: number | null }
const unlockCache = new Map<string, { at: number; p: Promise<ClubUnlocks | null> }>();
function loadUnlocks(id: string): Promise<ClubUnlocks | null> {
  const hit = unlockCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = Promise.resolve(supabase.rpc('hoop_club_unlocks', { p_club: id })).then(({ data, error }) => (error ? null : ((data as ClubUnlocks) || null)), () => null);
  unlockCache.set(id, { at: Date.now(), p });
  p.then((v) => { if (!v) unlockCache.delete(id); });   // don't keep a failed check
  return p;
}
/** after a draw: the next look asks the server again */
export const forgetUnlocks = (id: string) => unlockCache.delete(id);
export function useClubUnlocks(club: Pick<HoopClub, 'id' | 'oneofone_url' | 'selected_url'> | null | undefined): ClubUnlocks | undefined {
  const [u, setU] = useState<{ id: string; v: ClubUnlocks | null } | null>(null);
  const id = club?.id;
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadUnlocks(id).then((v) => { if (live) setU({ id, v }); });
    return () => { live = false; };
  }, [id]);
  if (!club || !u || u.id !== club.id) return undefined;   // loading
  // couldn't check (offline…): go by the club's own designs
  return u.v || { lead: !!club.oneofone_url, played: 0, packs_from: club.oneofone_url ? 1 : null, chosen_from: club.selected_url ? 1 : null };
}
/** 1st, 2nd, 3rd, 4th… */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
/** Is this card being given at the club's next draw? (the schedule being drawn is already counted in `played`) */
export const unlockedNow = (from: number | null | undefined, u: ClubUnlocks | null | undefined) => !!u && from != null && Math.max(u.played, 1) >= from;
