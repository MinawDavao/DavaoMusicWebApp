import React, { useEffect, useMemo, useState } from 'react';
import { Headphones, Plus, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MAX_GENRES } from '../lib/genres';
import { btn, inputCls } from './ui';

/** Pick up to 3 genres from a common list, or type your own under "Other". */
export const GenrePicker: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
  const [all, setAll] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [other, setOther] = useState('');
  const [showAll, setShowAll] = useState(false);
  const full = value.length >= MAX_GENRES;

  useEffect(() => {
    supabase.from('genres').select('name, is_custom').order('name').then(({ data }) => {
      setAll(((data as any[]) || []).filter((g) => !g.is_custom).map((g) => g.name));
    });
  }, []);

  const has = (n: string) => value.some((v) => v.toLowerCase() === n.toLowerCase());
  const toggle = (n: string) => {
    if (has(n)) onChange(value.filter((v) => v.toLowerCase() !== n.toLowerCase()));
    else if (!full) onChange([...value, n]);
  };
  const addOther = () => {
    const n = other.trim().replace(/\s+/g, ' ');
    if (n.length < 2 || full || has(n)) return;
    onChange([...value, n.slice(0, 40)]);
    setOther('');
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = all.filter((g) => !s || g.toLowerCase().includes(s));
    return s || showAll ? filtered : filtered.slice(0, 24);
  }, [all, q, showAll]);

  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><Headphones className="w-3.5 h-3.5 text-[#53E6D4]" />Genre
        <span className={`ml-auto text-[10px] font-medium ${full ? 'text-[#FFB800]' : 'text-[#8E9AA7]'}`}>{value.length} / {MAX_GENRES} max</span></p>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full bg-[#6045F4] text-white text-xs font-bold">
              {v}
              <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${v}`} className="w-6 h-6 rounded-full hover:bg-white/20 flex items-center justify-center cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-[#0F1417] border border-white/15">
        <Search className="w-4 h-4 text-[#8E9AA7]" />
        <input aria-label="Search genres" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search genres" className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[#EBEBED]" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((g) => {
          const on = has(g);
          return (
            <button key={g} type="button" aria-pressed={on} disabled={!on && full} onClick={() => toggle(g)}
              className={`h-8 px-3 rounded-full text-xs font-bold border cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${on ? 'bg-[#6045F4] border-[#6045F4] text-white' : 'bg-[#0F1417] border-white/15 text-[#EBEBED]'}`}>
              {g}
            </button>
          );
        })}
        {list.length === 0 && <span className="text-[11px] text-[#8E9AA7]">No match — add it under “Other” below.</span>}
      </div>
      {!q && !showAll && all.length > 24 && (
        <button type="button" onClick={() => setShowAll(true)} className="text-xs font-bold text-[#53E6D4] underline cursor-pointer">Show all {all.length} genres</button>
      )}

      <div className="space-y-1.5 pt-1">
        <label htmlFor="genre-other" className="text-[11px] font-bold text-[#8E9AA7]">Other — type your own genre</label>
        <div className="flex gap-2">
          <input id="genre-other" className={`${inputCls} flex-1 min-w-0 !min-h-[40px]`} value={other} disabled={full}
            onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }}
            placeholder={full ? 'Remove one to add another' : 'e.g. Kulintang Punk'} />
          <button type="button" onClick={addOther} disabled={full || other.trim().length < 2} className={`${btn.primary} !py-0 !px-3`}><Plus className="w-4 h-4" />Add</button>
        </div>
      </div>
    </div>
  );
};
