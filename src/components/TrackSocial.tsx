import React, { useCallback, useEffect, useState } from 'react';
import { Check, Flag, Heart, MessageCircle, Send, Share2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, roleMeta, timeAgo, type Track } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { MentionInput, MentionText } from './Mentions';
import { ReportModal } from './ReportModal';
import { useShare } from './Share';
import { Avatar, ErrorNote, btn, inputCls } from './ui';

interface TComment {
  id: string; track_id: string; author_id: string; content: string; created_at: string; edited_at: string | null;
  profiles?: { id: string; display_name: string; avatar_url: string | null; role: string } | null;
}

/** Like · Comment · Share bar under a song, with its comment thread. */
export const TrackSocial: React.FC<{ track: Track; bandId: string }> = ({ track, bandId }) => {
  const go = useNav();
  const { user } = useAuth();
  const [likes, setLikes] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    const [{ data: l }, { count: c }] = await Promise.all([
      supabase.from('track_likes').select('user_id').eq('track_id', track.id),
      supabase.from('track_comments').select('id', { count: 'exact', head: true }).eq('track_id', track.id),
    ]);
    setLikes(((l as any[]) || []).map((x) => x.user_id));
    setCount(c || 0);
  }, [track.id]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const liked = !!user && likes.includes(user.id);
  const toggleLike = async () => {
    if (!user) return go({ name: 'auth' });
    setErr(null);
    const before = likes;
    setLikes(liked ? likes.filter((x) => x !== user.id) : [...likes, user.id]);  // instant feedback
    const { error } = liked
      ? await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id)
      : await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
    if (error) { setLikes(before); setErr(errorMessage(error)); }
  };

  const { share: openShare, sheet } = useShare();
  const share = () => openShare({
    title: track.title,
    text: `Listen to “${track.title}”${track.bands?.name ? ` by ${track.bands.name}` : ''} on MINAW DVO`,
    url: `${window.location.origin}/#/band/${bandId}/song/${track.id}`,
  });

  const item = 'flex-1 h-8 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-bold cursor-pointer hover:bg-white/5';
  return (
    <div className="space-y-2">
      <div className="flex gap-1 border-t border-white/[0.06] pt-1.5">
        <button onClick={toggleLike} aria-pressed={liked} aria-label={liked ? 'Unlike song' : 'Like song'} className={item} style={{ color: liked ? '#FF6B9A' : '#8E9AA7' }}>
          <Heart className={`w-4 h-4 ${liked ? 'fill-[#FF6B9A]' : ''}`} />{likes.length > 0 ? likes.length : 'Like'}
        </button>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className={`${item} ${open ? 'text-white' : 'text-[#8E9AA7]'}`}>
          <MessageCircle className="w-4 h-4" />{count > 0 ? count : 'Comment'}
        </button>
        <button onClick={share} className={`${item} text-[#8E9AA7]`}><Share2 className="w-4 h-4" />Share</button>
      </div>
      {sheet}
      <ErrorNote text={err} />
      {open && <TrackComments trackId={track.id} onCount={setCount} />}
    </div>
  );
};

const TrackComments: React.FC<{ trackId: string; onCount: (n: number) => void }> = ({ trackId, onCount }) => {
  const go = useNav();
  const { user, termsAccepted } = useAuth();
  const [list, setList] = useState<TComment[]>([]);
  const [text, setText] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('track_comments')
      .select('*, profiles!track_comments_author_id_fkey(id, display_name, avatar_url, role)')
      .eq('track_id', trackId).order('created_at');
    const rows = (data as TComment[]) || [];
    setList(rows); onCount(rows.length);
  }, [trackId, onCount]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!user) return go({ name: 'auth' });
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('track_comments').insert({ track_id: trackId, author_id: user.id, content: text.trim() });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setText(''); load();
  };
  const saveEdit = async (c: TComment) => {
    if (!editText.trim()) return setErr('A comment can’t be empty.');
    const { error } = await supabase.from('track_comments').update({ content: editText.trim() }).eq('id', c.id);
    if (error) return setErr(errorMessage(error));
    setEditId(null); load();
  };
  const remove = async (c: TComment) => {
    if (!confirm('Delete this comment?')) return;
    const { error } = await supabase.from('track_comments').delete().eq('id', c.id);
    if (error) return setErr(errorMessage(error));
    load();
  };

  return (
    <div className="space-y-2 pl-1">
      {list.length === 0 && <p className="text-[11px] text-[#8E9AA7]">No comments yet. Say something about this song!</p>}
      {list.map((c) => (
        <div key={c.id} className="flex gap-2">
          <button onClick={() => go({ name: 'profile', id: c.author_id })} aria-label={`View ${c.profiles?.display_name || 'member'}’s profile`} className="cursor-pointer self-start">
            <Avatar src={c.profiles?.avatar_url} name={c.profiles?.display_name} size={26} square={roleMeta(c.profiles?.role).square} />
          </button>
          <div className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-[#161B20] border border-white/[0.08]">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => go({ name: 'profile', id: c.author_id })} className="text-[11px] font-bold text-white truncate cursor-pointer hover:underline">{c.profiles?.display_name || 'Member'}</button>
              <span className="text-[9px] text-[#8E9AA7] flex-shrink-0">{timeAgo(c.created_at)}{c.edited_at && ' · edited'}</span>
            </div>
            {editId === c.id ? (
              <div className="flex gap-1.5 pt-1">
                <MentionInput single ariaLabel="Edit your comment" value={editText} onChange={setEditText} onEnter={() => saveEdit(c)} className={`${inputCls} !min-h-[34px] !text-xs`} />
                <button onClick={() => saveEdit(c)} aria-label="Save comment" className={`${btn.mint} !px-2.5 !py-1`}><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditId(null)} aria-label="Cancel editing" className={btn.icon}><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : <p className="text-xs text-[#EBEBED] leading-relaxed break-words"><MentionText text={c.content} /></p>}
            <div className="flex justify-end gap-3 pt-0.5">
              {c.author_id === user?.id ? (
                <>
                  {editId !== c.id && <button onClick={() => { setEditId(c.id); setEditText(c.content); setErr(null); }} className="text-[10px] text-[#8E9AA7] underline cursor-pointer">Edit</button>}
                  <button onClick={() => remove(c)} className="text-[10px] text-[#8E9AA7] underline cursor-pointer">Delete</button>
                </>
              ) : user && <button onClick={() => setReport(c.id)} className="text-[10px] text-[#8E9AA7] flex items-center gap-1 cursor-pointer"><Flag className="w-3 h-3" />Report</button>}
            </div>
          </div>
        </div>
      ))}
      {user && termsAccepted ? (
        <div className="flex gap-2">
          <MentionInput single ariaLabel="Comment on this song" value={text} onChange={setText} onEnter={send} placeholder="Comment on this song… type @ to tag" className={`${inputCls} !min-h-[38px] !rounded-full !text-xs`} />
          <button onClick={send} disabled={busy || !text.trim()} aria-label="Send comment" className={`${btn.primary} !rounded-full !px-3`}><Send className="w-4 h-4" /></button>
        </div>
      ) : (
        <button onClick={() => go({ name: user ? 'onboarding' : 'auth' })} className="text-xs text-[#53E6D4] underline cursor-pointer">{user ? 'Accept the Terms to comment' : 'Log in to comment'}</button>
      )}
      <ErrorNote text={err} />
      {report && <ReportModal targetType={'track_comment' as any} targetId={report} label="this comment" onClose={() => setReport(null)} onLogin={() => go({ name: 'auth' })} />}
    </div>
  );
};
