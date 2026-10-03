import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AtSign, Bell, CalendarCheck, CheckCheck, Copy, Heart, MessageCircle, Music, Star, Tag, Trash2, UserPlus, Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { roleMeta, timeAgo } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav, type Route } from '../nav';
import { Avatar, Spinner } from './ui';

type NType =
  | 'comment' | 'mention_post' | 'mention_comment' | 'reaction' | 'follow' | 'band_follow'
  | 'review_pending' | 'review_approved' | 'rsvp' | 'playlist_like' | 'playlist_copy' | 'venue_tag';

interface Notif {
  id: string; type: NType; actor_id: string | null; post_id: string | null; band_id: string | null;
  gig_id: string | null; playlist_id: string | null; snippet: string | null; read_at: string | null; created_at: string;
  actor?: { id: string; display_name: string; avatar_url: string | null; role: string } | null;
}

const META: Record<NType, { Icon: React.ElementType; color: string; text: (n: Notif) => string; quote?: boolean }> = {
  comment:         { Icon: MessageCircle, color: '#53E6D4', text: () => 'commented on your post', quote: true },
  mention_post:    { Icon: AtSign, color: '#B7A8FF', text: () => 'tagged you in a post', quote: true },
  mention_comment: { Icon: AtSign, color: '#B7A8FF', text: () => 'tagged you in a comment', quote: true },
  reaction:        { Icon: Zap, color: '#E0663A', text: () => 'reacted to your post', quote: true },
  follow:          { Icon: UserPlus, color: '#53E6D4', text: () => 'started following you' },
  band_follow:     { Icon: Music, color: '#B7A8FF', text: (n) => `followed your band page${n.snippet ? ` “${n.snippet}”` : ''}` },
  review_pending:  { Icon: Star, color: '#FFB800', text: () => 'left a testimonial — tap to approve it', quote: true },
  review_approved: { Icon: Star, color: '#FFB800', text: () => 'approved your testimonial' },
  rsvp:            { Icon: CalendarCheck, color: '#53E6D4', text: (n) => `is going to your gig${n.snippet ? ` “${n.snippet}”` : ''}` },
  playlist_like:   { Icon: Heart, color: '#FF6B9A', text: (n) => `liked your playlist${n.snippet ? ` “${n.snippet}”` : ''}` },
  playlist_copy:   { Icon: Copy, color: '#53E6D4', text: (n) => `saved a copy of your playlist${n.snippet ? ` “${n.snippet}”` : ''}` },
  venue_tag:       { Icon: Tag, color: '#FFC34D', text: () => 'tagged your venue in a post', quote: true },
};

/** Where tapping a notification takes you. */
function routeFor(n: Notif, myId: string): Route {
  switch (n.type) {
    case 'comment': case 'mention_post': case 'mention_comment': case 'reaction': case 'venue_tag':
      return n.post_id ? { name: 'post', id: n.post_id } : { name: 'connect' };
    case 'band_follow': case 'rsvp':
      return n.band_id ? { name: 'band', id: n.band_id } : { name: 'profile' };
    case 'review_pending':
      return n.band_id ? { name: 'band', id: n.band_id } : { name: 'profile', id: myId };
    case 'review_approved':
      return n.band_id ? { name: 'band', id: n.band_id } : n.actor_id ? { name: 'profile', id: n.actor_id } : { name: 'profile' };
    case 'playlist_like': case 'playlist_copy':
      return n.playlist_id ? { name: 'playlist', id: n.playlist_id } : { name: 'profile' };
    default:
      return n.actor_id ? { name: 'profile', id: n.actor_id } : { name: 'home' };
  }
}

