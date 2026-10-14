/**
 * Reads any YouTube link a band pastes — youtube.com/watch?v=…, youtu.be/…, /shorts/…, /live/…, /embed/…,
 * m. / music. subdomains, with or without https:// — and returns the video id and start time (seconds).
 */
export function parseYouTube(input: string): { id: string; start: number | null } | null {
  const raw = input.trim();
  if (!raw) return null;
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(shorts|live|embed|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return { id, start: parseStart(u.searchParams.get('t') || u.searchParams.get('start')) };
}

/** "90", "90s", "1m30s", "1h2m3s" → seconds. */
function parseStart(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+s?$/.test(t)) return Math.min(86400, parseInt(t, 10)) || null;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  const s = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return Math.min(86400, s) || null;
}

/** A link to show back in the edit form. */
export const youTubeLink = (id: string, start?: number | null) => `https://youtu.be/${id}${start ? `?t=${start}` : ''}`;
