import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Building2, Camera, Check, Search, Flag, Flame, Heart, ImagePlus, ListMusic, LogIn, MapPin, MessageCircle, Pencil, Play, Send, Trash2, X, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkFile, errorMessage, removeImageByUrl, timeAgo, uploadImage, type Comment, type Post, roleMeta } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ZoomImg } from '../components/Zoom';
import { MentionInput, MentionText } from '../components/Mentions';
import { ReportModal } from '../components/ReportModal';
import { Avatar, EmptyState, ErrorNote, FilePick, Spinner, btn, inputCls } from '../components/ui';

type Reaction = 'rock' | 'fire' | 'orchid';
const REACTIONS: { key: Reaction; label: string; Icon: React.ElementType; color: string }[] = [
  { key: 'rock', label: 'Rock', Icon: Zap, color: '#7A62FF' },
  { key: 'fire', label: 'Fire', Icon: Flame, color: '#E0663A' },
  { key: 'orchid', label: 'Love', Icon: Heart, color: '#D6457F' },
];

const POST_COLS: string = '*, profiles!posts_author_id_fkey(id, display_name, username, avatar_url, role, is_verified), '
  + 'venue:profiles!posts_venue_id_fkey(id, display_name, username), '
  + 'playlists(id, name, owner_id, owner:profiles!playlists_owner_id_fkey(id, display_name), playlist_tracks(track_id))';

