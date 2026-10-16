import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { HOOP_MAIN_ADMIN_ID } from './lib';
import { useAuth } from '../context/AuthContext';
import { TradingCard, type TradingCardProps } from './TradingCard';
import { RoyalCard } from './CardDesigns';

/**
 * Each PLAYER's card design, based on how many finished (closed) schedules THEY played in
 * (view public.hoop_member_schedules — on a team in a final game of that schedule).
 *   0–1 schedules → Card 1 · Glow
 *   2+  schedules → Card 2 · Royal Crest
 *   Card 3 (3rd schedule) — design coming; add it to CARD_LEVELS below when it's ready.
 */
export interface CardLevelDef { n: number; name: string; fromSchedules: number; Comp: React.FC<TradingCardProps> }
export const CARD_LEVELS: CardLevelDef[] = [
  { n: 1, name: 'Glow', fromSchedules: 0, Comp: TradingCard },
  { n: 2, name: 'Royal Crest', fromSchedules: 2, Comp: RoyalCard },
  // { n: 3, name: '…', fromSchedules: 3, Comp: … },
];
export type CardLevel = number;

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

/** A player's card in their current design (or a forced level, e.g. the main admin's preview). */
export const ClubCard: React.FC<TradingCardProps & { memberId?: string | null; level?: CardLevel }> = ({ memberId, level, ...p }) => {
  const auto = useMemberSchedules(memberId);
  const def = level != null ? CARD_LEVELS.find((l) => l.n === level) || auto.level : auto.level;
  const Comp = def.Comp;
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
          {CARD_LEVELS.map((l) => (
            <button key={l.n} onClick={() => onChange(l.n === level.n ? null : l.n)}
              className={`h-7 px-3 rounded-full text-[11px] font-bold border cursor-pointer ${shown === l.n ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>
              Card {l.n}{l.n > 1 ? ` · ${l.name}` : ''}
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
