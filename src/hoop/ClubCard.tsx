import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { HOOP_MAIN_ADMIN_ID } from './lib';
import { useAuth } from '../context/AuthContext';
import { TradingCard, type TradingCardProps } from './TradingCard';
import { OneOfOneCard, RoyalCard, StarlightCard } from './CardDesigns';

/**
 * Each PLAYER's card design, based on how many finished (closed) schedules THEY played in
 * (view public.hoop_member_schedules — on a team in a final game of that schedule).
 *   0–1 schedules → Card 1 · Glow
 *   2   schedules → Card 2 · Royal Crest
 *   3+  schedules → Card 3 · Starlight
 * (the database repeats these numbers in private.hoop_member_level — change both together)
 * Plus the rare 1-of-1, won from a card pack. A player has every level card up to theirs (+ any 1-of-1s) and can pick
 * which card they show (hoop_members.card_choice: 'level1'…'level3' or 'one:<id>') — everyone sees the card they picked.
 */
export interface CardLevelDef { n: number; key: string; name: string; fromSchedules: number; Comp: React.FC<TradingCardProps> }
export const CARD_LEVELS: CardLevelDef[] = [
  { n: 1, key: 'glow', name: 'Glow', fromSchedules: 0, Comp: TradingCard },
  { n: 2, key: 'royal', name: 'Royal Crest', fromSchedules: 2, Comp: RoyalCard },
  { n: 3, key: 'starlight', name: 'Starlight', fromSchedules: 3, Comp: StarlightCard },
  // { n: 4, key: '…', name: '…', fromSchedules: 4, Comp: … },
];
/** Every design by its key (card packs use these keys). */
export const DESIGNS: Record<string, React.FC<TradingCardProps>> = { ...Object.fromEntries(CARD_LEVELS.map((l) => [l.key, l.Comp])), oneofone: OneOfOneCard };
/** A level number, or 'one' for the 1-of-1. */
export type CardLevel = number | 'one';

/**
 * A 1-of-1: its signature picture (null = not signed yet) and whether it still exists (null = still checking;
 * false = gone, e.g. its schedule was deleted). Refreshes when it's signed (window event 'hoop-signed').
 */
type OneInfo = { sig: string | null; exists: boolean | null };
const oneCache = new Map<string, OneInfo>();
export function useOneOfOne(oneId?: string | null): OneInfo {
  const [info, setInfo] = useState<OneInfo>(oneId ? oneCache.get(oneId) ?? { sig: null, exists: null } : { sig: null, exists: null });
  useEffect(() => {
    if (!oneId) { setInfo({ sig: null, exists: null }); return; }
    let live = true;
    setInfo(oneCache.get(oneId) ?? { sig: null, exists: null });
    supabase.from('hoop_one_of_ones').select('signature_url').eq('id', oneId).maybeSingle()
      .then(({ data, error }) => {
        if (!live || error) return;
        const v: OneInfo = { sig: (data as any)?.signature_url ?? null, exists: !!data };
        oneCache.set(oneId, v); setInfo(v);
      });
    const on = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.id === oneId) { const v = { sig: d.url, exists: true }; oneCache.set(oneId, v); setInfo(v); } };
    window.addEventListener('hoop-signed', on);
    return () => { live = false; window.removeEventListener('hoop-signed', on); };
  }, [oneId]);
  return info;
}
export const announceSigned = (id: string, url: string | null) => window.dispatchEvent(new CustomEvent('hoop-signed', { detail: { id, url } }));

export const levelFor = (schedules: number): CardLevelDef =>
  [...CARD_LEVELS].reverse().find((l) => schedules >= l.fromSchedules) || CARD_LEVELS[0];

const cache = new Map<string, number>();   // member id → closed schedules played

