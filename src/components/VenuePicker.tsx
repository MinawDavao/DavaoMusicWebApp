import React, { useEffect, useState } from 'react';
import { Building2, MapPin, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Avatar, inputCls } from './ui';

export type VenuePick = { id: string | null; name: string };
type V = { id: string; display_name: string; username: string; avatar_url: string | null; venue_type: string | null };

/** “Tag a venue” box: suggests Venue accounts as you type; you can also just type any place name. */
export const VenuePicker: React.FC<{ value: VenuePick; onChange: (v: VenuePick) => void }> = ({ value, onChange }) => {
  const [list, setList] = useState<V[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = value.name.trim().replace(/[%_,()\\]/g, '');
    if (value.id || !open || !q) { setList([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, display_name, username, avatar_url, venue_type')
        .eq('role', 'venue').or(`display_name.ilike.%${q}%,username.ilike.${q}%`).limit(6);
      setList((data as V[]) || []);
    }, 150);
    return () => clearTimeout(t);
  }, [value.name, value.id, open]);

  if (value.id) {
    return (
      <div className="flex items-center gap-2 px-3 min-h-[38px] rounded-xl bg-[#FFB800]/10 border border-[#FFB800]/40">
        <Building2 className="w-4 h-4 text-[#FFC34D]" />
        <span className="flex-1 min-w-0 text-xs font-bold text-[#FFC34D] truncate">{value.name}</span>
        <button type="button" onClick={() => onChange({ id: null, name: '' })} aria-label="Remove venue tag" className="text-[#8E9AA7] hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E9AA7] pointer-events-none" />
      <input
        aria-label="Tag a venue"
        value={value.name}
        onChange={(e) => { onChange({ id: null, name: e.target.value }); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Tag a venue (optional)"
        maxLength={80}
        className={`${inputCls} !min-h-[38px] !pl-9`}
      />
      {open && list.length > 0 && (
        <div role="listbox" aria-label="Venues" className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl bg-[#161B20] border border-white/15 shadow-2xl p-1">
          {list.map((v) => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); onChange({ id: v.id, name: v.display_name }); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer hover:bg-white/10"
            >
              <Avatar src={v.avatar_url} name={v.display_name} size={28} square />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-white truncate">{v.display_name}</span>
                <span className="block font-mono text-[10px] text-[#8E9AA7]">@{v.username}{v.venue_type ? ` · ${v.venue_type}` : ''}</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#FFB800]/15 text-[#FFC34D]">Venue</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