/** Bell with an unread badge; opens a panel with your latest notifications. Updates live. */
export const NotificationBell: React.FC = () => {
  const go = useNav();
  const { user } = useAuth();
  const uid = user?.id;
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Notif[] | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const countUnread = useCallback(async () => {
    if (!uid) return;
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null);
    setUnread(count || 0);
  }, [uid]);

  const loadList = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(id, display_name, avatar_url, role)')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(40);
    const rows = (data as Notif[]) || [];
    setList(rows);
    const fresh = rows.filter((n) => !n.read_at).map((n) => n.id);
    setNewIds(new Set(fresh));
    if (fresh.length) {
      // only mark the ones we actually showed (a new one may have arrived meanwhile)
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', fresh);
      countUnread();
    }
  }, [uid, countUnread]);

  // badge: on login, every minute, when the tab comes back, and instantly via realtime
  useEffect(() => {
    if (!uid) return;
    countUnread();
    const t = setInterval(countUnread, 60_000);
    const onFocus = () => countUnread();
    window.addEventListener('focus', onFocus);
    const ch = supabase.channel(`notifications-${uid}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        setUnread((u) => u + 1);
      })
      .subscribe();
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); supabase.removeChannel(ch); };
  }, [uid, countUnread]);

  useEffect(() => { if (open) loadList(); }, [open, loadList]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);

  const clearAll = async () => {
    if (!uid || !confirm('Clear all notifications?')) return;
    await supabase.from('notifications').delete().eq('user_id', uid);
    setList([]); setUnread(0);
  };

  if (!uid) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative w-[38px] h-[38px] rounded-full bg-[#161B20] border border-white/15 flex items-center justify-center text-[#EBEBED] hover:text-white cursor-pointer"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF4D6A] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#0F1417]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[64px] sm:top-12 sm:w-[360px] z-50 rounded-2xl bg-[#161B20] border border-white/15 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.08]">
            <p className="font-heading font-bold text-[15px] text-white">Notifications</p>
            {list && list.length > 0 && (
              <button onClick={clearAll} className="flex items-center gap-1 text-[11px] font-bold text-[#8E9AA7] hover:text-white cursor-pointer"><Trash2 className="w-3.5 h-3.5" />Clear all</button>
            )}
          </div>
          <div className="max-h-[65vh] overflow-y-auto">
            {list === null ? <Spinner /> : list.length === 0 ? (
              <div className="px-5 py-10 text-center space-y-1.5">
                <CheckCheck className="w-7 h-7 mx-auto text-[#53E6D4]" />
                <p className="text-[13px] font-bold text-white">You’re all caught up</p>
                <p className="text-[11px] text-[#8E9AA7]">Comments, tags, follows, likes and testimonials will show up here.</p>
              </div>
            ) : list.map((n) => {
              const m = META[n.type] ?? META.follow;
              const name = n.actor?.display_name || 'Someone';
              return (
                <button
                  key={n.id}
                  onClick={() => { setOpen(false); go(routeFor(n, uid)); }}
                  className={`w-full flex gap-3 px-3.5 py-3 text-left border-b border-white/[0.05] cursor-pointer hover:bg-white/5 ${newIds.has(n.id) ? 'bg-[#6045F4]/10' : ''}`}
                >
                  <span className="relative flex-shrink-0">
                    <Avatar src={n.actor?.avatar_url} name={name} size={40} square={roleMeta(n.actor?.role).square} />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#161B20]" style={{ background: m.color }}>
                      <m.Icon className="w-2.5 h-2.5 text-[#0F1417]" strokeWidth={3} />
                    </span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] leading-snug text-[#EBEBED]"><strong className="text-white">{name}</strong> {m.text(n)}</span>
                    {m.quote && n.snippet && <span className="block mt-0.5 text-[11px] text-[#8E9AA7] truncate">“{n.snippet}”</span>}
                    <span className="block mt-0.5 text-[10px] text-[#8E9AA7]">{timeAgo(n.created_at)}</span>
                  </span>
                  {newIds.has(n.id) && <span className="w-2 h-2 mt-1.5 rounded-full bg-[#53E6D4] flex-shrink-0" aria-label="New" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