/** Shared playlist card inside a post. */
const PlaylistEmbed: React.FC<{ pl: any }> = ({ pl }) => {
  const go = useNav();
  if (!pl) return <p className="text-[11px] italic text-[#8E9AA7] px-3 py-2 rounded-xl bg-[#161B20] border border-white/[0.08]">This playlist is no longer available.</p>;
  const n = (pl.playlist_tracks || []).length;
  return (
    <button onClick={() => go({ name: 'playlist', id: pl.id })} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-[#2A2160] to-[#161B20] border border-[#6045F4]/40 text-left cursor-pointer hover:border-[#6045F4]">
      <span className="w-14 h-14 rounded-xl bg-[#53E6D4]/15 text-[#53E6D4] flex items-center justify-center flex-shrink-0"><ListMusic className="w-6 h-6" /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[10px] font-bold tracking-wider text-[#B7A8FF]">SHARED PLAYLIST</span>
        <span className="block text-sm font-bold text-white truncate">{pl.name}</span>
        <span className="block text-[11px] text-[#8E9AA7]">by {pl.owner?.display_name || 'a member'} • {n} song{n === 1 ? '' : 's'}</span>
      </span>
      <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#6045F4] text-white text-xs font-bold flex-shrink-0"><Play className="w-3.5 h-3.5 fill-white" />Open</span>
    </button>
  );
};

/** Connect feed. Pass authorId to show only one person’s posts (used on profiles), or taggedVenue for posts that tag a venue. */
export const ConnectFeed: React.FC<{ authorId?: string; showComposer?: boolean; taggedVenue?: { id: string; username: string }; postId?: string }> = ({ authorId, showComposer = true, taggedVenue, postId }) => {
  const go = useNav();
  const { user, profile, termsAccepted } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reacts, setReacts] = useState<{ post_id: string; user_id: string; reaction: Reaction }[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [report, setReport] = useState<{ type: 'post' | 'comment'; id: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editErr, setEditErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from('posts').select(POST_COLS).order('created_at', { ascending: false }).limit(50);
    if (authorId) q = q.eq('author_id', authorId);
    if (postId) q = q.eq('id', postId);
    if (taggedVenue) q = q.or(`venue_id.eq.${taggedVenue.id},content.ilike.%@${taggedVenue.username.replace(/_/g, '\\_')}%`).neq('author_id', taggedVenue.id);
    const { data, error } = await q;
    setLoadErr(error ? 'Couldn’t load posts: ' + error.message : null);
    let list = (data as unknown as Post[]) || [];
    if (taggedVenue) {
      // exact @username only (not @username_bar), or the post's venue tag
      const re = new RegExp(`(^|[^a-z0-9_@])@${taggedVenue.username}(?![a-z0-9_])`, 'i');
      list = list.filter((p) => p.venue_id === taggedVenue.id || re.test(p.content));
    }
    setPosts(list);
    const ids = list.map((p) => p.id);
    if (ids.length) {
      const [{ data: r }, { data: c }] = await Promise.all([
        supabase.from('post_reactions').select('post_id, user_id, reaction').in('post_id', ids),
        supabase.from('comments').select('post_id').in('post_id', ids),
      ]);
      setReacts((r as any) || []);
      const cc: Record<string, number> = {};
      ((c as any[]) || []).forEach((x) => { cc[x.post_id] = (cc[x.post_id] || 0) + 1; });
      setCommentCounts(cc);
    } else { setReacts([]); setCommentCounts({}); }
    setLoading(false);
  }, [authorId, taggedVenue?.id, taggedVenue?.username, postId]);

  useEffect(() => { load(); }, [load]);

  const react = async (postId: string, r: Reaction) => {
    if (!user) return go({ name: 'auth' });
    const mine = reacts.some((x) => x.post_id === postId && x.user_id === user.id && x.reaction === r);
    const before = reacts;
    let error;
    if (mine) {
      setReacts(reacts.filter((x) => !(x.post_id === postId && x.user_id === user.id && x.reaction === r)));
      ({ error } = await supabase.from('post_reactions').delete().eq('post_id', postId).eq('user_id', user.id).eq('reaction', r));
    } else {
      setReacts([...reacts, { post_id: postId, user_id: user.id, reaction: r }]);
      ({ error } = await supabase.from('post_reactions').insert({ post_id: postId, user_id: user.id, reaction: r }));
    }
    if (error) { setReacts(before); alert(errorMessage(error)); } // undo the instant UI change
  };

  const saveEdit = async (p: Post) => {
    if (!editText.trim()) return setEditErr('A post can’t be empty.');
    setEditErr(null);
    const { error } = await supabase.from('posts').update({ content: editText.trim() }).eq('id', p.id);
    if (error) return setEditErr(errorMessage(error));
    setEditId(null);
    load();
  };

  const remove = async (p: Post) => {
    if (!confirm('Delete this post?')) return;
    const { error } = await supabase.from('posts').delete().eq('id', p.id);
    if (error) return alert(errorMessage(error));
    await removeImageByUrl(p.image_url);
    load();
  };

  return (
    <div className="space-y-4">
      {showComposer && (
        !user ? (
          <div className="rounded-2xl p-4 bg-[#1B1D33] border border-[#6045F4]/40 space-y-3">
            <p className="flex items-center gap-2 font-heading font-bold text-white"><span className="w-2 h-2 rounded-full bg-[#53E6D4]" />Davao Soundstage Community</p>
            <p className="text-[13px] text-[#8E9AA7] leading-relaxed">Log in or register to post gig updates, share concert photos and connect with local bands and fans.</p>
            <button onClick={() => go({ name: 'auth' })} className={`${btn.primary} w-full`}><LogIn className="w-4 h-4" />Log In or Register</button>
          </div>
        ) : !termsAccepted ? (
          <div className="rounded-2xl p-4 bg-[#1B1D33] border border-[#6045F4]/40 space-y-2">
            <p className="text-[13px] text-[#EBEBED]">Accept the Terms of Agreement to start posting.</p>
            <button onClick={() => go({ name: 'onboarding' })} className={btn.primary}>Review Terms</button>
          </div>
        ) : (
          <Composer onPosted={load} />
        )
      )}

      <ErrorNote text={loadErr} />
      {loading ? <Spinner /> : posts.length === 0 ? (
        <EmptyState icon={MessageCircle} title={postId ? 'This post isn’t available' : taggedVenue ? 'No tagged posts yet' : 'No posts yet'} text={postId ? 'It may have been deleted or removed by moderators.' : taggedVenue ? 'Posts that tag this venue will show up here.' : authorId ? 'Nothing posted here yet.' : 'Be the first to share a gig update or concert photo with the Davao scene.'} />
      ) : posts.map((p) => {
        const mineAll = reacts.filter((x) => x.post_id === p.id);
        const total = mineAll.length;
        const isMine = p.author_id === user?.id;
        return (
          <article key={p.id} className="rounded-2xl bg-[#1D232A] border border-white/[0.08] p-3.5 space-y-3">
            <div className="flex items-center gap-2.5">
              <button onClick={() => go({ name: 'profile', id: p.author_id })} className="cursor-pointer"><Avatar src={p.profiles?.avatar_url} name={p.profiles?.display_name} size={40} square={roleMeta(p.profiles?.role).square} /></button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => go({ name: 'profile', id: p.author_id })} className="text-[13px] font-bold text-white truncate cursor-pointer">{p.profiles?.display_name || 'Member'}</button>
                  {p.profiles?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#53E6D4]" />}
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${roleMeta(p.profiles?.role).chip}`}>{roleMeta(p.profiles?.role).label}</span>
                </div>
                <p className="text-[11px] text-[#8E9AA7]">{timeAgo(p.created_at)}{p.edited_at && ' · edited'}{p.district_tag && <> • <span className="text-[#53E6D4]">{p.district_tag}</span></>}</p>
              </div>
              {isMine && editId !== p.id && (
                <>
                  <button onClick={() => { setEditId(p.id); setEditText(p.content); setEditErr(null); }} aria-label="Edit post" title="Edit" className={btn.icon}><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(p)} aria-label="Delete post" title="Delete" className={btn.icon}><Trash2 className="w-4 h-4" /></button>
                </>
              )}
            </div>
            {editId === p.id ? (
              <div className="space-y-2">
                <MentionInput ariaLabel="Edit your post" rows={3} value={editText} onChange={setEditText} className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/15 text-sm text-[#EBEBED] outline-none resize-none" />
                <ErrorNote text={editErr} />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditId(null)} className={`${btn.ghost} !py-1.5 !px-3 !text-xs`}>Cancel</button>
                  <button onClick={() => saveEdit(p)} className={`${btn.mint} !py-1.5 !px-3 !text-xs`}><Check className="w-3.5 h-3.5" />Save</button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-[#EBEBED]"><MentionText text={p.content} /></p>
            )}
            {(p as any).playlist_id && <PlaylistEmbed pl={(p as any).playlists} />}
            {p.venue ? (
              <button onClick={() => go({ name: 'profile', id: p.venue!.id })} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFB800]/10 border border-[#FFB800]/40 text-[10px] font-bold text-[#FFC34D] cursor-pointer hover:bg-[#FFB800]/20">
                <Building2 className="w-3 h-3" />{p.venue.display_name}
              </button>
            ) : p.venue_tag && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-bold"><MapPin className="w-3 h-3" />{p.venue_tag}</span>}
            {p.image_url && <ZoomImg src={p.image_url} alt="Post photo" className="w-full max-h-[420px] object-cover rounded-xl bg-[#252D37]" />}
            <div className="flex items-center justify-between text-[11px] text-[#8E9AA7]">
              <span>{total} reaction{total === 1 ? '' : 's'}</span>
              <span>{commentCounts[p.id] || 0} comment{commentCounts[p.id] === 1 ? '' : 's'}</span>
            </div>
            <div className="flex gap-1 pt-1.5 border-t border-white/[0.08]">
              {REACTIONS.map(({ key, label, Icon, color }) => {
                const n = mineAll.filter((x) => x.reaction === key).length;
                const on = !!user && mineAll.some((x) => x.reaction === key && x.user_id === user.id);
                return (
                  <button key={key} onClick={() => react(p.id, key)} aria-pressed={on} className="flex-1 h-9 rounded-lg flex items-center justify-center gap-1 text-xs font-bold cursor-pointer hover:bg-white/5" style={{ color: on ? color : '#8E9AA7' }}>
                    <Icon className="w-4 h-4" />{n > 0 ? n : label}
                  </button>
                );
              })}
              {!isMine && (
                <button onClick={() => setReport({ type: 'post', id: p.id })} aria-label="Report this post" className="flex-1 h-9 rounded-lg flex items-center justify-center gap-1 text-xs font-bold text-[#8E9AA7] hover:text-[#FF8A7A] cursor-pointer">
                  <Flag className="w-4 h-4" />Report
                </button>
              )}
            </div>
            <Comments postId={p.id} startOpen={!!postId} onReport={(id) => setReport({ type: 'comment', id })} onChange={load} />
          </article>
        );
      })}

      {report && (
        <ReportModal targetType={report.type} targetId={report.id} label={report.type === 'post' ? 'this post' : 'this comment'} onClose={() => setReport(null)} onLogin={() => go({ name: 'auth' })} />
      )}
    </div>
  );
};

export const Composer: React.FC<{ onPosted: () => void; playlist?: { id: string; name: string; ownerName?: string } }> = ({ onPosted, playlist }) => {
  const { user, profile } = useAuth();
  const [text, setText] = useState(playlist ? 'Check out this playlist: ' : '');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const post = async () => {
    if (!text.trim() || !user) return;
    setBusy(true); setErr(null);
    try {
      const image_url = image ? await uploadImage('post-images', user.id, image) : null;
      const { error } = await supabase.from('posts').insert({
        author_id: user.id, content: text.trim(), image_url, district_tag: profile?.district || null,
        playlist_id: playlist?.id ?? null,
      });
      if (error) { await removeImageByUrl(image_url); throw error; } // don't leave the photo behind
      setText(''); setImage(null); setPreview(null);
      onPosted();
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl bg-[#1D232A] border border-white/[0.08] p-3.5 space-y-2.5">
      <div className="flex gap-2.5">
        <Avatar src={profile?.avatar_url} name={profile?.display_name} size={38} square={roleMeta(profile?.role).square} />
        <MentionInput ariaLabel="Write a post" rows={3} value={text} onChange={setText} placeholder="Share a gig update or a shoutout… type @ to tag a fan, artist or venue" className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/15 text-sm text-[#EBEBED] outline-none resize-none" />
      </div>
      {playlist && (
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#2A2160]/60 border border-[#6045F4]/40">
          <ListMusic className="w-5 h-5 text-[#53E6D4] flex-shrink-0" />
          <span className="flex-1 min-w-0 text-xs"><span className="block font-bold text-white truncate">{playlist.name}</span>{playlist.ownerName && <span className="text-[#8E9AA7]">by {playlist.ownerName}</span>}</span>
          <span className="text-[10px] font-bold text-[#B7A8FF]">ATTACHED</span>
        </div>
      )}
      {preview && (
        <div className="relative">
          <img src={preview} alt="Selected" className="w-full max-h-64 object-cover rounded-xl" />
          <button onClick={() => { setImage(null); setPreview(null); }} aria-label="Remove photo" className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/70 text-white flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}
      <ErrorNote text={err} />
      <div className="flex items-center gap-2">
        <FilePick accept="image/jpeg,image/png,image/webp,image/gif" onPick={(f) => {
          const bad = checkFile(f, 'image'); if (bad) return setErr(bad);
          setErr(null); setImage(f); setPreview(URL.createObjectURL(f));
        }} className={`${btn.ghost} !py-2 !text-xs`}><ImagePlus className="w-4 h-4 text-[#53E6D4]" />Photo</FilePick>
        <span className="flex-1 text-[10px] text-[#8E9AA7]">No nudity, violence or political posts.</span>
        <button onClick={post} disabled={busy || !text.trim()} className={`${btn.primary} !py-2`}><Send className="w-4 h-4" />{busy ? 'Posting…' : 'Post'}</button>
      </div>
    </div>
  );
};

const Comments: React.FC<{ postId: string; startOpen?: boolean; onReport: (id: string) => void; onChange: () => void }> = ({ postId, startOpen = false, onReport, onChange }) => {
  const go = useNav();
  const { user, termsAccepted } = useAuth();
  const [open, setOpen] = useState(startOpen);
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('comments').select('*, profiles!comments_author_id_fkey(id, display_name, avatar_url, role)').eq('post_id', postId).order('created_at');
    setList((data as Comment[]) || []);
  }, [postId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const send = async () => {
    if (!user) return go({ name: 'auth' });
    if (!text.trim()) return;
    setErr(null);
    const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: user.id, content: text.trim() });
    if (error) return setErr(errorMessage(error));
    setText(''); load(); onChange();
  };
  const saveEdit = async (c: Comment) => {
    if (!editText.trim()) return setErr('A comment can’t be empty.');
    setErr(null);
    const { error } = await supabase.from('comments').update({ content: editText.trim() }).eq('id', c.id);
    if (error) return setErr(errorMessage(error));
    setEditId(null); load();
  };

  if (!open) return <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs font-bold text-[#8E9AA7] cursor-pointer"><MessageCircle className="w-4 h-4" />View &amp; write comments</button>;

  return (
    <div className="space-y-2">
      {list.map((c) => (
        <div key={c.id} className="flex gap-2">
          <button onClick={() => go({ name: 'profile', id: c.author_id })} aria-label={`View ${c.profiles?.display_name || 'member'}’s profile`} className="cursor-pointer self-start"><Avatar src={c.profiles?.avatar_url} name={c.profiles?.display_name} size={28} square={roleMeta(c.profiles?.role).square} /></button>
          <div className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#161B20] border border-white/[0.08]">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => go({ name: 'profile', id: c.author_id })} className="text-xs font-bold text-white truncate cursor-pointer hover:underline">{c.profiles?.display_name || 'Member'}</button>
              <span className="text-[10px] text-[#8E9AA7] flex-shrink-0">{timeAgo(c.created_at)}{c.edited_at && ' · edited'}</span>
            </div>
            {editId === c.id ? (
              <div className="flex gap-1.5 pt-1">
                <MentionInput single ariaLabel="Edit your comment" value={editText} onChange={setEditText} onEnter={() => saveEdit(c)} className={`${inputCls} !min-h-[34px] !text-xs`} />
                <button onClick={() => saveEdit(c)} aria-label="Save comment" className={`${btn.mint} !px-2.5 !py-1`}><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditId(null)} aria-label="Cancel editing" className={btn.icon}><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : <p className="text-xs text-[#EBEBED] leading-relaxed"><MentionText text={c.content} /></p>}
            <div className="flex justify-end gap-3 pt-1">
              {c.author_id === user?.id ? (
                <>
                  {editId !== c.id && <button onClick={() => { setEditId(c.id); setEditText(c.content); setErr(null); }} className="text-[10px] text-[#8E9AA7] underline cursor-pointer">Edit</button>}
                  <button onClick={async () => { if (!confirm('Delete this comment?')) return; const { error } = await supabase.from('comments').delete().eq('id', c.id); if (error) alert(errorMessage(error)); load(); onChange(); }} className="text-[10px] text-[#8E9AA7] underline cursor-pointer">Delete</button>
                </>
              ) : <button onClick={() => onReport(c.id)} className="text-[10px] text-[#8E9AA7] flex items-center gap-1 cursor-pointer"><Flag className="w-3 h-3" />Report</button>}
            </div>
          </div>
        </div>
      ))}
      {user && termsAccepted ? (
        <div className="flex gap-2">
          <MentionInput single ariaLabel="Write a comment" value={text} onChange={setText} onEnter={send} placeholder="Write a comment… type @ to tag" className={`${inputCls} !min-h-[40px] !rounded-full`} />
          <button onClick={send} aria-label="Send comment" className={`${btn.primary} !rounded-full !px-3`}><Send className="w-4 h-4" /></button>
        </div>
      ) : (
        <button onClick={() => go({ name: user ? 'onboarding' : 'auth' })} className="text-xs text-[#53E6D4] underline cursor-pointer">{user ? 'Accept the Terms to comment' : 'Log in to comment'}</button>
      )}
      <ErrorNote text={err} />
    </div>
  );
};

/** One post on its own page (opened from a notification or a shared link). */
export const PostScreen: React.FC<{ id: string }> = ({ id }) => {
  const go = useNav();
  return (
    <div className="px-3 py-4 space-y-3">
      <button onClick={() => go({ name: 'connect' })} className={`${btn.ghost} !py-2 !text-xs`}>← Back to Feed</button>
      <ConnectFeed postId={id} showComposer={false} />
    </div>
  );
};

type Person = { id: string; display_name: string; username: string; avatar_url: string | null; role: string; district: string | null; is_verified: boolean; venue_type: string | null };

/** Search fans, artists and venues/businesses by name or @username. */
const PeopleSearch: React.FC<{ q: string; setQ: (v: string) => void }> = ({ q, setQ }) => {
  const go = useNav();
  const [role, setRole] = useState('');
  const [res, setRes] = useState<Person[] | null>(null);
  useEffect(() => {
    const term = q.trim().replace(/^@/, '').replace(/[%_,()\\]/g, ' ').trim();
    if (!term) { setRes(null); return; }
    const t = setTimeout(async () => {
      let req = supabase.from('profiles').select('id, display_name, username, avatar_url, role, district, is_verified, venue_type')
        .or(`display_name.ilike.%${term}%,username.ilike.%${term}%`).order('display_name').limit(30);
      if (role) req = req.eq('role', role);
      const { data } = await req;
      setRes((data as Person[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, role]);

  const chip = (v: string, label: string) => (
    <button key={v} onClick={() => setRole(v)} aria-pressed={role === v}
      className={`h-8 px-3 rounded-full text-[11px] font-bold cursor-pointer border ${role === v ? 'bg-[#6045F4] border-[#6045F4] text-white' : 'border-white/15 text-[#C9D1D9]'}`}>{label}</button>
  );

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9AA7] pointer-events-none" />
        <input type="text" inputMode="search" enterKeyHint="search" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search fans, artists, venues/businesses…" className={`${inputCls} !pl-9 !pr-9`} />
        {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[#8E9AA7] hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>}
      </div>
      {q.trim() && (
        <>
          <div className="flex flex-wrap gap-1.5">{chip('', 'Everyone')}{chip('fan', 'Fans')}{chip('artist', 'Artists')}{chip('venue', 'Venues/Businesses')}</div>
          {res === null ? <Spinner /> : res.length === 0 ? (
            <p className="text-xs text-[#8E9AA7] px-1">No one found for “{q.trim()}”.</p>
          ) : (
            <div className="space-y-1.5">
              {res.map((p) => (
                <button key={p.id} onClick={() => go({ name: 'profile', id: p.id })} className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-[#1D232A] border border-white/[0.08] text-left cursor-pointer hover:border-white/25">
                  <Avatar src={p.avatar_url} name={p.display_name} size={44} square={roleMeta(p.role).square} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-white truncate">{p.display_name}</span>
                      {p.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#53E6D4] flex-shrink-0" />}
                    </span>
                    <span className="block font-mono text-[10px] text-[#8E9AA7] truncate">@{p.username}{p.role === 'venue' && p.venue_type ? ` · ${p.venue_type}` : p.district ? ` · ${p.district}` : ''}</span>
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${roleMeta(p.role).chip}`}>{roleMeta(p.role).label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const ConnectScreen: React.FC = () => {
  const [q, setQ] = useState('');
  return (
    <div className="px-3 py-4 space-y-4">
      <PeopleSearch q={q} setQ={setQ} />
      {!q.trim() && <ConnectFeed />}
    </div>
  );
};
