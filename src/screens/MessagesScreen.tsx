import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, Copy, Flag, ImagePlus, Loader2, MessageCircle, Search, Send, Tag, Trash2, Undo2, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DEAL_LABELS, errorMessage, peso, publicUrl, roleMeta, timeAgo, type DealType } from '../lib/db';
import {
  CONV_COLS, MSG_COLS, chatReadEvent, isUnread, side, signChatPhotos, uploadChatPhoto,
  type ChatListing, type Conversation, type Message,
} from '../lib/chat';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useNav } from '../nav';
import { Avatar, EmptyState, ErrorNote, FilePick, Spinner, btn } from '../components/ui';
import { ReportModal } from '../components/ReportModal';
import { BlockMenu, BlockedBanner, useMyBlock } from '../components/BlockMenu';
import { ZoomImg } from '../components/Zoom';
import { copyText } from '../components/Share';

const PAGE = 40;

// ===================================================================== INBOX
export const MessagesScreen: React.FC = () => {
  const go = useNav();
  const { user } = useAuth();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [q, setQ] = useState('');
  const uid = user?.id;

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('conversations').select(CONV_COLS)
      .or(`user_a.eq.${uid},user_b.eq.${uid}`).not('last_sender', 'is', null)
      .order('last_message_at', { ascending: false }).limit(100);
    const rows = ((data as any[]) || []) as Conversation[];
    setList(rows.filter((c) => { const s = side(c, uid); return !s.cleared || c.last_message_at > s.cleared; }));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    load();
    const ch = supabase.channel(`inbox-${uid}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => setTimeout(load, 300))
      .subscribe();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', onFocus); };
  }, [uid, load]);

  if (!user) {
    return <div className="px-3 py-6"><EmptyState icon={MessageCircle} title="Log in to see your messages" text="Chat with sellers, bands, venues and fans." action={<button onClick={() => go({ name: 'auth', mode: 'login' })} className={btn.primary}>Log In</button>} /></div>;
  }

  const term = q.trim().toLowerCase();
  const shown = (list || []).filter((c) => {
    if (!term) return true;
    const o = side(c, uid!).other;
    return !!o && (o.display_name.toLowerCase().includes(term) || o.username.toLowerCase().includes(term));
  });

  return (
    <div className="px-3 py-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="w-10 h-10 rounded-xl bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#B7A8FF] flex items-center justify-center"><MessageCircle className="w-5 h-5" /></span>
        <div>
          <h1 className="font-heading font-bold text-xl text-white leading-tight">Messages</h1>
          <p className="text-[11px] text-[#8E9AA7]">Private chats — only you and the other person can read them</p>
        </div>
      </div>
      {(list?.length ?? 0) > 4 && (
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9AA7]" />
          <input type="text" inputMode="search" aria-label="Search chats" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats"
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#161B20] border border-white/15 text-sm text-white placeholder:text-[#8E9AA7] outline-none focus:border-[#53E6D4]" />
        </label>
      )}
      {list === null ? <Spinner /> : shown.length === 0 ? (
        <EmptyState icon={MessageCircle} title={term ? 'No chats match' : 'No messages yet'}
          text={term ? 'Try another name.' : 'Tap “Message” on someone’s profile, a band page, or “Message Seller” on a deal to start chatting.'}
          action={!term ? <button onClick={() => go({ name: 'deals' })} className={btn.ghost}><Tag className="w-4 h-4" />Browse Deals</button> : undefined} />
      ) : (
        <div className="rounded-2xl bg-[#1D232A] border border-white/[0.08] overflow-hidden">
          {shown.map((c) => {
            const s = side(c, uid!);
            const o = s.other;
            const unread = isUnread(c, uid!);
            return (
              <button key={c.id} onClick={() => go({ name: 'chat', id: c.id })}
                className={`w-full flex items-center gap-3 px-3.5 py-3 text-left border-b border-white/[0.05] last:border-0 cursor-pointer hover:bg-white/[0.03] ${unread ? 'bg-[#6045F4]/10' : ''}`}>
                <Avatar src={o?.avatar_url} name={o?.display_name || 'Member'} size={46} square={roleMeta(o?.role).square} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className={`text-[14px] truncate ${unread ? 'font-bold text-white' : 'font-semibold text-[#EBEBED]'}`}>{o?.display_name || 'MINAW member'}</span>
                    {o?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#53E6D4] flex-shrink-0" />}
                    <span className="ml-auto text-[10px] text-[#8E9AA7] flex-shrink-0">{timeAgo(c.last_message_at)}</span>
                  </span>
                  <span className={`block text-[12px] truncate ${unread ? 'text-white' : 'text-[#8E9AA7]'}`}>
                    {c.last_sender === uid && 'You: '}{c.last_message || 'Message removed'}
                  </span>
                </span>
                {unread && <span className="w-2.5 h-2.5 rounded-full bg-[#53E6D4] flex-shrink-0" aria-label="Unread" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ===================================================================== ONE CHAT
const dayLabel = (iso: string) => {
  const d = new Date(iso); const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const ListingChip: React.FC<{ l: ChatListing; onClick?: () => void; small?: boolean }> = ({ l, onClick, small }) => {
  const ph = [...(l.listing_photos || [])].sort((a, b) => a.position - b.position)[0];
  return (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-2.5 p-2 rounded-xl bg-black/25 border border-white/10 text-left ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
      {ph ? <img src={publicUrl('gear-photos', ph.image_path)!} alt="" className={`${small ? 'w-9 h-9' : 'w-11 h-11'} rounded-lg object-cover bg-[#252D37] flex-shrink-0`} />
        : <span className={`${small ? 'w-9 h-9' : 'w-11 h-11'} rounded-lg bg-[#252D37] flex items-center justify-center flex-shrink-0`}><Tag className="w-4 h-4 text-[#53E6D4]" /></span>}
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-[#53E6D4]">About this deal{l.status === 'sold' ? ' · sold' : ''}</span>
        <span className="block text-[12px] font-bold text-white truncate">{l.title}</span>
        <span className="block text-[11px] text-[#C9D1D9]">{peso(l.price)} · {DEAL_LABELS[l.deal_type as DealType] || ''}</span>
      </span>
    </button>
  );
};

export const ChatScreen: React.FC<{ id: string; listing?: string }> = ({ id, listing }) => {
  const go = useNav();
  const { user } = useAuth();
  const { current } = usePlayer();
  const uid = user?.id;
  const [conv, setConv] = useState<Conversation | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [about, setAbout] = useState<ChatListing | null>(null);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);   // message with its actions open
  const [report, setReport] = useState<{ type: 'message' | 'profile'; id: string; label: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const ta = useRef<HTMLTextAreaElement>(null);

  const s = conv && uid ? side(conv, uid) : null;
  const other = s?.other ?? null;
  const { block, reload: reloadBlock } = useMyBlock(s?.otherId);

  const sign = useCallback(async (rows: Message[]) => {
    const paths = rows.map((m) => m.image_path).filter(Boolean) as string[];
    if (paths.length) { const u = await signChatPhotos(paths); setUrls((x) => ({ ...x, ...u })); }
  }, []);

  const markRead = useCallback(async () => {
    await supabase.rpc('chat_mark_read', { p_conv: id });
    chatReadEvent();
  }, [id]);

  // first load
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const { data: c } = await supabase.from('conversations').select(CONV_COLS).eq('id', id).maybeSingle();
      if (!alive) return;
      if (!c) { setConv(null); return; }
      const cv = c as any as Conversation;
      const cleared = side(cv, uid).cleared;
      let mq = supabase.from('messages').select(MSG_COLS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(PAGE);
      if (cleared) mq = mq.gt('created_at', cleared);
      const { data: m } = await mq;
      if (!alive) return;
      const rows = (((m as any[]) || []) as Message[]).reverse();
      setConv(cv); setMsgs(rows); setHasOlder(rows.length === PAGE);
      sign(rows); markRead();
    })();
    return () => { alive = false; };
  }, [id, uid, sign, markRead]);

  // deal the chat was opened from ("Message Seller")
  useEffect(() => {
    if (!listing) return;
    supabase.from('listings').select('id, title, price, deal_type, status, seller_id, listing_photos(image_path, position)').eq('id', listing).maybeSingle()
      .then(({ data }) => setAbout((data as any) || null));
  }, [listing]);

  // live: new messages + the other person reading
  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`chat-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (p: any) => {
        const { data } = await supabase.from('messages').select(MSG_COLS).eq('id', p.new.id).maybeSingle();
        if (!data) return;
        const m = data as any as Message;
        setMsgs((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
        sign([m]);
        if (m.sender_id !== uid && document.visibilityState === 'visible') markRead();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (p: any) => {
        setMsgs((xs) => xs.filter((x) => x.id !== p.old?.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${id}` }, (p: any) => {
        setConv((c) => (c ? { ...c, ...p.new, a: c.a, b: c.b } : c));
      })
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') markRead(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  }, [id, uid, sign, markRead]);

  // keep the newest message in view (unless reading older ones)
  useEffect(() => {
    const onScroll = () => { stick.current = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => { if (stick.current) bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, conv === undefined]);

  const loadOlder = async () => {
    if (!msgs.length || !s) return;
    stick.current = false;
    let mq = supabase.from('messages').select(MSG_COLS).eq('conversation_id', id).lt('created_at', msgs[0].created_at).order('created_at', { ascending: false }).limit(PAGE);
    if (s.cleared) mq = mq.gt('created_at', s.cleared);
    const { data } = await mq;
    const rows = (((data as any[]) || []) as Message[]).reverse();
    setMsgs((xs) => [...rows, ...xs]); setHasOlder(rows.length === PAGE); sign(rows);
  };

  const send = async () => {
    if (!uid || busy) return;
    const body = text.trim();
    if (!body && !photo) return;
    setBusy(true); setErr(null);
    try {
      const image_path = photo ? await uploadChatPhoto(id, uid, photo.file) : null;
      const { data, error } = await supabase.from('messages')
        .insert({ conversation_id: id, sender_id: uid, body: body || null, image_path, listing_id: about?.id ?? null })
        .select(MSG_COLS).single();
      if (error) {
        if (image_path) await supabase.storage.from('chat-photos').remove([image_path]);
        throw error;
      }
      const m = data as any as Message;
      stick.current = true;
      setMsgs((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
      sign([m]);
      setText(''); setAbout(null); setPhoto(null);
      if (listing) go({ name: 'chat', id }); // drop the deal from the address
      setTimeout(() => ta.current?.focus(), 0);
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };

  const unsend = async (m: Message) => {
    if (!confirm('Unsend this message? It will be removed for both of you.')) return;
    setPicked(null);
    const { error } = await supabase.from('messages').delete().eq('id', m.id);
    if (error) return setErr(errorMessage(error));
    if (m.image_path) await supabase.storage.from('chat-photos').remove([m.image_path]);
    setMsgs((xs) => xs.filter((x) => x.id !== m.id));
  };
  const clearChat = async () => {
    if (!confirm('Delete this chat for you? The other person keeps their copy. New messages will still reach you.')) return;
    const { error } = await supabase.rpc('chat_clear', { p_conv: id });
    if (error) return setErr(errorMessage(error));
    chatReadEvent();
    go({ name: 'messages' });
  };
  const copyMsg = async (m: Message) => {
    setPicked(null);
    if (m.body && await copyText(m.body)) { setNote('Copied'); setTimeout(() => setNote(null), 1500); }
  };

  if (!user) return <div className="px-3 py-6"><EmptyState icon={MessageCircle} title="Log in to see your messages" action={<button onClick={() => go({ name: 'auth', mode: 'login' })} className={btn.primary}>Log In</button>} /></div>;
  if (conv === undefined) return <Spinner label="Opening chat…" />;
  if (conv === null) {
    return <div className="px-3 py-6 space-y-3">
      <button onClick={() => go({ name: 'messages' })} className={`${btn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" />Messages</button>
      <EmptyState icon={MessageCircle} title="This chat isn’t available" text="It may have been removed." />
    </div>;
  }

  const lastMine = [...msgs].reverse().find((m) => m.sender_id === uid);
  const seen = !!lastMine && !!s?.theirRead && s.theirRead >= lastMine.created_at;
  const cantReply = !other || !!block;

  return (
    <div className="flex flex-col min-h-[calc(100vh-140px)]">
      {/* header */}
      <div className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2.5 bg-[#0F1417]/95 backdrop-blur border-b border-white/10">
        <button onClick={() => go({ name: 'messages' })} aria-label="Back to messages" className={btn.icon}><ArrowLeft className="w-4 h-4" /></button>
        <button onClick={() => other && go({ name: 'profile', id: other.id })} disabled={!other} className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer disabled:cursor-default">
          <Avatar src={other?.avatar_url} name={other?.display_name || 'Member'} size={38} square={roleMeta(other?.role).square} />
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[14px] font-bold text-white truncate">{other?.display_name || 'MINAW member'}{other?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#53E6D4]" />}</span>
            {other && <span className="block text-[10px] text-[#8E9AA7] truncate">@{other.username} · {roleMeta(other.role).label}</span>}
          </span>
        </button>
        {other && <button onClick={() => setReport({ type: 'profile', id: other.id, label: 'this account' })} aria-label="Report this account" className={btn.icon}><Flag className="w-4 h-4" /></button>}
        <button onClick={clearChat} aria-label="Delete chat" className={btn.icon}><Trash2 className="w-4 h-4" /></button>
        {other && <BlockMenu targetId={other.id} name={other.display_name} onChange={reloadBlock} />}
      </div>

      {/* messages */}
      <div className="flex-1 px-3 pt-3 pb-2 space-y-1.5">
        {hasOlder && <div className="text-center pb-2"><button onClick={loadOlder} className={`${btn.ghost} !py-1.5 !text-xs`}>Load earlier messages</button></div>}
        {msgs.length === 0 && (
          <p className="py-10 text-center text-[12px] text-[#8E9AA7] leading-relaxed">Say hi to {other?.display_name || 'them'}!<br />Keep deals safe: meet in public places and don’t send payment before you see the item.</p>
        )}
        {msgs.map((m, i) => {
          const mine = m.sender_id === uid;
          const prev = msgs[i - 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const open = picked === m.id;
          return (
            <React.Fragment key={m.id}>
              {newDay && <p className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-[#8E9AA7]">{dayLabel(m.created_at)}</p>}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] space-y-1 ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div onClick={() => setPicked(open ? null : m.id)} role="button" tabIndex={0} aria-label="Message options"
                    className={`px-3 py-2 rounded-2xl text-[13.5px] leading-relaxed break-words whitespace-pre-wrap cursor-pointer space-y-1.5 ${mine ? 'bg-[#6045F4] text-white rounded-br-md' : 'bg-[#1D232A] border border-white/[0.08] text-[#EBEBED] rounded-bl-md'} ${m.is_hidden ? 'opacity-50' : ''}`}>
                    {m.listings && <ListingChip l={m.listings} small onClick={() => go({ name: 'deals' })} />}
                    {m.image_path && (urls[m.image_path]
                      ? <span onClick={(e) => e.stopPropagation()}><ZoomImg src={urls[m.image_path]} alt="Photo" className="max-h-64 w-auto rounded-xl object-cover bg-black/20" /></span>
                      : <span className="flex w-40 h-28 rounded-xl bg-black/20 items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></span>)}
                    {m.body && <p>{m.body}</p>}
                    {m.is_hidden && <p className="text-[11px] italic">Removed by moderators</p>}
                  </div>
                  <span className="px-1 text-[9px] text-[#8E9AA7]">{clock(m.created_at)}{mine && m.id === lastMine?.id && (seen ? ' · Seen' : ' · Sent')}</span>
                  {open && (
                    <div className="flex gap-1.5">
                      {m.body && <button onClick={() => copyMsg(m)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#161B20] border border-white/15 text-[11px] font-bold text-[#C9D1D9] cursor-pointer"><Copy className="w-3 h-3" />Copy</button>}
                      {mine
                        ? <button onClick={() => unsend(m)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#161B20] border border-white/15 text-[11px] font-bold text-[#FF8A9C] cursor-pointer"><Undo2 className="w-3 h-3" />Unsend</button>
                        : <button onClick={() => { setPicked(null); setReport({ type: 'message', id: m.id, label: 'this message' }); }} className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#161B20] border border-white/15 text-[11px] font-bold text-[#FF8A9C] cursor-pointer"><Flag className="w-3 h-3" />Report</button>}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={bottom} />
      </div>

      {/* composer — pinned above the bottom menu (and the music player, if it's open) */}
      <div className={`sticky z-30 px-3 pt-2 pb-2 bg-[#0F1417]/95 backdrop-blur border-t border-white/10 space-y-2 ${current ? 'bottom-[150px]' : 'bottom-[84px]'}`}>
        {note && <p role="status" className="text-center text-[11px] text-[#53E6D4]">{note}</p>}
        {block && <BlockedBanner block={block} name={other?.display_name || 'this account'} onChange={reloadBlock} />}
        {!other && <p className="text-[12px] text-[#8E9AA7] text-center">You can’t reply to this conversation.</p>}
        <ErrorNote text={err} />
        {about && (
          <div className="relative">
            <ListingChip l={about} />
            <button onClick={() => { setAbout(null); go({ name: 'chat', id }); }} aria-label="Remove deal from message" className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {photo && (
          <div className="relative inline-block">
            <img src={photo.preview} alt="Photo to send" className="h-24 rounded-xl object-cover border border-white/15" />
            <button onClick={() => setPhoto(null)} aria-label="Remove photo" className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/80 text-white flex items-center justify-center cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {!cantReply && (
          <div className="flex items-end gap-1.5">
            <FilePick accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onPick={(f) => setPhoto({ file: f, preview: URL.createObjectURL(f) })} className={`${btn.icon} !rounded-full`}>
              <ImagePlus className="w-4 h-4" /><span className="sr-only">Add a photo</span>
            </FilePick>
            <textarea
              ref={ta}
              rows={1}
              aria-label="Message"
              maxLength={2000}
              value={text}
              onChange={(e) => { setText(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 128)}px`; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !/Android|iPhone|iPad/i.test(navigator.userAgent)) { e.preventDefault(); send(); } }}
              placeholder={about ? 'Ask about this deal…' : 'Write a message…'}
              className="flex-1 min-w-0 max-h-32 px-3.5 py-2.5 rounded-2xl bg-[#161B20] border border-white/15 text-[14px] text-white placeholder:text-[#8E9AA7] outline-none focus:border-[#53E6D4] resize-none"
            />
            <button onClick={send} disabled={busy || (!text.trim() && !photo)} aria-label="Send" className={`${btn.primary} !rounded-full !w-11 !h-11 !p-0 flex-shrink-0`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
      {report && <ReportModal targetType={report.type as any} targetId={report.id} label={report.label} onClose={() => setReport(null)} onLogin={() => go({ name: 'auth' })} />}
    </div>
  );
};

/** Small "Message" button for profiles / band pages. */
export const MessageButton: React.FC<{ to: string; label?: string; className?: string; listing?: string }> = ({ to, label = 'Message', className, listing }) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const go = useNav();
  if (user?.id === to) return null;
  const open = async () => {
    if (!user) return go({ name: 'auth', mode: 'login' });
    setBusy(true);
    const { data, error } = await supabase.rpc('start_conversation', { p_other: to });
    setBusy(false);
    if (error || !data) return alert(errorMessage(error));
    go({ name: 'chat', id: data as string, listing });
  };
  return (
    <button onClick={open} disabled={busy} aria-label={label || 'Send a message'} title="Send a message" className={className ?? `${btn.ghost} !py-2 !text-xs`}>
      {busy ? <Loader2 className={label ? 'w-3.5 h-3.5 animate-spin' : 'w-4 h-4 animate-spin'} /> : <MessageCircle className={label ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}{label}
    </button>
  );
};

