import React, { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Flag, Pencil, Star, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, roleMeta, timeAgo } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, EmptyState, ErrorNote, Panel, btn, inputCls } from './ui';

type Status = 'pending' | 'approved' | 'declined';
interface Review {
  id: string; author_id: string; rating: number; message: string; status: Status; created_at: string;
  profiles?: { id: string; display_name: string; avatar_url: string | null; role: string } | null;
}

/**
 * Testimonials for a band page (kind="band", targetId = band id) or a venue page (kind="venue", targetId = venue's profile id).
 * New and edited testimonials wait for the page owner to approve them before anyone else can see them.
 */
export const Testimonials: React.FC<{
  kind: 'band' | 'venue'; targetId: string; isOwner: boolean; onReport?: (reviewId: string) => void;
}> = ({ kind, targetId, isOwner, onReport }) => {
  const go = useNav();
  const { user, termsAccepted } = useAuth();
  const table = kind === 'band' ? 'band_reviews' : 'venue_reviews';
  const fk = kind === 'band' ? 'band_id' : 'venue_id';
  const [list, setList] = useState<Review[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(table)
      .select(`id, author_id, rating, message, status, created_at, profiles!${table}_author_id_fkey(id, display_name, avatar_url, role)`)
      .eq(fk, targetId).order('created_at', { ascending: false });
    if (error) setErr(errorMessage(error));
    setList((data as any) || []);
    setLoaded(true);
  }, [table, fk, targetId]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (r: Review, status: Status) => {
    setBusyId(r.id); setErr(null);
    const { error } = await supabase.rpc('set_review_status', { p_kind: kind, p_review_id: r.id, p_status: status });
    setBusyId(null);
    if (error) return setErr(errorMessage(error));
    load();
  };
  const remove = async (r: Review) => {
    if (!confirm('Delete your testimonial?')) return;
    const { error } = await supabase.from(table).delete().eq('id', r.id);
    if (error) return setErr(errorMessage(error));
    load();
  };

  const mine = list.find((r) => r.author_id === user?.id);
  const pending = isOwner ? list.filter((r) => r.status === 'pending') : [];
  const approved = list.filter((r) => r.status === 'approved' && r.author_id !== user?.id);
  const noun = kind === 'band' ? 'their music or live shows' : 'this place';

  const card = (r: Review, extra?: React.ReactNode) => (
    <div key={r.id} className="rounded-2xl bg-[#1D232A] border border-white/[0.08] p-3.5 space-y-2">
      <div className="flex items-center gap-2.5">
        <button onClick={() => go({ name: 'profile', id: r.author_id })} aria-label="View reviewer’s profile" className="cursor-pointer">
          <Avatar src={r.profiles?.avatar_url} name={r.profiles?.display_name} size={36} square={roleMeta(r.profiles?.role).square} />
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => go({ name: 'profile', id: r.author_id })} className="block text-[13px] font-bold text-white truncate cursor-pointer hover:underline">{r.profiles?.display_name || 'Member'}</button>
          <p className="text-[10px] text-[#8E9AA7]">{timeAgo(r.created_at)}</p>
        </div>
        <span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'text-[#FFB800] fill-[#FFB800]' : 'text-[#252D37]'}`} />)}</span>
      </div>
      <p className="text-xs italic text-[#8E9AA7] leading-relaxed whitespace-pre-line">“{r.message}”</p>
      {extra}
    </div>
  );

  return (
    <Panel tone="reviews" icon={Star} title="Testimonials" sub={isOwner ? 'New testimonials only appear after you approve them.' : undefined}>
      <ErrorNote text={err} />

      {/* Owner: waiting for approval */}
      {pending.length > 0 && (
        <div className="space-y-2 p-3 rounded-2xl bg-[#FFB800]/[0.06] border border-dashed border-[#FFB800]/45">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#FFC34D]"><Clock className="w-4 h-4" />Waiting for your approval ({pending.length})</p>
          {pending.map((r) => card(r, (
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStatus(r, 'declined')} disabled={busyId === r.id} className={`${btn.ghost} !py-1.5 !px-3 !text-xs`}><X className="w-3.5 h-3.5" />Decline</button>
              <button onClick={() => setStatus(r, 'approved')} disabled={busyId === r.id} className={`${btn.mint} !py-1.5 !px-3 !text-xs`}><Check className="w-3.5 h-3.5" />Approve</button>
            </div>
          )))}
        </div>
      )}

      {/* Author: their own testimonial, whatever its status */}
      {user && !isOwner && (mine && !editing ? card(mine, (
        <div className="flex items-center gap-2">
          {mine.status === 'pending' && <span className="flex items-center gap-1 text-[10px] font-bold text-[#FFC34D]"><Clock className="w-3 h-3" />Waiting for approval — only you can see it</span>}
          {mine.status === 'declined' && <span className="text-[10px] font-bold text-[#8E9AA7]">Not approved — only you can see it</span>}
          {mine.status === 'approved' && <span className="flex items-center gap-1 text-[10px] font-bold text-[#53E6D4]"><Check className="w-3 h-3" />Approved · public</span>}
          <span className="flex-1" />
          <button onClick={() => setEditing(true)} className="text-[11px] text-[#8E9AA7] underline cursor-pointer flex items-center gap-1"><Pencil className="w-3 h-3" />Edit</button>
          <button onClick={() => remove(mine)} className="text-[11px] text-[#8E9AA7] underline cursor-pointer">Delete</button>
        </div>
      )) : (
        termsAccepted && <ReviewForm table={table} fk={fk} targetId={targetId} userId={user.id} noun={noun} existing={mine}
          onCancel={mine ? () => setEditing(false) : undefined} onDone={() => { setEditing(false); load(); }} />
      ))}

      {loaded && approved.length === 0 && !mine && pending.length === 0 && (
        <EmptyState icon={Star} title="No testimonials yet" text={!user ? 'Log in to leave the first one.' : isOwner ? 'Testimonials from fans will appear here once you approve them.' : 'Be the first to leave one.'} />
      )}
      {approved.map((r) => card(r, (
        <div className="flex justify-end gap-3">
          {isOwner && <button onClick={() => setStatus(r, 'declined')} disabled={busyId === r.id} className="text-[11px] text-[#8E9AA7] underline cursor-pointer">Hide from page</button>}
          {!isOwner && user && onReport && <button onClick={() => onReport(r.id)} className="text-[11px] text-[#8E9AA7] flex items-center gap-1 cursor-pointer"><Flag className="w-3 h-3" />Report</button>}
        </div>
      )))}
    </Panel>
  );
};

const ReviewForm: React.FC<{
  table: string; fk: string; targetId: string; userId: string; noun: string; existing?: Review;
  onDone: () => void; onCancel?: () => void;
}> = ({ table, fk, targetId, userId, noun, existing, onDone, onCancel }) => {
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [msg, setMsg] = useState(existing?.message ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!msg.trim()) return;
    setBusy(true); setErr(null);
    const { error } = existing
      ? await supabase.from(table).update({ rating, message: msg.trim() }).eq('id', existing.id)
      : await supabase.from(table).insert({ [fk]: targetId, author_id: userId, rating, message: msg.trim() });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    if (!existing) setMsg('');
    onDone();
  };
  return (
    <div className="rounded-2xl bg-[#161B20] border border-white/[0.08] p-3.5 space-y-2.5">
      <p className="text-[13px] font-bold text-white">{existing ? 'Edit your testimonial' : 'Leave a testimonial'}</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)} className="cursor-pointer">
            <Star className={`w-6 h-6 ${n <= rating ? 'text-[#FFB800] fill-[#FFB800]' : 'text-[#252D37]'}`} />
          </button>
        ))}
      </div>
      <textarea aria-label="Your testimonial" rows={3} maxLength={1000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`What do you love about ${noun}?`} className={`${inputCls} py-2.5 resize-none`} />
      <p className="text-[10px] text-[#8E9AA7]">It will show up once the page owner approves it.</p>
      <ErrorNote text={err} />
      <div className="flex gap-2">
        {onCancel && <button onClick={onCancel} className={`${btn.ghost} flex-1`}>Cancel</button>}
        <button onClick={submit} disabled={!msg.trim() || busy} className={`${btn.primary} flex-1`}>{busy ? 'Sending…' : existing ? 'Save & Resubmit' : 'Send Testimonial'}</button>
      </div>
    </div>
  );
};
