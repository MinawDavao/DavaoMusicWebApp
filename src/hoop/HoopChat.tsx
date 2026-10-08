import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Smile, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar } from '../components/ui';
import { H, PERSON, type HoopPerson } from './lib';

interface ChatMsg { id: string; game_id: string; author_id: string; body: string; created_at: string; author?: HoopPerson | null }

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

/** Group chat for one schedule. Booked players and admins can read and send. */
export const HoopChat: React.FC<{ scheduleId: string; canChat: boolean; title?: string }> = ({ scheduleId, canChat, title }) => {
  const go = useNav();
  const { user, isModerator } = useAuth();
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const people = useRef<Record<string, HoopPerson>>({});
  const stick = useRef(true);   // keep scrolled to the newest message unless the reader scrolled up

  useEffect(() => {
    if (!canChat) { setMsgs(null); return; }
    let alive = true;
    const remember = (rows: ChatMsg[]) => rows.forEach((m) => { if (m.author) people.current[m.author_id] = m.author; });
    supabase.from('hoop_chat').select(`*, author:profiles!hoop_chat_author_id_fkey(${PERSON})`).eq('game_id', scheduleId)
      .order('created_at', { ascending: false }).limit(150)
      .then(({ data }) => { if (!alive) return; const rows = ((data as any[]) || []).reverse(); remember(rows); setMsgs(rows); });
    const ch = supabase.channel(`hoop-chat-${scheduleId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hoop_chat', filter: `game_id=eq.${scheduleId}` }, async (p: any) => {
        const m = p.new as ChatMsg;
        if (!people.current[m.author_id]) {
          const { data } = await supabase.from('profiles').select(PERSON).eq('id', m.author_id).maybeSingle();
          if (data) people.current[m.author_id] = data as any;
        }
        setMsgs((xs) => (!xs || xs.some((x) => x.id === m.id) ? xs : [...xs, { ...m, author: people.current[m.author_id] }]));
      })
      // (deletes can't be filtered, so match on the id)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hoop_chat' }, (p: any) => {
        setMsgs((xs) => xs && xs.filter((x) => x.id !== p.old?.id));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [scheduleId, canChat]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy || !user) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from('hoop_chat').insert({ game_id: scheduleId, author_id: user.id, body })
      .select(`*, author:profiles!hoop_chat_author_id_fkey(${PERSON})`).single();
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setText(''); setEmoji(false); stick.current = true;
    setMsgs((xs) => (!xs || xs.some((x) => x.id === (data as any).id) ? xs : [...xs, data as any]));
    inputRef.current?.focus();
  };
  const remove = async (m: ChatMsg) => {
    if (!confirm('Delete this message for everyone?')) return;
    const { error } = await supabase.from('hoop_chat').delete().eq('id', m.id);
    if (error) return setErr(errorMessage(error));
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
        <h2 className="font-hoop italic font-black text-[22px] uppercase text-white flex items-center gap-2"><MessageCircle className="w-5 h-5 text-[#F28C14]" />Team chat</h2>
        {msgs && <span className="text-[11px] text-[#A8A29E]">{title || 'Booked players'}</span>}
      </div>

      {!canChat ? (
        <div className="p-4 rounded-2xl border border-white/10 text-center space-y-1" style={{ background: H.surface }}>
          <p className="text-[22px]">🏀💬</p>
          <p className="text-[13px] font-bold text-white">Book a slot to join the chat</p>
          <p className="text-[11px] text-[#A8A29E]">Only players booked on this schedule can see and send messages.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: H.surface }}>
          <div ref={boxRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
            className="h-[320px] overflow-y-auto px-3 py-3 space-y-2.5" aria-live="polite">
            {msgs === null && <p className="text-center text-[12px] text-[#A8A29E] py-10">Loading chat…</p>}
            {msgs?.length === 0 && (
              <div className="text-center py-10 space-y-1">
                <p className="text-[28px]">🏀🔥</p>
                <p className="text-[13px] font-bold text-white">No messages yet</p>
                <p className="text-[11px] text-[#A8A29E]">Say hi to the squad before game day!</p>
              </div>
            )}
            {msgs?.map((m, i) => {
              const mine = m.author_id === user?.id;
              const prev = msgs[i - 1];
              const grouped = prev && prev.author_id === m.author_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60e3;
              const onlyEmoji = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,12}$/u.test(m.body) && !/[0-9#*]/.test(m.body);
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
                      className={`text-left whitespace-pre-wrap break-words ${canDelete ? 'cursor-pointer' : 'cursor-default'} ${onlyEmoji
                        ? 'text-[34px] leading-tight px-0.5'
                        : `px-3 py-2 rounded-2xl text-[13px] leading-snug ${mine ? 'bg-[#F28C14] text-[#111] rounded-br-md' : 'bg-white/[0.08] text-white rounded-bl-md'}`}`}>
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
              className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center cursor-pointer ${emoji ? 'bg-[#F28C14] text-[#111]' : 'text-[#D6D3D1] hover:bg-white/10'}`}><Smile className="w-5 h-5" /></button>
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder="Message the squad…" aria-label="Chat message"
              className="flex-1 min-w-0 h-10 px-3.5 rounded-xl bg-[#151515] border border-white/15 text-[14px] text-white placeholder:text-[#78716C] outline-none focus:border-[#F28C14]" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
              className="w-10 h-10 flex-shrink-0 rounded-xl bg-[#F28C14] text-[#111] flex items-center justify-center cursor-pointer disabled:opacity-40"><Send className="w-4 h-4" /></button>
          </form>
        </div>
      )}
    </section>
  );
};
