import React, { useEffect, useRef, useState } from 'react';
import { confirmDelete } from '../components/ConfirmDelete';
import { ImageIcon, Loader2, MessageCircle, Send, Smile, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, removeImageByUrl, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, FilePick } from '../components/ui';
import { shrinkPhoto } from './HoopPlayer';
import { H, PERSON, useHoopAdmin, type HoopPerson } from './lib';

interface ChatMsg { id: string; club_id: string; author_id: string; body: string; image_url?: string | null; created_at: string; author?: HoopPerson | null }

const EMOJIS = [
  '🏀', '🔥', '💪', '😂', '🤣', '😎', '🙌', '👏', '💯', '⛹️', '🏆', '🥇',
  '😤', '😅', '😭', '🤔', '😮', '🥶', '🫡', '👀', '🤝', '👍', '👎', '🙏',
  '❤️', '🧡', '⚡', '💥', '🎯', '🧱', '🗑️', '🐐', '👑', '🚀', '🍻', '🎉',
];

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/** Remembers (on this phone) when the club chat was last read, for the unread dot on the Chat tab. */
export const chatSeenKey = (clubId: string) => `hoop-chat-seen-${clubId}`;
export const markChatSeen = (clubId: string, iso: string) => {
  try { if ((localStorage.getItem(chatSeenKey(clubId)) || '') < iso) localStorage.setItem(chatSeenKey(clubId), iso); } catch { /* ignore */ }
  window.dispatchEvent(new Event('hoop-chat-seen'));
};

