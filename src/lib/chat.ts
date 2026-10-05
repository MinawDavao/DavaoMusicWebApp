import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { checkFile } from './db';
import { useAuth } from '../context/AuthContext';

export interface ChatPerson { id: string; display_name: string; username: string; avatar_url: string | null; role: string; is_verified?: boolean }
export interface Conversation {
  id: string; user_a: string; user_b: string; created_at: string; last_message_at: string; last_message: string | null; last_sender: string | null;
  a_read_at: string | null; b_read_at: string | null; a_cleared_at: string | null; b_cleared_at: string | null;
  a?: ChatPerson | null; b?: ChatPerson | null;
}
export interface ChatListing { id: string; title: string; price: number | null; deal_type: string; status: string; seller_id: string; listing_photos?: { image_path: string; position: number }[] }
export interface Message {
  id: string; conversation_id: string; sender_id: string; body: string | null; image_path: string | null;
  listing_id: string | null; is_hidden: boolean; created_at: string;
  listings?: ChatListing | null;
}

const PERSON = 'id, display_name, username, avatar_url, role, is_verified';
export const CONV_COLS = `*, a:profiles!conversations_user_a_fkey(${PERSON}), b:profiles!conversations_user_b_fkey(${PERSON})`;
export const MSG_COLS = '*, listings(id, title, price, deal_type, status, seller_id, listing_photos(image_path, position))';

/** My side of a conversation. */
export function side(c: Conversation, me: string) {
  const isA = c.user_a === me;
  return {
    other: (isA ? c.b : c.a) ?? null,
    otherId: isA ? c.user_b : c.user_a,
    myRead: isA ? c.a_read_at : c.b_read_at,
    theirRead: isA ? c.b_read_at : c.a_read_at,
    cleared: isA ? c.a_cleared_at : c.b_cleared_at,
  };
}
export function isUnread(c: Conversation, me: string) {
  const s = side(c, me);
  return !!c.last_sender && c.last_sender !== me
    && (!s.myRead || c.last_message_at > s.myRead)
    && (!s.cleared || c.last_message_at > s.cleared);
}

/** Uploads a chat photo into the private bucket: <conversation>/<me>/<file>. Returns its path. */
export async function uploadChatPhoto(convId: string, userId: string, file: File): Promise<string> {
  const bad = checkFile(file, 'image'); if (bad) throw new Error(bad);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const path = `${convId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('chat-photos').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}

// Private photos need short-lived signed links. Cached so scrolling doesn't re-sign.
const signed = new Map<string, { url: string; exp: number }>();
export async function signChatPhotos(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const fresh = [...new Set(paths)].filter((p) => (signed.get(p)?.exp ?? 0) <= now);
  if (fresh.length) {
    const { data } = await supabase.storage.from('chat-photos').createSignedUrls(fresh, 3600);
    (data || []).forEach((d) => { if (d.signedUrl && d.path) signed.set(d.path, { url: d.signedUrl, exp: now + 55 * 60_000 }); });
  }
  const out: Record<string, string> = {};
  paths.forEach((p) => { const s = signed.get(p); if (s) out[p] = s.url; });
  return out;
}

/** Unread chats badge: on login, every minute, on focus, and live when a message arrives. */
export function useChatUnread() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const uid = user?.id;
  const refresh = useCallback(async () => {
    if (!uid) return setCount(0);
    const { data } = await supabase.rpc('chat_unread_count');
    setCount(typeof data === 'number' ? data : 0);
  }, [uid]);
  useEffect(() => {
    if (!uid) { setCount(0); return; }
    refresh();
    const t = setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    const onRead = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('minaw-chat-read', onRead);
    const ch = supabase.channel(`chat-badge-${uid}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p: any) => { if (p.new?.sender_id !== uid) setTimeout(refresh, 400); })
      .subscribe();
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); window.removeEventListener('minaw-chat-read', onRead); supabase.removeChannel(ch); };
  }, [uid, refresh]);
  return count;
}

export const chatReadEvent = () => window.dispatchEvent(new Event('minaw-chat-read'));
