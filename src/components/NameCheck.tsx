import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { roleMeta, toHandle } from '../lib/db';

export type NameKind = 'name' | 'username' | 'handle';
export interface NameMatch { name: string; username: string; role: string; exact: boolean }
export interface NameResult { taken: boolean; matches: NameMatch[]; value: string }

/** Checks a name while the person types (after a short pause). Skips the value they already have (`current`). */
export function useNameCheck(kind: NameKind, value: string, opts: { bandId?: string | null; current?: string | null } = {}) {
  const [result, setResult] = useState<NameResult | null>(null);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);
  const v = value.trim();
  const unchanged = !!opts.current && (kind === 'name' ? v.toLowerCase() === opts.current.trim().toLowerCase() : v === opts.current);

  useEffect(() => {
    const my = ++seq.current;
    if (v.replace(/[^a-z0-9]/gi, '').length < 2 || unchanged) { setResult(null); setChecking(false); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('name_check', { p_kind: kind, p_value: v, p_band: opts.bandId ?? null });
      if (my !== seq.current) return;
      setChecking(false);
      setResult(error || !data ? null : { ...(data as any), value: v });
    }, 450);
    return () => clearTimeout(t);
  }, [kind, v, opts.bandId, unchanged]); // eslint-disable-line react-hooks/exhaustive-deps

  // only trust a result for what's in the box right now
  const fresh = result && result.value === v ? result : null;
  return { result: fresh, checking };
}

/** Whether the form should stop: username / band username in use, or an artist / venue name already taken. */
export function nameBlocked(kind: NameKind, role: string, r: NameResult | null): boolean {
  if (!r) return false;
  if (kind === 'name') return r.taken && role !== 'fan';
  return r.taken;
}

const KIND_WORD: Record<NameKind, string> = { name: 'name', username: 'username', handle: 'band username' };

/** The little message under a name / username field. */
export const NameHint: React.FC<{
  kind: NameKind; role: string; value: string; result: NameResult | null; checking: boolean; onPick?: (s: string) => void;
}> = ({ kind, role, value, result, checking, onPick }) => {
  if (checking) return <p className="flex items-center gap-1.5 text-[11px] text-[#8E9AA7]"><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking {KIND_WORD[kind]}…</p>;
  if (!result) return null;
  const exact = result.matches.filter((m) => m.exact);
  const similar = result.matches.filter((m) => !m.exact);
  const tag = (m: NameMatch) => (
    <span key={m.username} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px]">
      <strong className="text-white">{m.name}</strong>
      <span className="text-[#8E9AA7]">{roleMeta(m.role).label} · @{m.username}</span>
    </span>
  );

  // ---------- taken (stops the form)
  if (nameBlocked(kind, role, result)) {
    const base = toHandle(value);
    const ideas = kind === 'name'
      ? [`${value.trim()} Davao`, `${value.trim()} Band`, `${value.trim()} DVO`]
      : [`${base}_dvo`, `${base}davao`, `${base}${(base.length * 7) % 89 + 10}`].map((x) => x.slice(0, 30));
    const owner = exact[0] ?? null;
    return (
      <div role="alert" className="p-2.5 rounded-xl bg-[#FF4D6A]/[0.08] border border-[#FF4D6A]/40 space-y-1.5">
        <p className="flex items-start gap-1.5 text-[12px] text-[#FFB3BF] leading-relaxed">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
          <span>
            {kind === 'name'
              ? <>“{value.trim()}” is already taken{owner ? <> by <strong className="text-white">{owner.name}</strong> ({roleMeta(owner.role).label}, @{owner.username})</> : ''}. Please choose a different name. If someone is using your band or business name, report their page.</>
              : <>The {KIND_WORD[kind]} “{value.trim()}” is already taken.</>}
          </span>
        </p>
        {onPick && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[#8E9AA7]">Try:</span>
            {ideas.map((x) => <button type="button" key={x} onClick={() => onPick(x)} className="px-2 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[11px] font-bold text-[#B7A8FF] cursor-pointer">{x}</button>)}
          </div>
        )}
      </div>
    );
  }

  // ---------- heads-up (doesn't stop the form)
  if (exact.length || similar.length) {
    return (
      <div className="p-2.5 rounded-xl bg-[#FFB800]/[0.08] border border-[#FFB800]/35 space-y-1.5">
        <p className="flex items-start gap-1.5 text-[12px] text-[#FFD873] leading-relaxed">
          <Info className="w-4 h-4 flex-shrink-0 mt-px" />
          <span>
            {exact.length
              ? (kind === 'name' && role === 'fan'
                ? <>Someone named “{value.trim()}” is already on MINAW DVO. That’s okay — your @username keeps you unique.</>
                : <>There’s already someone with this {KIND_WORD[kind]}. Make sure people can tell you apart.</>)
              : <>Heads up: similar {kind === 'name' ? 'names' : `${KIND_WORD[kind]}s`} are already on MINAW DVO. Make sure people can tell you apart.</>}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">{result.matches.map(tag)}</div>
      </div>
    );
  }

  return <p className="flex items-center gap-1.5 text-[11px] text-[#53E6D4]"><CheckCircle2 className="w-3.5 h-3.5" />{kind === 'name' ? 'No one else has this name yet.' : `This ${KIND_WORD[kind]} is available.`}</p>;
};