/** The club's group chat. Active members and club admins can read and send. */
export const HoopChat: React.FC<{ clubId: string; canChat: boolean; title?: string }> = ({ clubId, canChat, title }) => {
  const go = useNav();
  const { user } = useAuth();
  const isModerator = useHoopAdmin();   // main admin or Hoop admin
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<string | null>(null);   // preview of a photo being sent
  const [big, setBig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const people = useRef<Record<string, HoopPerson>>({});
  const stick = useRef(true);   // keep scrolled to the newest message unless the reader scrolled up

  useEffect(() => {
    if (!canChat) { setMsgs(null); return; }
    let alive = true;
    const remember = (rows: ChatMsg[]) => rows.forEach((m) => { if (m.author) people.current[m.author_id] = m.author; });
    supabase.from('hoop_club_chat').select(`*, author:profiles!hoop_club_chat_author_id_fkey(${PERSON})`).eq('club_id', clubId)
      .order('created_at', { ascending: false }).limit(150)
      .then(({ data }) => { if (!alive) return; const rows = ((data as any[]) || []).reverse(); remember(rows); setMsgs(rows); });
    const ch = supabase.channel(`hoop-chat-${clubId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hoop_club_chat', filter: `club_id=eq.${clubId}` }, async (p: any) => {
        const m = p.new as ChatMsg;
        if (!people.current[m.author_id]) {
          const { data } = await supabase.from('profiles').select(PERSON).eq('id', m.author_id).maybeSingle();
          if (data) people.current[m.author_id] = data as any;
        }
        setMsgs((xs) => (!xs || xs.some((x) => x.id === m.id) ? xs : [...xs, { ...m, author: people.current[m.author_id] }]));
      })
      // (deletes can't be filtered, so match on the id)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hoop_club_chat' }, (p: any) => {
        setMsgs((xs) => xs && xs.filter((x) => x.id !== p.old?.id));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [clubId, canChat]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    const last = msgs?.[msgs.length - 1];
    if (last) markChatSeen(clubId, last.created_at);
  }, [msgs, clubId]);

  const send = async (image?: string) => {
    const body = text.trim();
    if ((!body && !image) || busy || !user) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from('hoop_club_chat').insert({ club_id: clubId, author_id: user.id, body, image_url: image ?? null })
      .select(`*, author:profiles!hoop_club_chat_author_id_fkey(${PERSON})`).single();
    setBusy(false);
    if (error) { if (image) removeImageByUrl(image); return setErr(errorMessage(error)); }
    setText(''); setEmoji(false); stick.current = true;
    setMsgs((xs) => (!xs || xs.some((x) => x.id === (data as any).id) ? xs : [...xs, data as any]));
    inputRef.current?.focus();
  };
  /** Pick a photo → shrink → upload → send it (with whatever is typed as its caption). */
  const sendPhoto = async (f: File) => {
    if (!user || busy) return;
    if (!f.type.startsWith('image/')) return setErr('Please pick a photo.');
    setErr(null);
    const preview = URL.createObjectURL(f);
    setSending(preview); stick.current = true;
    try {
      const small = f.type === 'image/gif' ? f : await shrinkPhoto(f, 1600);
      if (small.size > 8 * 1024 * 1024) throw new Error('That photo is too big (8 MB max).');
      const url = await uploadImage('post-images', user.id, small);
      await send(url);
    } catch (e) { setErr(errorMessage(e)); }
    setSending(null); URL.revokeObjectURL(preview);
  };
  const remove = async (m: ChatMsg) => {
    if (!(await confirmDelete({ title: 'Delete this message for everyone?' }))) return;
    const { error } = await supabase.from('hoop_club_chat').delete().eq('id', m.id);
    if (error) return setErr(errorMessage(error));
    if (m.image_url && m.author_id === user?.id) removeImageByUrl(m.image_url);
    setMsgs((xs) => xs && xs.filter((x) => x.id !== m.id));
  };
  const addEmoji = (e: string) => {
    const el = inputRef.current;
    const at = el?.selectionStart ?? text.length;
    const next = (text.slice(0, at) + e + text.slice(el?.selectionEnd ?? at)).slice(0, 500);
    setText(next);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + e.length, at + e.length); } });
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-hoop italic font-black text-[22px] uppercase text-white flex items-center gap-2"><MessageCircle className="w-5 h-5 text-[var(--hp)]" />Club chat</h2>
        {msgs && title && <span className="text-[11px] text-[#A8A29E]">{title}</span>}
      </div>

      {!canChat ? (
        <div className="p-4 rounded-2xl border border-white/10 text-center space-y-1" style={{ background: H.surface }}>
          <p className="text-[22px]">🏀💬</p>
          <p className="text-[13px] font-bold text-white">Join the club to chat</p>
          <p className="text-[11px] text-[#A8A29E]">Only approved club members and club admins can see and send messages.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: H.surface }}>
          <div ref={boxRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
            className="h-[calc(100dvh-300px)] min-h-[300px] overflow-y-auto px-3 py-3 space-y-2.5" aria-live="polite">
            {msgs === null && <p className="text-center text-[12px] text-[#A8A29E] py-10">Loading chat…</p>}
            {msgs?.length === 0 && (
              <div className="text-center py-10 space-y-1">
                <p className="text-[28px]">🏀🔥</p>
                <p className="text-[13px] font-bold text-white">No messages yet</p>
                <p className="text-[11px] text-[#A8A29E]">Say hi to the club!</p>
              </div>
            )}
            {msgs?.map((m, i) => {
              const mine = m.author_id === user?.id;
              const prev = msgs[i - 1];
              const grouped = prev && prev.author_id === m.author_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60e3;
              const onlyEmoji = !!m.body && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,12}$/u.test(m.body) && !/[0-9#*]/.test(m.body);
              const canDelete = mine || isModerator;
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? '!mt-0.5' : ''}`}>
                  {!mine && (
                    <button onClick={() => go({ name: 'hoopPlayer', id: m.author_id })} className={`self-end flex-shrink-0 cursor-pointer ${grouped ? 'invisible' : ''}`} aria-label={`${m.author?.display_name || 'Player'}’s card`}>
                      <Avatar src={m.author?.avatar_url} name={m.author?.display_name} size={28} />
                    </button>
                  )}
                  <div className={`max-w-[78%] min-w-0 flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && !grouped && <span className="px-1 mb-0.5 text-[10px] font-bold text-[#A8A29E] truncate max-w-full">{m.author?.display_name || 'Player'}</span>}
                    <button onClick={() => canDelete && setSel(sel === m.id ? null : m.id)}
                      className={`text-left whitespace-pre-wrap break-words ${canDelete ? 'cursor-pointer' : 'cursor-default'} ${m.image_url && !m.body
                        ? 'p-0'
                        : onlyEmoji
                        ? 'text-[34px] leading-tight px-0.5'
                        : `px-3 py-2 rounded-2xl text-[13px] leading-snug ${mine ? 'bg-[var(--hp)] text-[#111] rounded-br-md' : 'bg-white/[0.08] text-white rounded-bl-md'}`}`}>
                      {m.image_url && (
                        <img src={m.image_url} alt="Photo" loading="lazy" onClick={(e) => { e.stopPropagation(); setBig(m.image_url!); }}
                          className={`block max-w-[220px] max-h-[280px] w-auto h-auto rounded-xl object-cover cursor-zoom-in ${m.body ? 'mb-1.5' : ''}`} />
                      )}
                      {m.body}
                    </button>
                    <span className="px-1 mt-0.5 flex items-center gap-2 text-[9px] text-[#78716C]">
                      {when(m.created_at)}
                      {sel === m.id && canDelete && (
                        <button onClick={() => remove(m)} className="flex items-center gap-0.5 text-[#FF8A9C] font-bold cursor-pointer"><Trash2 className="w-3 h-3" />Delete</button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="flex justify-end">
                <div className="relative">
                  <img src={sending} alt="" className="max-w-[220px] max-h-[280px] rounded-xl opacity-50" />
                  <span className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-white" /></span>
                </div>
              </div>
            )}
          </div>

          {emoji && (
            <div className="grid grid-cols-9 gap-0.5 px-2 py-2 border-t border-white/10 bg-black/30">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => addEmoji(e)} className="h-9 rounded-lg text-[20px] hover:bg-white/10 active:scale-90 transition-transform cursor-pointer" aria-label={`Add ${e}`}>{e}</button>
              ))}
            </div>
          )}

          {err && <p className="px-3 pt-2 text-[11px] font-bold text-[#FF8A9C]">{err}</p>}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-1.5 p-2 border-t border-white/10">
            <button type="button" onClick={() => setEmoji(!emoji)} aria-pressed={emoji} aria-label="Emojis"
              className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center cursor-pointer ${emoji ? 'bg-[var(--hp)] text-[#111]' : 'text-[#D6D3D1] hover:bg-white/10'}`}><Smile className="w-5 h-5" /></button>
            <FilePick accept="image/*" onPick={sendPhoto} disabled={busy || !!sending}
              className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center cursor-pointer text-[#D6D3D1] hover:bg-white/10">
              <ImageIcon className="w-5 h-5" aria-label="Send a photo" />
            </FilePick>
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder="Message the squad…" aria-label="Chat message"
              className="flex-1 min-w-0 h-10 px-3.5 rounded-xl bg-[#151515] border border-white/15 text-[14px] text-white placeholder:text-[#78716C] outline-none focus:border-[var(--hp)]" />
            <button type="submit" disabled={busy || !!sending || !text.trim()} aria-label="Send"
              className="w-10 h-10 flex-shrink-0 rounded-xl bg-[var(--hp)] text-[#111] flex items-center justify-center cursor-pointer disabled:opacity-40"><Send className="w-4 h-4" /></button>
          </form>
        </div>
      )}
      {big && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-3" onClick={() => setBig(null)} role="dialog" aria-label="Photo">
          <img src={big} alt="" className="max-w-full max-h-full rounded-xl" />
          <button onClick={() => setBig(null)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
      )}
    </section>
  );
};
