/** Turning what people type ("facebook.com/band", "@myband", "www.site.ph") into safe, clickable https links. */

/** Any typed web address → https link, or null if it isn't a normal web link (blocks javascript:, data:, …). */
export function webLink(u: string | null | undefined): string | null {
  const t = (u || '').trim();
  if (!t) return null;
  const v = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v)) return null;
  try { const x = new URL(v); return x.hostname.includes('.') ? x.href : null; } catch { return null; }
}

/** Instagram: "@name", "name", "instagram.com/name" or a full link. */
export function instagramLink(v: string | null | undefined): string | null {
  const t = (v || '').trim();
  if (!t) return null;
  if (/instagram\.com|^https?:/i.test(t)) return webLink(t);
  const h = t.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? `https://www.instagram.com/${h}` : null;
}

/** Facebook: a link, "facebook.com/page", "@page"/"page" (username), or a page name with spaces (opens a Facebook search). */
export function facebookLink(v: string | null | undefined): string | null {
  const t = (v || '').trim();
  if (!t) return null;
  if (/facebook\.com|fb\.com|fb\.me|^https?:/i.test(t)) return webLink(t);
  const h = t.replace(/^@/, '');
  if (/^[A-Za-z0-9.]{3,80}$/.test(h)) return `https://www.facebook.com/${h}`;
  return `https://www.facebook.com/search/top?q=${encodeURIComponent(t)}`;
}

/** Finds web addresses inside free text (bios, posts, comments). */
export const URL_IN_TEXT = /\b((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-z0-9-]+\.)+(?:com|net|org|ph|io|me|co|app|dev|tv|fm|be|gg|link|page|site|store|shop|music|band)(?![a-z0-9@-]|\.[a-z0-9])(?:\/[^\s<>()]*)?)/gi;
/** Trailing punctuation that belongs to the sentence, not the link ("see site.com."). */
export const trimLinkEnd = (s: string) => s.replace(/[.,!?;:'"’”)\]]+$/, '');
