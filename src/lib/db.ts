import { supabase } from './supabase';

// ---------- Row types (mirror supabase/migrations) ----------
export type Role = 'fan' | 'artist';

export interface Profile {
  id: string;
  role: Role;
  display_name: string;
  username: string;
  avatar_url: string | null;
  district: string | null;
  bio: string | null;
  instruments: string | null;
  instagram: string | null;
  facebook: string | null;
  show_rsvps: boolean;
  show_playlists: boolean;
  onboarding_completed: boolean;
  is_verified: boolean;
  is_suspended: boolean;
  created_at: string;
}

export interface Band {
  id: string;
  owner_id: string;
  name: string;
  handle: string;
  logo_url: string | null;
  banner_url: string | null;
  home_base: string | null;
  year_formed: number | null;
  bio: string | null;
  influences: string | null;
  booking_email: string | null;
  mobile: string | null;
  facebook: string | null;
  instagram: string | null;
  streaming_url: string | null;
  open_for_bookings: boolean;
  allow_downloads: boolean;
  is_verified: boolean;
  is_hidden: boolean;
  created_at: string;
  band_genres?: { genre_id: number; genres?: { name: string } | null }[];
}

export interface Track {
  id: string;
  band_id: string;
  title: string;
  audio_path: string;
  cover_url: string | null;
  duration_sec: number | null;
  format: string | null;
  allow_download: boolean;
  play_count: number;
  created_at: string;
  bands?: Pick<Band, 'id' | 'name' | 'handle' | 'logo_url'> | null;
}

export interface Gig {
  id: string;
  band_id: string;
  title: string;
  supporting_acts: string[];
  venue: string;
  address: string | null;
  district: string | null;
  starts_at: string;
  ends_at: string | null;
  door_charge: string | null;
  status: string;
  poster_url: string | null;
  bands?: Pick<Band, 'id' | 'name' | 'logo_url'> | null;
}

export interface Post {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  venue_tag: string | null;
  district_tag: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'display_name' | 'username' | 'avatar_url' | 'role' | 'is_verified'> | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'role'> | null;
}

export type DealType = 'for_sale' | 'for_trade' | 'sale_or_trade' | 'looking_to_buy';
export type GearCategory = 'guitars_bass' | 'pedals_fx' | 'drums_percussion' | 'keys_synths' | 'amps_audio' | 'accessories';
export type GearCondition = 'brand_new' | 'like_mint' | 'gig_tested' | 'vintage_relic';

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  category: GearCategory;
  deal_type: DealType;
  condition: GearCondition;
  price: number | null;
  trade_wishlist: string | null;
  description: string | null;
  specs: string[];
  district: string | null;
  status: 'active' | 'sold' | 'closed';
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'role' | 'instagram' | 'facebook' | 'is_verified'> | null;
  listing_photos?: { id: string; image_path: string; position: number }[];
}

export type ReportTarget = 'post' | 'comment' | 'listing' | 'track' | 'band' | 'review' | 'profile';
export type ReportReason = 'nudity' | 'violence' | 'political' | 'hate' | 'scam' | 'copyright' | 'other';

// ---------- Labels ----------
export const DEAL_LABELS: Record<DealType, string> = {
  for_sale: 'For Sale',
  for_trade: 'For Trade',
  sale_or_trade: 'Sale or Trade',
  looking_to_buy: 'Looking to Buy',
};
export const CATEGORY_LABELS: Record<GearCategory, string> = {
  guitars_bass: 'Guitars & Bass',
  pedals_fx: 'Pedals & FX',
  drums_percussion: 'Drums & Percussion',
  keys_synths: 'Keys & Synths',
  amps_audio: 'Amps & Audio',
  accessories: 'Accessories',
};
export const CONDITION_LABELS: Record<GearCondition, string> = {
  brand_new: 'Brand New',
  like_mint: 'Like Mint',
  gig_tested: 'Gig-Tested',
  vintage_relic: 'Vintage / Relic',
};
export const REPORT_REASONS: { key: ReportReason; label: string; sub: string }[] = [
  { key: 'nudity', label: 'Nudity or sexual content', sub: 'Explicit images, sexual posts or comments' },
  { key: 'violence', label: 'Violence or threats', sub: 'Gore, threats, or encouraging harm' },
  { key: 'political', label: 'Political content', sub: 'Campaigns, candidates, parties or propaganda' },
  { key: 'hate', label: 'Hate speech or harassment', sub: 'Bullying or attacks on who someone is' },
  { key: 'scam', label: 'Scam, spam or fake', sub: 'Misleading promos, fake deals, spam' },
  { key: 'copyright', label: 'Copyright / stolen music', sub: 'Uses music or photos without permission' },
  { key: 'other', label: 'Something else', sub: 'Breaks the Terms in another way' },
];

// ---------- Storage ----------
export type ImageBucket = 'avatars' | 'banners' | 'band-photos' | 'post-images' | 'gear-photos';

const safeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9.\-_]/g, '-').slice(-60);

/** Uploads into `<bucket>/<userId>/<timestamp>-<name>` and returns the storage path. */
export async function uploadFile(bucket: ImageBucket | 'tracks', userId: string, file: File): Promise<string> {
  const path = `${userId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

export function publicUrl(bucket: ImageBucket, path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Uploads an image and returns its public URL (for *_url columns). */
export async function uploadImage(bucket: ImageBucket, userId: string, file: File): Promise<string> {
  const path = await uploadFile(bucket, userId, file);
  return publicUrl(bucket, path)!;
}

export async function trackUrl(path: string, download = false, filename?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('tracks')
    .createSignedUrl(path, 60 * 60, download ? { download: filename || true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export const MAX_IMAGE_MB = 5;
export const MAX_TRACK_MB = 50;
export function checkFile(file: File, kind: 'image' | 'audio'): string | null {
  const maxMb = kind === 'image' ? MAX_IMAGE_MB : MAX_TRACK_MB;
  if (file.size > maxMb * 1024 * 1024) return `File is too large (max ${maxMb} MB).`;
  if (kind === 'image' && !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return 'Please choose a JPG, PNG or WebP image.';
  if (kind === 'audio' && !/^audio\/(mpeg|mp3|wav|x-wav|wave)$/.test(file.type)) return 'Please choose an MP3 or WAV file.';
  return null;
}

// ---------- Misc helpers ----------
export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatGigDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function peso(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'Trade only';
  return '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

export function initials(name?: string | null): string {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function toHandle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
}

export function errorMessage(e: any): string {
  const msg: string = e?.message || String(e);
  if (/duplicate key.*username/i.test(msg) || /profiles_username_key/.test(msg)) return 'That username is already taken.';
  if (/bands_handle_key/.test(msg)) return 'That band username is already taken.';
  if (/row-level security/i.test(msg)) return 'You don’t have permission to do that yet. Make sure you’ve accepted the Terms and are logged in.';
  if (/Upload limit reached/i.test(msg)) return 'Upload limit reached: 3 tracks max for now.';
  if (/check constraint.*username/i.test(msg)) return 'Username must be 3–30 characters: lowercase letters, numbers or _.';
  if (/check constraint.*handle/i.test(msg)) return 'Band username must be 3–30 characters: lowercase letters, numbers or _.';
  if (/reports_reporter_id_target_type_target_id_key/.test(msg)) return 'You already reported this. Our moderators will review it.';
  return msg;
}
