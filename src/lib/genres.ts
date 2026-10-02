import { supabase } from './supabase';

export const MAX_GENRES = 3;

/** Replace a band's genres (max 3). Creates any custom "Other" genres the artist typed. */
export async function setBandGenres(bandId: string, names: string[]): Promise<void> {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, MAX_GENRES);
  const ids: number[] = [];
  for (const name of clean) {
    const pattern = name.replace(/[%_\\]/g, (c) => '\\' + c);
    const { data: found } = await supabase.from('genres').select('id').ilike('name', pattern).maybeSingle();
    if (found) { ids.push((found as any).id); continue; }
    const { data: made, error } = await supabase.from('genres').insert({ name, is_custom: true }).select('id').single();
    if (error) {
      // someone may have just created it — look it up again
      const { data: again } = await supabase.from('genres').select('id').ilike('name', pattern).maybeSingle();
      if (!again) throw error;
      ids.push((again as any).id);
    } else ids.push((made as any).id);
  }
  const { error: delErr } = await supabase.from('band_genres').delete().eq('band_id', bandId);
  if (delErr) throw delErr;
  if (ids.length) {
    const { error } = await supabase.from('band_genres').insert(ids.map((genre_id) => ({ band_id: bandId, genre_id })));
    if (error) throw error;
  }
}

export async function fetchBandGenreNames(bandId: string): Promise<string[]> {
  const { data } = await supabase.from('band_genres').select('genres(name)').eq('band_id', bandId);
  return ((data as any[]) || []).map((r) => r.genres?.name).filter(Boolean);
}
