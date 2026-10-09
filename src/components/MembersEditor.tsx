import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AtSign, Check, Link2, Plus, ShieldCheck, ShieldOff, Trash2, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, roleMeta } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { Avatar, ErrorNote, btn, inputCls } from './ui';

export interface Person { id: string; display_name: string; username: string; avatar_url: string | null; role: string }
export interface MemberRow {
  id: string; name: string; role: string | null; profile_id: string | null; is_admin: boolean;
  profiles?: Person | null; dirty?: boolean;
}
export const MEMBER_COLS = 'id, name, role, profile_id, is_admin, profiles!band_members_profile_id_fkey(id, display_name, username, avatar_url, role)';

/** Type a name or @username to find someone’s MINAW DVO account. */
export const AccountPicker: React.FC<{ onPick: (p: Person) => void; exclude?: string[]; autoFocus?: boolean; onCancel?: () => void; roles?: string[] }> = ({ onPick, exclude = [], autoFocus, onCancel, roles }) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Person[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim().replace(/^@/, '').replace(/[%_\\,()]/g, '');
    const my = ++seq.current;
    if (term.length < 2) { setList([]); return; }
    const t = setTimeout(async () => {
      let req = supabase.from('profiles').select('id, display_name, username, avatar_url, role')
        .or(`username.ilike.${term}%,display_name.ilike.%${term}%`).eq('is_suspended', false).limit(6);
      if (roles?.length) req = req.in('role', roles);
      const { data } = await req;
      if (my === seq.current) setList(((data as Person[]) || []).filter((p) => !exclude.includes(p.id)));
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <span className="relative flex-1 min-w-0">
          <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E9AA7]" />
          <input autoFocus={autoFocus} aria-label="Find their MINAW DVO account" className={`${inputCls} !min-h-[40px] !pl-8 !text-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type their name or @username" />
        </span>
        {onCancel && <button type="button" onClick={onCancel} aria-label="Cancel" className={btn.icon}><X className="w-4 h-4" /></button>}
      </div>
      {list.length > 0 && (
        <div role="listbox" className="absolute left-0 right-0 top-full mt-1 z-30 p-1 rounded-xl bg-[#161B20] border border-white/15 shadow-2xl">
          {list.map((p) => (
            <button type="button" role="option" aria-selected={false} key={p.id} onClick={() => { onPick(p); setQ(''); setList([]); }}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-white/5 cursor-pointer">
              <Avatar src={p.avatar_url} name={p.display_name} size={30} square={roleMeta(p.role).square} />
              <span className="min-w-0">
                <span className="block text-[12px] font-bold text-white truncate">{p.display_name}</span>
                <span className="block text-[10px] text-[#8E9AA7] truncate">@{p.username} · {roleMeta(p.role).label}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {q.trim().replace(/^@/, '').length >= 2 && list.length === 0 && <p className="pt-1 text-[10px] text-[#8E9AA7]">No account found yet — they can sign up first, then you can link them.</p>}
    </div>
  );
};

/** Add / edit band members, link them to their MINAW accounts and (owner only) make them admins of the band page. */
export const MembersEditor: React.FC<{ bandId: string; ownerId: string; onChange?: () => void }> = ({ bandId, ownerId, onChange }) => {
  const { user, refresh } = useAuth();
  const isOwner = user?.id === ownerId;
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [person, setPerson] = useState<Person | null>(null);
  const [linking, setLinking] = useState<string | null>(null); // member id, or 'new'
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('band_members').select(MEMBER_COLS).eq('band_id', bandId).order('sort_order').order('created_at');
    setRows((data as any as MemberRow[]) || []);
  }, [bandId]);
  useEffect(() => { load(); }, [load]);

  const linkedIds = rows.map((r) => r.profile_id).filter(Boolean) as string[];
  const done = () => { load(); onChange?.(); };
  const edit = (id: string, patch: Partial<MemberRow>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)));

  const update = async (r: MemberRow, patch: Partial<MemberRow>) => {
    setErr(null);
    const { error } = await supabase.from('band_members').update(patch).eq('id', r.id);
    if (error) { setErr(errorMessage(error)); return false; }
    return true;
  };
  const save = async (r: MemberRow) => {
    if (!r.name.trim()) return setErr('Member name can’t be empty.');
    if (!(await update(r, { name: r.name.trim(), role: (r.role || '').trim() || null }))) return;
    setRows(rows.map((x) => (x.id === r.id ? { ...x, dirty: false } : x)));
    setSavedId(r.id); setTimeout(() => setSavedId(null), 1500);
    onChange?.();
  };
  const remove = async (r: MemberRow) => {
    if (!confirm(`Remove ${r.name} from the band?${r.is_admin ? '\n\nThey will also stop being an admin of this band page.' : ''}`)) return;
    const { error } = await supabase.from('band_members').delete().eq('id', r.id);
    if (error) return setErr(errorMessage(error));
    done();
  };
  const link = async (r: MemberRow, p: Person) => {
    setLinking(null);
    if (await update(r, { profile_id: p.id })) done();
  };
  const unlink = async (r: MemberRow) => {
    if (!confirm(`Unlink ${r.profiles?.display_name || r.name}’s account?${r.is_admin ? ' They will stop being an admin.' : ''}`)) return;
    if (await update(r, { profile_id: null, is_admin: false })) done();
  };
  const setAdmin = async (r: MemberRow, on: boolean) => {
    const who = r.profiles?.display_name || r.name;
    if (on && !confirm(`Make ${who} an admin of this band page?\n\nUsing their own account they’ll be able to edit the band profile, songs, gigs, photos, members and testimonials. Only you (the owner) can add or remove admins, and they can’t delete the band page.`)) return;
    if (!on && !confirm(`Remove ${who} as admin? They’ll stay listed as a member.`)) return;
    if (await update(r, { is_admin: on })) done();
  };
  const stepDown = async (r: MemberRow) => {
    if (!confirm('Step down as admin of this band page? You’ll stay listed as a member, but can’t edit the page anymore.')) return;
    if (await update(r, { is_admin: false })) { await refresh(); done(); }
  };
  const add = async () => {
    if (!name.trim()) return;
    setErr(null);
    const { error } = await supabase.from('band_members').insert({
      band_id: bandId, name: name.trim(), role: role.trim() || null, sort_order: rows.length,
      profile_id: person?.id ?? null, is_admin: !!person && isOwner && makeAdmin,
    });
    if (error) return setErr(errorMessage(error));
    setName(''); setRole(''); setPerson(null); setMakeAdmin(false); setLinking(null); done();
  };

  const personChip = (p: Person, onRemove?: () => void) => (
    <span className="inline-flex items-center gap-1.5 max-w-full pl-1 pr-2 py-1 rounded-full bg-[#6045F4]/15 border border-[#6045F4]/35">
      <Avatar src={p.avatar_url} name={p.display_name} size={20} square={roleMeta(p.role).square} />
      <span className="text-[11px] font-bold text-white truncate">{p.display_name}</span>
      <span className="text-[10px] text-[#B7A8FF] truncate">@{p.username}</span>
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Unlink ${p.display_name}`} className="text-[#8E9AA7] hover:text-white cursor-pointer"><X className="w-3 h-3" /></button>}
    </span>
  );

  const adminSwitch = (on: boolean, onToggle: () => void, disabled = false) => (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${on ? 'bg-[#53E6D4]/15 border-[#53E6D4]/50 text-[#53E6D4]' : 'bg-white/[0.04] border-white/15 text-[#8E9AA7]'}`}>
      <ShieldCheck className="w-3.5 h-3.5" />{on ? 'Admin' : 'Make admin'}
    </button>
  );

  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><Users className="w-3.5 h-3.5 text-[#53E6D4]" />Band Members
        <span className="ml-auto text-[10px] font-medium text-[#8E9AA7]">Name • Role / instrument</span></p>
      <p className="text-[11px] text-[#8E9AA7] leading-relaxed">
        {isOwner
          ? <>Link members to their MINAW DVO account with <strong className="text-white">@</strong>, then tap <strong className="text-white">Make admin</strong> so they can edit this band page from their own account.</>
          : <>You’re an admin of this band page. Only the owner can add or remove admins.</>}
      </p>
      {rows.length === 0 && <p className="text-[11px] text-[#8E9AA7]">No members added yet.</p>}
      {rows.map((r) => {
        const mine = !!user && r.profile_id === user.id;
        const ownerRow = r.profile_id === ownerId;
        return (
          <div key={r.id} className="p-2 rounded-xl bg-[#161B20] border border-white/[0.08] space-y-1.5">
            <div className="flex gap-1.5">
              <input aria-label="Member name" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} onBlur={() => { const x = rows.find((y) => y.id === r.id); if (x?.dirty && x.name.trim()) save(x); }} />
              <input aria-label="Member role" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={r.role || ''} onChange={(e) => edit(r.id, { role: e.target.value })} onBlur={() => { const x = rows.find((y) => y.id === r.id); if (x?.dirty && x.name.trim()) save(x); }} placeholder="Role" />
              {r.dirty
                ? <button onClick={() => save(r)} aria-label="Save member" className={`${btn.mint} !px-2.5 !py-0`}><Check className="w-4 h-4" /></button>
                : savedId === r.id
                  ? <span className="w-9 flex items-center justify-center text-[#53E6D4]"><Check className="w-4 h-4" /></span>
                  : <button onClick={() => remove(r)} disabled={(r.is_admin && !isOwner && !mine) || (ownerRow && !isOwner)} aria-label={`Remove ${r.name}`} className={`${btn.icon} disabled:opacity-40`}><Trash2 className="w-4 h-4" /></button>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.profiles
                ? personChip(r.profiles, (isOwner || !r.is_admin) ? () => unlink(r) : undefined)
                : linking === r.id
                  ? <div className="w-full"><AccountPicker autoFocus exclude={linkedIds} onPick={(p) => link(r, p)} onCancel={() => setLinking(null)} /></div>
                  : <button type="button" onClick={() => setLinking(r.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-dashed border-white/20 text-[11px] font-bold text-[#C9D1D9] cursor-pointer"><Link2 className="w-3.5 h-3.5" />Link account</button>}
              {r.profiles && !ownerRow && (isOwner
                ? adminSwitch(r.is_admin, () => setAdmin(r, !r.is_admin))
                : r.is_admin && (mine
                  ? <button type="button" onClick={() => stepDown(r)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/15 text-[11px] font-bold text-[#FF8A9C] cursor-pointer"><ShieldOff className="w-3.5 h-3.5" />Step down as admin</button>
                  : adminSwitch(true, () => {}, true)))}
              {ownerRow && <span className="text-[10px] font-bold text-[#FFB800]">Page owner</span>}
            </div>
          </div>
        );
      })}

      {/* add a member */}
      <div className="p-2 rounded-xl border border-dashed border-white/15 space-y-1.5">
        <div className="flex gap-1.5">
          <input aria-label="New member name" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={name} onChange={(e) => setName(e.target.value)} placeholder="New member name" />
          <input aria-label="New member role" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" />
          <button onClick={add} disabled={!name.trim()} aria-label="Add member" className={`${btn.primary} !px-2.5 !py-0`}><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {person
            ? <>{personChip(person, () => { setPerson(null); setMakeAdmin(false); })}{isOwner && adminSwitch(makeAdmin, () => setMakeAdmin(!makeAdmin))}</>
            : linking === 'new'
              ? <div className="w-full"><AccountPicker autoFocus exclude={linkedIds} onPick={(p) => { setPerson(p); setLinking(null); if (!name.trim()) setName(p.display_name); }} onCancel={() => setLinking(null)} /></div>
              : <button type="button" onClick={() => setLinking('new')} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-dashed border-white/20 text-[11px] font-bold text-[#C9D1D9] cursor-pointer"><AtSign className="w-3.5 h-3.5" />Tag their MINAW account (optional)</button>}
        </div>
      </div>
      <ErrorNote text={err} />
    </div>
  );
};
