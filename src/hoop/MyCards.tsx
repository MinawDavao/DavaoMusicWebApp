import React, { useEffect, useState } from 'react';
import { Check, Crown, PenLine } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { ErrorNote } from '../components/ui';
import { CARD_LEVELS, ClubCard, announceSigned, choiceLevel, useMemberSchedules, type CardLevel } from './ClubCard';
import { SignCard } from './SignCard';
import type { TradingCardProps } from './TradingCard';
import { hbtn } from './lib';
const hbtnPrimary = hbtn.primary, hbtnGhost = hbtn.ghost;

/**
 * "My cards" on a player's OWN My Card: every card they own — each level card they've reached, plus any 1-of-1 —
 * and which one their My Card shows. (Other people always see the player's earned level.)
 */
export const MyCards: React.FC<{ memberId: string; choice: string | null | undefined; onChanged: () => void } & Omit<TradingCardProps, 'photoUrl' | 'crop' | 'onCropChange'>> = ({ memberId, choice, onChanged, ...card }) => {
  const { level, ready } = useMemberSchedules(memberId);
  const [ones, setOnes] = useState<{ id: string; won_at: string; signature_url: string | null }[]>([]);
  const [signing, setSigning] = useState<{ id: string; current: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('hoop_one_of_ones').select('id, won_at, signature_url').eq('member_id', memberId).order('won_at')
      .then(({ data }) => setOnes((data as any[]) || []));
  }, [memberId]);
  if (!ready) return null;

  const owned: { key: string; level: CardLevel; label: string; oneId?: string; signed?: boolean; sig?: string | null }[] = [
    ...CARD_LEVELS.filter((l) => l.n <= level.n).map((l) => ({ key: `level${l.n}`, level: l.n as CardLevel, label: `Level ${l.n}` })),
    ...ones.map((o, i) => ({ key: `one:${o.id}`, level: 'one' as CardLevel, label: ones.length > 1 ? `1 of 1 · #${i + 1}` : '1 of 1', oneId: o.id, signed: !!o.signature_url, sig: o.signature_url })),
  ];
  const picked = choiceLevel(choice);
  const current = choice && owned.some((o) => o.key === choice) ? choice : `level${level.n}`;
  if (owned.length < 2 && !ones.length) return null;   // only one card so far — nothing to choose yet

  const pick = async (key: string) => {
    if (key === current || busy) return;
    setBusy(key); setErr(null);
    // picking your highest level = back to "follow my level" (so the next level shows up by itself)
    const value = key === `level${level.n}` ? null : key;
    const { error } = await supabase.from('hoop_members').update({ card_choice: value }).eq('id', memberId);
    setBusy(null);
    if (error) return setErr(errorMessage(error));
    onChanged();
  };

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between">
        <h2 className="font-hoop italic font-black text-[22px] uppercase text-white leading-none">My cards <span className="text-[var(--hp)]">{owned.length}</span></h2>
        <p className="text-[11px] text-[#A8A29E]">Tap a card to use it</p>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {owned.map((o) => {
          const on = o.key === current;
          return (
            <button key={o.key} onClick={() => pick(o.key)} disabled={!!busy} aria-pressed={on}
              className={`relative flex-shrink-0 w-[30%] min-w-[96px] snap-start rounded-xl p-1.5 text-left cursor-pointer border transition ${on ? 'border-[var(--hp)] bg-[var(--hp)]/10' : 'border-white/10 bg-white/[0.03] hover:border-white/30'}`}>
              <div className="pointer-events-none"><ClubCard {...card} level={o.level} oneId={o.oneId} /></div>
              <span className="mt-1.5 flex items-center justify-between gap-1">
                <span className={`flex items-center gap-1 text-[11px] font-bold ${o.level === 'one' ? 'text-[#F6C94C]' : 'text-white'}`}>{o.level === 'one' && <Crown className="w-3 h-3" />}{o.label}</span>
                {on ? <Check className="w-3.5 h-3.5 text-[var(--hp)]" /> : busy === o.key ? <span className="text-[10px] text-[#A8A29E]">…</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {owned.filter((o) => o.oneId).map((o) => (
        <button key={`sign-${o.oneId}`} onClick={() => setSigning({ id: o.oneId!, current: o.sig ?? null })}
          className={`${o.signed ? hbtnGhost : hbtnPrimary} w-full !py-2.5`}>
          <PenLine className="w-4 h-4" />{o.signed ? 'Re-sign your 1-1 card' : 'Sign your 1-1 card now'}{ones.length > 1 ? ` (${o.label.split('· ')[1]})` : ''}
        </button>
      ))}
      {signing && <SignCard {...card} oneId={signing.id} current={signing.current} onClose={() => setSigning(null)}
        onSaved={(url) => { announceSigned(signing.id, url); setOnes((l) => l.map((x) => (x.id === signing.id ? { ...x, signature_url: url } : x))); }} />}
      {picked === 'one' && <p className="text-[11px] text-[#A8A29E]">Your 1-of-1 shows on your own My Card. Other players see your Level card.</p>}
      <ErrorNote text={err} />
    </section>
  );
};
