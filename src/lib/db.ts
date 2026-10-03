import { supabase } from './supabase';

// ---------- Row types (mirror supabase/migrations) ----------
export type Role = 'fan' | 'artist' | 'venue';

/** Label + colours for each account type (fans mint, artists purple, venues amber). */
export const ROLE_META: Record<Role, { label: string; text: string; chip: string; square: boolean }> = {
  fan:    { label: 'Fan',    text: 'text-[#53E6D4]', chip: 'bg-[#53E6D4]/15 text-[#53E6D4]', square: false },
  artist: { label: 'Artist', text: 'text-[#B7A8FF]', chip: 'bg-[#6045F4]/25 text-[#B7A8FF]', square: true },
  venue:  { label: 'Venue/Business',  text: 'text-[#FFC34D]', chip: 'bg-[#FFB800]/15 text-[#FFC34D]', square: true },
};
export const roleMeta = (r?: string | null) => ROLE_META[(r as Role) in ROLE_META ? (r as Role) : 'fan'];

export const VENUE_TYPES = ['Bar / Pub', 'Café', 'Restaurant', 'Events Place', 'Concert Hall', 'Club', 'Studio', 'Music Store', 'Lights & Sound', 'Event Organizer', 'Outdoor / Park', 'Other'];

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
  card_bg_url: string | null;
  card_bg_crop: { x: number; y: number; zoom: number } | null;
  venue_type: string | null;
  venue_address: string | null;
  venue_capacity: number | null;
  venue_contact: string | null;
  venue_map_url: string | null;
}

export interface Sponsor {
  id: string;
  title: string;
  sponsor_name: string;
  badge: string | null;
  tagline: string | null;
  details: string | null;
  image_url: string | null;
  cta_text: string;
  promo_code: string | null;
  link_url: string | null;
  contact: string | null;
  venue_id: string | null;
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  clicks: number;
  created_at: string;
  venue?: Pick<Profile, 'id' | 'display_name' | 'username' | 'avatar_url'> | null;
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
  venue_id: string | null;
  district_tag: string | null;
  created_at: string;
  edited_at: string | null;
  venue?: Pick<Profile, 'id' | 'display_name' | 'username'> | null;
  profiles?: Pick<Profile, 'id' | 'display_name' | 'username' | 'avatar_url' | 'role' | 'is_verified'> | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
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

export type ReportTarget = 'post' | 'comment' | 'listing' | 'track' | 'band' | 'review' | 'profile' | 'track_comment';
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
export type ImageBucket = 'avatars' | 'banners' | 'band-photos' | 'post-images' | 'gear-photos' | 'sponsors';

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

/** Deletes an uploaded image given its public URL (best effort). Skips URLs that are still used elsewhere (`stillUsed`). */
export async function removeImageByUrl(url: string | null | undefined, stillUsed: (string | null | undefined)[] = []): Promise<void> {
  if (!url || stillUsed.includes(url)) return;
  const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return;
  try { await supabase.storage.from(m[1]).remove([decodeURIComponent(m[2].split('?')[0])]); } catch { /* ignore */ }
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
  if (/bands_owner_id_key/.test(msg)) return 'You already have a band page — refresh the page to edit it.';
  if (/row-level security/i.test(msg)) return 'You don’t have permission to do that yet. Make sure you’ve accepted the Terms and are logged in.';
  if (/Upload limit reached/i.test(msg)) return 'Upload limit reached: 3 tracks max for now.';
  if (/check constraint.*username/i.test(msg)) return 'Username must be 3–30 characters: lowercase letters, numbers or _.';
  if (/check constraint.*handle/i.test(msg)) return 'Band username must be 3–30 characters: lowercase letters, numbers or _.';
  if (/reports_reporter_id_target_type_target_id_key/.test(msg)) return 'You already reported this. Our moderators will review it.';
  if (/year_formed_check/.test(msg)) return 'Year formed should be between 1950 and 2100.';
  if (/display_name_check|name_check/.test(msg)) return 'Name must be 1–80 characters.';
  if (/bio_check/.test(msg)) return 'Your bio is too long.';
  if (/description_check|content_check|message_check|details_check/.test(msg)) return 'That text is too long (or empty). Please shorten it and try again.';
  if (/title_check/.test(msg)) return 'Please enter a title (not too long).';
  if (/price_check/.test(msg)) return 'Price can’t be negative.';
  if (/listings_check/.test(msg)) return 'Please enter a price (only “For Trade” listings can skip it).';
  if (/gigs_check/.test(msg)) return 'The end time must be after the start time.';
  if (/MUSIC_RIGHTS/.test(msg)) return 'Please tick “I own or have permission to share my music” before uploading.';
  if (/Accounts with a band page stay Artist/.test(msg)) return 'Accounts with a band page stay Artist accounts.';
  if (/venue_capacity_check/.test(msg)) return 'Capacity should be a number between 1 and 100,000.';
  if (/venue_reviews_check/.test(msg)) return 'You can’t write a testimonial for your own venue.';
  if (/band_reviews_band_id_author_id_key|venue_reviews_venue_id_author_id_key/.test(msg)) return 'You already wrote a testimonial here — you can edit it instead.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Network problem — check your connection and try again.';
  return msg;
}
