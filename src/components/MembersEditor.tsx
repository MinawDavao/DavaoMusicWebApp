import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { ErrorNote, btn, inputCls } from './ui';

interface Row { id: string; name: string; role: string | null; dirty?: boolean }

/** Add, rename, change role or remove band members. Saves each change straight to the database. */
export const MembersEditor: React.FC<{ bandId: string; onChange?: () => void }> = ({ bandId, onChange }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('band_members').select('id, name, role').eq('band_id', bandId).order('sort_order').order('created_at');
    setRows((data as Row[]) || []);
  }, [bandId]);
  useEffect(() => { load(); }, [load]);

  const edit = (id: string, patch: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)));

  const save = async (r: Row) => {
    if (!r.name.trim()) return setErr('Member name can’t be empty.');
    setErr(null);
    const { error } = await supabase.from('band_members').update({ name: r.name.trim(), role: (r.role || '').trim() || null }).eq('id', r.id);
    if (error) return setErr(errorMessage(error));
    setRows(rows.map((x) => (x.id === r.id ? { ...x, dirty: false } : x)));
    setSavedId(r.id); setTimeout(() => setSavedId(null), 1500);
    onChange?.();
  };
  const remove = async (r: Row) => {
    if (!confirm(`Remove ${r.name} from the band?`)) return;
    const { error } = await supabase.from('band_members').delete().eq('id', r.id);
    if (error) return setErr(errorMessage(error));
    load(); onChange?.();
  };
  const add = async () => {
    if (!name.trim()) return;
    setErr(null);
    const { error } = await supabase.from('band_members').insert({ band_id: bandId, name: name.trim(), role: role.trim() || null, sort_order: rows.length });
    if (error) return setErr(errorMessage(error));
    setName(''); setRole(''); load(); onChange?.();
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><Users className="w-3.5 h-3.5 text-[#53E6D4]" />Band Members
        <span className="ml-auto text-[10px] font-medium text-[#8E9AA7]">Name • Role / instrument</span></p>
      {rows.length === 0 && <p className="text-[11px] text-[#8E9AA7]">No members added yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex gap-1.5">
          <input aria-label="Member name" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} />
          <input aria-label="Member role" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={r.role || ''} onChange={(e) => edit(r.id, { role: e.target.value })} placeholder="Role" />
          {r.dirty
            ? <button onClick={() => save(r)} aria-label="Save member" className={`${btn.mint} !px-2.5 !py-0`}><Check className="w-4 h-4" /></button>
            : savedId === r.id
              ? <span className="w-9 flex items-center justify-center text-[#53E6D4]"><Check className="w-4 h-4" /></span>
              : <button onClick={() => remove(r)} aria-label={`Remove ${r.name}`} className={btn.icon}><Trash2 className="w-4 h-4" /></button>}
        </div>
      ))}
      <div className="flex gap-1.5 pt-1">
        <input aria-label="New member name" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={name} onChange={(e) => setName(e.target.value)} placeholder="New member name" />
        <input aria-label="New member role" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" />
        <button onClick={add} disabled={!name.trim()} aria-label="Add member" className={`${btn.primary} !px-2.5 !py-0`}><Plus className="w-4 h-4" /></button>
      </div>
      <ErrorNote text={err} />
    </div>
  );
};
