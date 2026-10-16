import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useClub } from './lib';
import { TradingCard, type TradingCardProps } from './TradingCard';
import { RoyalCard } from './CardDesigns';

/**
 * Which card design a club shows.
 *   Card 1 = Glow (TradingCard)
 *   Card 2 = Royal Crest — switches on for EVERY player in the club once the club's 2nd schedule has ended.
 * "Ended" = a schedule (a hoop_games row with no session_id) whose closed_at is set.
 */
export const CARD2_AFTER_SCHEDULES = 2;
export type CardLevel = 1 | 2;

const cache = new Map<string, number>();   // club id → finished schedules

export function useClubCardLevel(clubId?: string | null): { level: CardLevel; finished: number; ready: boolean } {
  const { club } = useClub();
  const id = clubId ?? club?.id ?? null;
  const [finished, setFinished] = useState<number | null>(id ? cache.get(id) ?? null : 0);
  useEffect(() => {
    if (!id) { setFinished(0); return; }
    let live = true;
    setFinished(cache.get(id) ?? null);
    supabase.from('hoop_games').select('id', { count: 'exact', head: true })
      .eq('club_id', id).is('session_id', null).not('closed_at', 'is', null)
      .then(({ count, error }) => {
        if (!live || error) return;
        cache.set(id, count ?? 0);
        setFinished(count ?? 0);
      });
    return () => { live = false; };
  }, [id]);
  const n = finished ?? 0;
  return { level: n >= CARD2_AFTER_SCHEDULES ? 2 : 1, finished: n, ready: finished !== null };
}

/** The club's current card design for a player (or a forced level, e.g. the owner's preview). */
export const ClubCard: React.FC<TradingCardProps & { level?: CardLevel }> = ({ level, ...p }) => {
  const auto = useClubCardLevel();
  const l = level ?? auto.level;
  return l === 2 ? <RoyalCard {...p} /> : <TradingCard {...p} />;
};

/** Owner-only switch to try card 2 before the club unlocks it. Renders nothing for everyone else. */
export const OwnerCardPreview: React.FC<{ value: CardLevel | null; onChange: (v: CardLevel | null) => void }> = ({ value, onChange }) => {
  const { isOwner } = useClub();
  const { level, finished, ready } = useClubCardLevel();
  if (!isOwner || !ready || level >= 2) return null;
  const shown = value ?? level;
  return (
    <div className="rounded-2xl p-2.5 space-y-2 border border-[var(--hp)]/40" style={{ background: 'color-mix(in srgb, var(--hp) 6%, transparent)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black tracking-wider text-[var(--hp)]">OWNER PREVIEW</p>
        <div className="flex gap-1.5">
          {([1, 2] as CardLevel[]).map((n) => (
            <button key={n} onClick={() => onChange(n === level ? null : n)}
              className={`h-7 px-3 rounded-full text-[11px] font-bold border cursor-pointer ${shown === n ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>
              Card {n}{n === 2 ? ' · Royal Crest' : ''}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[#A8A29E] leading-snug">
        Only you can see this. Card 2 becomes everyone’s card after the club’s {CARD2_AFTER_SCHEDULES === 2 ? '2nd' : `${CARD2_AFTER_SCHEDULES}th`} schedule ends
        ({Math.min(finished, CARD2_AFTER_SCHEDULES)} of {CARD2_AFTER_SCHEDULES} done).
      </p>
    </div>
  );
};
