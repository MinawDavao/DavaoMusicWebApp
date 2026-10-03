import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Eye, EyeOff, Search, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { errorMessage, removeImageByUrl, roleMeta, timeAgo } from '../../lib/db';
import { useNav, type Route } from '../../nav';
import { Avatar, EmptyState, ErrorNote, Spinner, btn, inputCls } from '../../components/ui';
import { ZoomImg } from '../../components/Zoom';

export const PAGE = 30;

/** Loads a page of rows at a time; reloads when deps change. */
export function usePaged<T>(fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>, deps: unknown[]) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (append = false, current = 0) => {
    const my = ++seq.current;
    setLoading(true);
    const from = append ? current : 0;
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (my !== seq.current) return;
    setErr(error ? errorMessage(error) : null);
    const list = data || [];
    setRows((r) => (append ? [...r, ...list] : list));
    setMore(list.length === PAGE);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(false); }, [load]);
  return { rows, setRows, loading, more, err, setErr, reload: () => load(false), loadMore: () => load(true, rows.length) };
}

export const SearchBar: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; children?: React.ReactNode }> = ({ value, onChange, placeholder, children }) => {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => onChange(v.trim()), 300); return () => clearTimeout(t); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9AA7] pointer-events-none" />
        <input aria-label={placeholder} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className={`${inputCls} !pl-9 !min-h-[40px]`} />
      </div>
      {children}
    </div>
  );
};

export const Select: React.FC<{ value: string; onChange: (v: string) => void; options: [string, string][]; label: string }> = ({ value, onChange, options, label }) => (
  <div className="relative">
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} !min-h-[40px] !pr-8 appearance-none cursor-pointer`}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9AA7] pointer-events-none" />
  </div>
);

export const Chip: React.FC<{ tone?: 'red' | 'amber' | 'mint' | 'purple' | 'gray'; children: React.ReactNode }> = ({ tone = 'gray', children }) => {
  const c = {
    red: 'bg-[#FF4D6A]/15 text-[#FF8A9C] border-[#FF4D6A]/35',
    amber: 'bg-[#FFB800]/15 text-[#FFC34D] border-[#FFB800]/35',
    mint: 'bg-[#53E6D4]/12 text-[#53E6D4] border-[#53E6D4]/30',
    purple: 'bg-[#6045F4]/20 text-[#B7A8FF] border-[#6045F4]/40',
    gray: 'bg-white/5 text-[#C9D1D9] border-white/15',
  }[tone];
  return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wide ${c}`}>{children}</span>;
};

/** "by Name · 3h ago" link to the owner’s profile. */
export const Owner: React.FC<{ p?: { id: string; display_name: string; avatar_url?: string | null; role?: string } | null; at?: string }> = ({ p, at }) => {
  const go = useNav();
  return (
    <span className="flex items-center gap-1.5 min-w-0 text-[11px] text-[#8E9AA7]">
      {p ? (
        <button onClick={() => go({ name: 'profile', id: p.id })} className="flex items-center gap-1.5 min-w-0 hover:text-white cursor-pointer" title="Open owner’s profile">
          <Avatar src={p.avatar_url ?? null} name={p.display_name} size={18} square={roleMeta(p.role).square} />
          <strong className="text-[#EBEBED] truncate">{p.display_name}</strong>
        </button>
      ) : <span>Unknown owner</span>}
      {at && <span className="flex-shrink-0">· {timeAgo(at)}</span>}
    </span>
  );
};

/** One row in an admin list: thumbnail, text, chips, and action buttons. */
export const Row: React.FC<{
  thumb?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; chips?: React.ReactNode; actions?: React.ReactNode; dim?: boolean;
}> = ({ thumb, title, sub, chips, actions, dim }) => (
  <div className={`flex gap-3 p-3 rounded-2xl bg-[#1D232A] border border-white/[0.08] ${dim ? 'opacity-70' : ''}`}>
    {thumb && <div className="flex-shrink-0">{thumb}</div>}
    <div className="flex-1 min-w-0 space-y-1">
      <div className="text-[13px] text-white font-bold leading-snug break-words">{title}</div>
      {sub && <div className="space-y-0.5">{sub}</div>}
      {chips && <div className="flex flex-wrap gap-1">{chips}</div>}
      {actions && <div className="flex flex-wrap gap-1.5 pt-1">{actions}</div>}
    </div>
  </div>
);

/** 56px zoomable thumbnail (tap to see full size). */
export const Thumb: React.FC<{ src?: string | null }> = ({ src }) =>
  src
    ? <span className="block w-14 h-14 rounded-xl overflow-hidden bg-[#252D37]"><ZoomImg src={src} alt="" className="w-14 h-14 object-cover" /></span>
    : <span className="block w-14 h-14 rounded-xl bg-[#252D37]" />;

const small = '!py-1.5 !px-2.5 !text-[11px]';
export const OpenBtn: React.FC<{ to: Route; label?: string }> = ({ to, label = 'Open' }) => {
  const go = useNav();
  return <button onClick={() => go(to)} className={`${btn.ghost} ${small}`}><ExternalLink className="w-3.5 h-3.5" />{label}</button>;
};
export const HideBtn: React.FC<{ hidden: boolean; onToggle: () => void }> = ({ hidden, onToggle }) => (
  <button onClick={onToggle} className={`${btn.ghost} ${small}`}>{hidden ? <><Eye className="w-3.5 h-3.5" />Unhide</> : <><EyeOff className="w-3.5 h-3.5" />Hide</>}</button>
);
export const DeleteBtn: React.FC<{ onDelete: () => void; label?: string }> = ({ onDelete, label = 'Delete' }) => (
  <button onClick={onDelete} className={`${btn.ghost} ${small} !text-[#FF8A9C] !border-[#FF4D6A]/35`}><Trash2 className="w-3.5 h-3.5" />{label}</button>
);
export const ActBtn: React.FC<{ onClick: () => void; children: React.ReactNode; tone?: 'mint' | 'ghost' }> = ({ onClick, children, tone = 'ghost' }) => (
  <button onClick={onClick} className={`${tone === 'mint' ? btn.mint : btn.ghost} ${small}`}>{children}</button>
);

/** Standard list body: errors, spinner, empty state, rows, "Load more". */
export const ListBody: React.FC<{
  loading: boolean; err: string | null; empty: string; count: number; more: boolean; onMore: () => void; children: React.ReactNode;
}> = ({ loading, err, empty, count, more, onMore, children }) => (
  <div className="space-y-2">
    <ErrorNote text={err} />
    {count === 0 && loading ? <Spinner /> : count === 0 ? <EmptyState icon={Search} title={empty} /> : children}
    {more && <button onClick={onMore} disabled={loading} className={`${btn.ghost} w-full`}>{loading ? 'Loading…' : 'Load more'}</button>}
  </div>
);

// ---------------------------------------------------------------- actions
export const confirmDelete = (what: string) =>
  confirm(`Delete ${what}? This can’t be undone.`);

/** Updates a row and reports errors through `onErr`. Returns true on success. */
export async function updateRow(table: string, id: string, patch: Record<string, unknown>, onErr: (m: string) => void) {
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) { onErr(errorMessage(error)); return false; }
  return true;
}
export async function deleteRow(table: string, id: string, onErr: (m: string) => void, images: (string | null | undefined)[] = []) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { onErr(errorMessage(error)); return false; }
  for (const u of images) await removeImageByUrl(u);
  return true;
}
