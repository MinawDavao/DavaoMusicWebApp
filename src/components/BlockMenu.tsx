import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Clock, EyeOff, MoreHorizontal, ShieldOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, roleMeta } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, ErrorNote, Panel, btn } from './ui';

export interface BlockRow { blocked_id: string; expires_at: string | null; created_at: string }

const active = (b: BlockRow | null) => !!b && (!b.expires_at || new Date(b.expires_at).getTime() > Date.now());
const until = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** My block on this person (if any). */
export function useMyBlock(targetId?: string) {
  const { user } = useAuth();
  const [block, setBlock] = useState<BlockRow | null>(null);
  const load = useCallback(async () => {
    if (!user || !targetId || user.id === targetId) { setBlock(null); return; }
    const { data } = await supabase.from('user_blocks').select('blocked_id, expires_at, created_at')
      .eq('blocker_id', user.id).eq('blocked_id', targetId).maybeSingle();
    setBlock(active(data as BlockRow) ? (data as BlockRow) : null);
  }, [user?.id, targetId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { block, reload: load };
}

/** "•••" button on someone else's profile: block, or hide my account from them for 15 / 30 days. */
export const BlockMenu: React.FC<{ targetId: string; name: string; onChange: () => void }> = ({ targetId, name, onChange }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const apply = async (days: number | null) => {
    if (!user) return;
    const msg = days
      ? `Hide your account from ${name} for ${days} days?\n\nThey won’t be able to see your profile, posts or comments, or interact with you, until it ends. They won’t be told.`
      : `Block ${name}?\n\nThey won’t be able to see your profile, posts or comments, follow you, tag you, or interact with your posts and songs. You won’t see theirs either. They won’t be told. You can unblock them any time.`;
    if (!confirm(msg)) return;
    setOpen(false); setErr(null);
    const { error } = await supabase.from('user_blocks').upsert({
      blocker_id: user.id, blocked_id: targetId, expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null, created_at: new Date().toISOString(),
    });
    if (error) return setErr(errorMessage(error));
    onChange();
  };

  const item = (Icon: React.ElementType, label: string, sub: string, onClick: () => void, danger = false) => (
    <button role="menuitem" onClick={onClick} className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left cursor-pointer hover:bg-white/5">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${danger ? 'text-[#FF8A9C]' : 'text-[#C9D1D9]'}`} />
      <span><span className={`block text-[13px] font-bold ${danger ? 'text-[#FF8A9C]' : 'text-white'}`}>{label}</span><span className="block text-[11px] text-[#8E9AA7]">{sub}</span></span>
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-label="More options" aria-haspopup="menu" aria-expanded={open} className={btn.icon}><MoreHorizontal className="w-4 h-4" /></button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-72 p-1.5 rounded-2xl bg-[#161B20] border border-white/15 shadow-2xl">
          {item(EyeOff, 'Hide my account for 15 days', `${name} can’t see or interact with you for 15 days`, () => apply(15))}
          {item(Clock, 'Hide my account for 30 days', `${name} can’t see or interact with you for 30 days`, () => apply(30))}
          <div className="h-px bg-white/[0.08] my-1" />
          {item(Ban, `Block ${name}`, 'Until you unblock them', () => apply(null), true)}
        </div>
      )}
      <ErrorNote text={err} />
    </div>
  );
};

/** Banner on a profile you blocked / hid from, with Unblock. */
export const BlockedBanner: React.FC<{ block: BlockRow; name: string; onChange: () => void }> = ({ block, name, onChange }) => {
  const { user } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const undo = async () => {
    const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', user!.id).eq('blocked_id', block.blocked_id);
    if (error) return setErr(errorMessage(error));
    onChange();
  };
  return (
    <div className="p-3 rounded-2xl bg-[#FF4D6A]/[0.08] border border-[#FF4D6A]/35 space-y-2">
      <p className="flex items-start gap-2 text-[12px] text-[#EBEBED] leading-relaxed">
        <Ban className="w-4 h-4 text-[#FF8A9C] flex-shrink-0 mt-0.5" />
        <span>{block.expires_at
          ? <>Your account is hidden from <strong>{name}</strong> until <strong>{until(block.expires_at)}</strong>. You won’t see each other’s posts and can’t interact.</>
          : <>You blocked <strong>{name}</strong>. You won’t see each other’s posts and can’t interact.</>}</span>
      </p>
      <button onClick={undo} className={`${btn.ghost} !py-1.5 !text-xs`}><ShieldOff className="w-3.5 h-3.5" />{block.expires_at ? 'Stop hiding now' : 'Unblock'}</button>
      <ErrorNote text={err} />
    </div>
  );
};

/** On your own profile: everyone you’ve blocked or are hiding from. */
export const BlockedList: React.FC = () => {
  const go = useNav();
  const { user } = useAuth();
  const [rows, setRows] = useState<(BlockRow & { profiles: { id: string; display_name: string; avatar_url: string | null; role: string } | null })[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('user_blocks')
      .select('blocked_id, expires_at, created_at, profiles!user_blocks_blocked_id_fkey(id, display_name, avatar_url, role)')
      .eq('blocker_id', user.id).order('created_at', { ascending: false });
    setRows(((data as any[]) || []).filter((b) => active(b)));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  if (!rows.length) return null;
  const undo = async (id: string) => {
    const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', user!.id).eq('blocked_id', id);
    if (error) return setErr(errorMessage(error));
    load();
  };
  return (
    <Panel tone="blocked" icon={Ban} title={`Blocked & hidden (${rows.length})`} sub="Only you can see this list. They aren’t told.">
      {rows.map((b) => (
        <div key={b.blocked_id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#1D232A] border border-white/[0.08]">
          <button onClick={() => go({ name: 'profile', id: b.blocked_id })} className="cursor-pointer"><Avatar src={b.profiles?.avatar_url} name={b.profiles?.display_name} size={40} square={roleMeta(b.profiles?.role).square} /></button>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-bold text-white truncate">{b.profiles?.display_name || 'Member'}</span>
            <span className="block text-[11px] text-[#8E9AA7]">{b.expires_at ? `Hidden until ${until(b.expires_at)}` : 'Blocked'}</span>
          </span>
          <button onClick={() => undo(b.blocked_id)} className={`${btn.ghost} !py-1.5 !px-3 !text-xs`}>{b.expires_at ? 'Stop hiding' : 'Unblock'}</button>
        </div>
      ))}
      <ErrorNote text={err} />
    </Panel>
  );
};
