import { supabase } from './supabase';
import type { Band, Gig, Track } from './db';

export const BAND_COLS: string = 'id, owner_id, name, handle, logo_url, banner_url, home_base, bio, is_verified, created_at, band_genres(genre_id, genres(name))';

export function genreNames(b: Pick<Band, 'band_genres'>): string[] {
  return (b.band_genres || []).map((g) => g.genres?.name).filter(Boolean) as string[];
}

/** Bands ranked by total plays of their tracks (Top 10). */
export async function fetchTopBands(limit = 10): Promise<{ band: Band; plays: number }[]> {
  const { data: tracks } = await supabase.from('tracks').select('band_id, play_count');
  const totals = new Map<string, number>();
  (tracks || []).forEach((t: any) => totals.set(t.band_id, (totals.get(t.band_id) || 0) + (t.play_count || 0)));
  const ids = [...totals.keys()];
  if (!ids.length) return [];
  const { data: bands } = await supabase.from('bands').select(BAND_COLS).in('id', ids);
  return ((bands as unknown as Band[]) || [])
    .map((b) => ({ band: b, plays: totals.get(b.id) || 0 }))
    .sort((a, b) => b.plays - a.plays || a.band.name.localeCompare(b.band.name))
    .slice(0, limit);
}

export async function fetchUpcomingGigs(limit = 10, bandId?: string): Promise<Gig[]> {
  let q = supabase
    .from('gigs')
    .select('*, bands(id, name, logo_url)')
    .gte('starts_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .neq('status', 'cancelled')
    .order('starts_at')
    .limit(limit);
  if (bandId) q = q.eq('band_id', bandId);
  const { data } = await q;
  return (data as Gig[]) || [];
}

export async function fetchRsvpCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('gig_rsvp_counts');
  const out: Record<string, number> = {};
  ((data as any[]) || []).forEach((r) => { out[r.gig_id] = Number(r.rsvp_count); });
  return out;
}

export async function fetchMyRsvps(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from('gig_rsvps').select('gig_id').eq('user_id', userId);
  return new Set(((data as any[]) || []).map((r) => r.gig_id));
}

export async function fetchTracks(bandId?: string): Promise<Track[]> {
  let q = supabase.from('tracks').select('*, bands(id, name, handle, logo_url)').order('created_at', { ascending: false });
  if (bandId) q = q.eq('band_id', bandId);
  const { data } = await q;
  return (data as Track[]) || [];
}