export function useMemberSchedules(memberId?: string | null): { schedules: number; level: CardLevelDef; ready: boolean } {
  const [n, setN] = useState<number | null>(memberId ? cache.get(memberId) ?? null : 0);
  useEffect(() => {
    if (!memberId) { setN(0); return; }
    let live = true;
    setN(cache.get(memberId) ?? null);
    supabase.from('hoop_member_schedules').select('schedules').eq('member_id', memberId).maybeSingle()
      .then(({ data, error }) => {
        if (!live || error) return;
        const v = (data as any)?.schedules ?? 0;
        cache.set(memberId, v);
        setN(v);
      });
    return () => { live = false; };
  }, [memberId]);
  const schedules = n ?? 0;
  return { schedules, level: levelFor(schedules), ready: n !== null };
}

/** The level/1-of-1 a card_choice points at ('level2' → 2, 'one:…' → 'one'), or null. */
export const choiceLevel = (choice?: string | null): CardLevel | null =>
  !choice ? null : choice.startsWith('one:') ? 'one' : /^level\d$/.test(choice) ? Number(choice.slice(5)) : null;

/**
 * A player's card. Shows their earned level, unless:
 *   level  — forced (the main admin's preview, a card from the list)
 *   choice — the player's pick (hoop_members.card_choice; checked against what they've earned, shown to everyone)
 */
export const ClubCard: React.FC<TradingCardProps & { memberId?: string | null; level?: CardLevel; choice?: string | null; oneId?: string | null }> = ({ memberId, level, choice, oneId, ...p }) => {
  const auto = useMemberSchedules(memberId);
  const sigId = oneId ?? (choice?.startsWith('one:') ? choice.slice(4) : null);
  const one = useOneOfOne(sigId);
  if (level == null && memberId && !auto.ready) {
    // still finding out which card this player has — keep the space, don't flash card 1
    return <div data-card-loading className="w-full aspect-[5/7] rounded-[5cqw] bg-white/[0.04] animate-pulse" />;
  }
  // a picked 1-of-1 that no longer exists falls back to the player's level card
  const picked = choiceLevel(choice) === 'one' && one.exists === false ? null : choiceLevel(choice);
  const want: CardLevel = level ?? (picked === 'one' || (typeof picked === 'number' && picked <= auto.level.n) ? picked : auto.level.n);
  if (want === 'one') return <OneOfOneCard {...p} signature={one.sig} />;
  const Comp = (CARD_LEVELS.find((l) => l.n === want) || auto.level).Comp;
  return <Comp {...p} />;
};

/** Switch to try every card design on any player — only for the main admin's account. Renders nothing for everyone else. */
export const OwnerCardPreview: React.FC<{ memberId: string; value: CardLevel | null; onChange: (v: CardLevel | null) => void }> = ({ memberId, value, onChange }) => {
  const { user } = useAuth();
  const { schedules, level, ready } = useMemberSchedules(memberId);
  if (user?.id !== HOOP_MAIN_ADMIN_ID || !ready || CARD_LEVELS.length < 2) return null;
  const shown = value ?? level.n;
  const next = CARD_LEVELS.find((l) => l.n === level.n + 1);
  return (
    <div className="rounded-2xl p-2.5 space-y-2 border border-[var(--hp)]/40" style={{ background: 'color-mix(in srgb, var(--hp) 6%, transparent)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black tracking-wider text-[var(--hp)]">OWNER PREVIEW</p>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {[...CARD_LEVELS.map((l) => ({ v: l.n as CardLevel, label: `Card ${l.n}${l.n > 1 ? ` · ${l.name}` : ''}` })), { v: 'one' as CardLevel, label: '1 of 1' }].map(({ v, label }) => (
            <button key={String(v)} onClick={() => onChange(v === level.n ? null : v)}
              className={`h-7 px-3 rounded-full text-[11px] font-bold border cursor-pointer ${shown === v ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[#A8A29E] leading-snug">
        Only you can see this. This player finished {schedules} schedule{schedules === 1 ? '' : 's'} → Card {level.n}.
        {next ? ` Card ${next.n} unlocks after their ${next.fromSchedules === 2 ? '2nd' : next.fromSchedules === 3 ? '3rd' : `${next.fromSchedules}th`} finished schedule.` : ''}
      </p>
    </div>
  );
};
