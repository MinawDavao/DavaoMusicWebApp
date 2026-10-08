import React, { useState } from 'react';
import { BadgeCheck, Ban, Flag, ShieldCheck, Undo2, UserCheck, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { REPORT_REASONS, errorMessage, roleMeta, timeAgo } from '../../lib/db';
import { useAuth } from '../../context/AuthContext';
import type { Route } from '../../nav';
import { Avatar } from '../../components/ui';
import { ActBtn, Chip, ListBody, OpenBtn, Owner, Row, SearchBar, Select, usePaged } from './kit';

// ================================================================ REPORTS
interface Report {
  id: string; target_type: string; target_id: string; reason: string; details: string | null; status: string;
  created_at: string; reviewed_at: string | null;
  reporter?: { id: string; display_name: string; avatar_url: string | null; role: string } | null;
}
type Target = { text: string; route: Route | null; owner?: string | null; image?: string | null; hidden?: boolean };

const TYPE_LABEL: Record<string, string> = { post: 'Post', comment: 'Comment', listing: 'Deal', track: 'Song', band: 'Band page', review: 'Testimonial', profile: 'Profile', message: 'Chat message', track_comment: 'Song comment' };

/** Looks up what each report points at, so you can see it without leaving the list. */
async function loadTargets(list: Report[]): Promise<Record<string, Target>> {
  const ids = (t: string) => list.filter((r) => r.target_type === t).map((r) => r.target_id);
  const out: Record<string, Target> = {};
  const q = async (t: string, table: string, cols: string, map: (x: any) => Target) => {
    const want = ids(t); if (!want.length) return;
    const { data } = await supabase.from(table).select(cols).in('id', want);
    ((data as any[]) || []).forEach((x) => { out[`${t}:${x.id}`] = map(x); });
  };
  await Promise.all([
    q('post', 'posts', 'id, content, image_url, author_id, is_hidden', (x) => ({ text: x.content, image: x.image_url, owner: x.author_id, hidden: x.is_hidden, route: { name: 'post', id: x.id } })),
    q('track_comment', 'track_comments', 'id, content, author_id, is_hidden, track_id, tracks(band_id)', (x) => ({ text: x.content, owner: x.author_id, hidden: x.is_hidden, route: x.tracks?.band_id ? { name: 'band', id: x.tracks.band_id, song: x.track_id } : null })),
    q('comment', 'comments', 'id, content, post_id, author_id, is_hidden', (x) => ({ text: x.content, owner: x.author_id, hidden: x.is_hidden, route: { name: 'post', id: x.post_id } })),
    q('listing', 'listings', 'id, title, seller_id, is_hidden', (x) => ({ text: x.title, owner: x.seller_id, hidden: x.is_hidden, route: { name: 'profile', id: x.seller_id } })),
    q('track', 'tracks', 'id, title, band_id, is_hidden', (x) => ({ text: x.title, hidden: x.is_hidden, route: { name: 'band', id: x.band_id } })),
    q('band', 'bands', 'id, name, owner_id, is_hidden', (x) => ({ text: x.name, owner: x.owner_id, hidden: x.is_hidden, route: { name: 'band', id: x.id } })),
    q('review', 'band_reviews', 'id, message, band_id, author_id, is_hidden', (x) => ({ text: x.message, owner: x.author_id, hidden: x.is_hidden, route: { name: 'band', id: x.band_id } })),
    q('message', 'messages', 'id, body, image_path, sender_id, is_hidden', (x) => ({ text: x.body || '(photo)', owner: x.sender_id, hidden: x.is_hidden, route: { name: 'profile', id: x.sender_id } })),
    q('profile', 'profiles', 'id, display_name, username, avatar_url, is_suspended', (x) => ({ text: `${x.display_name} (@${x.username})`, image: x.avatar_url, hidden: x.is_suspended, route: { name: 'profile', id: x.id } })),
  ]);
  return out;
}

export const AdminReports: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState('pending');
  const [targets, setTargets] = useState<Record<string, Target>>({});
  const list = usePaged<Report>(async (from, to) => {
    let q = supabase.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(id, display_name, avatar_url, role)').order('created_at', { ascending: false }).range(from, to);
    if (status === 'pending') q = q.in('status', ['open', 'reviewing']);
    else if (status !== 'all') q = q.eq('status', status);
    const res = await q;
    const rows = (res.data as unknown as Report[]) || [];
    loadTargets(rows).then((t) => setTargets((old) => ({ ...old, ...t })));
    return { data: rows, error: res.error };
  }, [status]);

  const decide = async (r: Report, s: 'removed' | 'dismissed') => {
    const { error } = await supabase.from('reports').update({ status: s, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', r.id);
    if (error) return list.setErr(errorMessage(error));
    list.reload();
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#8E9AA7] leading-relaxed"><strong className="text-white">Remove</strong> hides the reported item from everyone (a reported profile is suspended). <strong className="text-white">Dismiss</strong> keeps it. You can undo either one later.</p>
      <Select label="Report status" value={status} onChange={setStatus} options={[['pending', 'Needs review'], ['removed', 'Removed'], ['dismissed', 'Dismissed'], ['all', 'All reports']]} />
      <ListBody loading={list.loading} err={list.err} empty="No reports here. All clear!" count={list.rows.length} more={list.more} onMore={list.loadMore}>
        {list.rows.map((r) => {
          const t = targets[`${r.target_type}:${r.target_id}`];
          const reason = REPORT_REASONS.find((x) => x.key === r.reason)?.label || r.reason;
          return (
            <Row
              key={r.id}
              thumb={<span className="w-10 h-10 rounded-xl bg-[#FF4D6A]/15 text-[#FF8A9C] flex items-center justify-center"><Flag className="w-5 h-5" /></span>}
              title={<>{TYPE_LABEL[r.target_type] || r.target_type} reported for <span className="text-[#FF8A9C]">{reason}</span></>}
              sub={<>
                <p className="text-[12px] text-[#C9D1D9] italic break-words">{t ? `“${t.text?.slice(0, 220) || '—'}”` : 'This item no longer exists.'}</p>
                {t?.image && <img src={t.image} alt="" className="w-24 h-16 rounded-lg object-cover" />}
                {r.details && <p className="text-[11px] text-[#8E9AA7]">Reporter’s note: {r.details}</p>}
                <span className="flex items-center gap-1.5 text-[11px] text-[#8E9AA7]">Reported by <Owner p={r.reporter} at={r.created_at} /></span>
              </>}
              chips={<>
                <Chip tone={r.status === 'removed' ? 'red' : r.status === 'dismissed' ? 'gray' : 'amber'}>{r.status === 'open' || r.status === 'reviewing' ? 'Needs review' : r.status}</Chip>
                {t?.hidden && <Chip tone="red">Hidden now</Chip>}
              </>}
              actions={<>
                {t?.route && <OpenBtn to={t.route} label="View item" />}
                {r.status !== 'removed' && <ActBtn onClick={() => decide(r, 'removed')}><XCircle className="w-3.5 h-3.5 text-[#FF8A9C]" />Remove</ActBtn>}
                {r.status !== 'dismissed' && <ActBtn onClick={() => decide(r, 'dismissed')}>{r.status === 'removed' ? <><Undo2 className="w-3.5 h-3.5" />Restore</> : 'Dismiss'}</ActBtn>}
              </>}
            />
          );
        })}
      </ListBody>
    </div>
  );
};

// ================================================================ USERS
interface U {
  id: string; display_name: string; username: string; avatar_url: string | null; role: string; email: string;
  created_at: string; last_sign_in_at: string | null; last_seen_at: string | null;
  is_suspended: boolean; is_verified: boolean; is_moderator: boolean; posts: number; band_id: string | null;
}

export const AdminUsers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const list = usePaged<U>(async (from, to) => {
    const { data, error } = await supabase.rpc('admin_users', { p_search: search, p_role: role, p_limit: to - from + 1, p_offset: from });
    return { data: data as U[], error };
  }, [search, role]);

  const act = async (fn: 'admin_set_suspended' | 'admin_set_verified', u: U, on: boolean) => {
    if (fn === 'admin_set_suspended' && on && !confirm(`Suspend ${u.display_name}? They won’t be able to log in or post, and their profile will be hidden.`)) return;
    const args = fn === 'admin_set_suspended' ? { p_user: u.id, p_suspend: on } : { p_user: u.id, p_verified: on };
    const { error } = await supabase.rpc(fn, args);
    if (error) return list.setErr(errorMessage(error));
    list.setRows((rows) => rows.map((x) => (x.id === u.id ? { ...x, ...(fn === 'admin_set_suspended' ? { is_suspended: on } : { is_verified: on }) } : x)));
  };

  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Search name, @username or email">
        <Select label="Account type" value={role} onChange={setRole} options={[['', 'Everyone'], ['fan', 'Fans'], ['artist', 'Artists'], ['venue', 'Venues/Businesses']]} />
      </SearchBar>
      <ListBody loading={list.loading} err={list.err} empty="No users found" count={list.rows.length} more={list.more} onMore={list.loadMore}>
        {list.rows.map((u) => (
          <Row
            key={u.id}
            dim={u.is_suspended}
            thumb={<Avatar src={u.avatar_url} name={u.display_name} size={44} square={roleMeta(u.role).square} />}
            title={<>{u.display_name} <span className="font-mono text-[11px] font-normal text-[#8E9AA7]">@{u.username}</span></>}
            sub={<>
              <p className="text-[11px] text-[#C9D1D9] break-all">{u.email}</p>
              <p className="text-[11px] text-[#8E9AA7]">Joined {timeAgo(u.created_at)} · last active {u.last_seen_at ? timeAgo(u.last_seen_at) : u.last_sign_in_at ? timeAgo(u.last_sign_in_at) : 'never'} · {u.posts} post{u.posts === 1 ? '' : 's'}</p>
            </>}
            chips={<>
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${roleMeta(u.role).chip}`}>{roleMeta(u.role).label}</span>
              {u.is_moderator && <Chip tone="purple"><ShieldCheck className="w-3 h-3" />Admin</Chip>}
              {u.is_verified && <Chip tone="mint"><BadgeCheck className="w-3 h-3" />Verified</Chip>}
              {u.is_suspended && <Chip tone="red"><Ban className="w-3 h-3" />Suspended</Chip>}
            </>}
            actions={<>
              <OpenBtn to={{ name: 'profile', id: u.id }} label="Profile" />
              {u.band_id && <OpenBtn to={{ name: 'band', id: u.band_id }} label="Band page" />}
              <ActBtn onClick={() => act('admin_set_verified', u, !u.is_verified)}><BadgeCheck className="w-3.5 h-3.5 text-[#53E6D4]" />{u.is_verified ? 'Remove badge' : 'Verify'}</ActBtn>
              {!u.is_moderator && (u.is_suspended
                ? <ActBtn onClick={() => act('admin_set_suspended', u, false)}><UserCheck className="w-3.5 h-3.5 text-[#53E6D4]" />Unsuspend</ActBtn>
                : <ActBtn onClick={() => act('admin_set_suspended', u, true)}><Ban className="w-3.5 h-3.5 text-[#FF8A9C]" />Suspend</ActBtn>)}
            </>}
          />
        ))}
      </ListBody>
    </div>
  );
};
