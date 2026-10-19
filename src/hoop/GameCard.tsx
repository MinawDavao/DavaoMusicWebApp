import React, { useEffect, useRef, useState } from 'react';
import { Download, IdCard, Share2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { ErrorNote, Spinner } from '../components/ui';
import { ClubCard, choiceLevel } from './ClubCard';
import { cardBlob, socialPicture, type SocialFormat } from './TradingCard';
import { ShareSheet, type ReadyPicture } from './ShareSheet';
import { H, MEMBER_COLS, gameDate, hbtn, oneGameStats, personOf, useClub, type HoopMember } from './lib';

/** What a one-game card needs to know about the game. */
export interface GameCardInfo {
  title: string;        // "Sunday Run 2"
  gameNo: number;       // Game 1, 2, 3… of that schedule
  startsAt: string;
  result: 'W' | 'L' | 'T';
  mine: number; theirs: number;
  line: { pts: number; reb: number; ast: number; stl: number; blk: number; threes: number; tov?: number; foul?: number } | null | undefined;
}

/**
 * "My card for this game": the player's card with ONE game's numbers (not their career averages),
 * to save or share on Facebook / Instagram.
 */
export const GameCardModal: React.FC<{ memberId: string; info: GameCardInfo; onClose: () => void }> = ({ memberId, info, onClose }) => {
  const { user } = useAuth();
  const { club } = useClub();
  const [m, setM] = useState<HoopMember | null | undefined>(undefined);
  const [busy, setBusy] = useState<SocialFormat | 'card' | null>(null);
  const [ready, setReady] = useState<ReadyPicture | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const shot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    supabase.from('hoop_members').select(MEMBER_COLS).eq('id', memberId).maybeSingle().then(({ data }) => { if (live) setM((data as any) || null); });
    return () => { live = false; };
  }, [memberId]);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [onClose]);

  const short = info.title.toUpperCase();
  const label = `${short} · G${info.gameNo} · ${info.result} ${info.mine}-${info.theirs}`;
  const stats = oneGameStats(memberId, info.line, label, info.result);
  const name = m ? personOf(m).display_name : '';
  const file = (k: string) => `hoop-game${info.gameNo}-${k}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  // a picked 1-of-1 has no stats on it — game cards use the player's level card (or the level they picked)
  const choice = m && typeof choiceLevel(m.card_choice) === 'number' ? m.card_choice : null;
  const isMe = !!user && m?.profile_id === user.id;

  const make = async (kind: SocialFormat | 'card') => {
    if (!shot.current || shot.current.querySelector('[data-card-loading]') || busy) return;
    setBusy(kind); setErr(null);
    try {
      const blob = kind === 'card' ? await cardBlob(shot.current)
        : await socialPicture(shot.current, kind, { clubName: club?.name, color: getComputedStyle(shot.current).getPropertyValue('--hp').trim() });
      setReady({ blob, kind, fileName: file(kind) });
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(null);
  };

  return (<>
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="max-w-[440px] mx-auto px-4 py-5 space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Game card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.25em] text-[var(--hp)]"><IdCard className="w-3.5 h-3.5" />GAME CARD</p>
            <p className="font-hoop italic font-black text-[24px] uppercase text-white leading-none truncate">{info.title} · Game {info.gameNo}</p>
            <p className="text-[11px] text-[#A8A29E] mt-1">{gameDate(info.startsAt)} · {info.result === 'W' ? 'Won' : info.result === 'L' ? 'Lost' : 'Tied'} {info.mine}-{info.theirs} · this game only</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 flex-shrink-0 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {m === undefined ? <Spinner label="Loading card…" /> : m === null ? <p className="text-center text-[#A8A29E] py-8">This player isn’t available.</p> : (
          <>
            {/* what gets saved: the card + which game it was */}
            <div ref={shot} className="px-[7%] pt-[6%] pb-[8%] rounded-[28px]" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #2A1606 0%, #0B0710 55%, #050508 100%)' }}>
              <p className="text-center font-hoop font-black uppercase leading-none mb-[5%]" style={{ fontSize: 'clamp(13px, 4.2vw, 18px)', letterSpacing: '0.18em', color: H.orange }}>
                {info.title} · Game {info.gameNo} · {info.result} {info.mine}-{info.theirs}
              </p>
              <ClubCard memberId={m.id} person={personOf(m)} card={m} stats={stats} club={club} choice={choice} />
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              {([['PTS', stats.pts], ['REB', stats.reb], ['AST', stats.ast], ['STL', stats.stl]] as [string, number][]).map(([k, v]) => (
                <div key={k} className="rounded-xl py-2 border border-white/10" style={{ background: H.surface }}>
                  <p className="font-hoop font-black text-[22px] text-white leading-none">{v}</p>
                  <p className="text-[10px] font-bold tracking-wider text-[#A8A29E] mt-0.5">{k}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl p-2.5 space-y-2 border border-white/10" style={{ background: H.surface }}>
              <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[#E7E5E4]"><Share2 className="w-3.5 h-3.5 text-[var(--hp)]" />{isMe ? 'SHARE MY GAME' : 'SAVE THIS GAME CARD'}</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => make('card')} disabled={!!busy} className={`${hbtn.ghost} !py-2.5 !text-xs`}><Download className="w-4 h-4" />{busy === 'card' ? '…' : 'Save'}</button>
                <button onClick={() => make('story')} disabled={!!busy} className={`${hbtn.primary} !py-2.5 !text-xs`}>{busy === 'story' ? 'Making…' : 'Story'}</button>
                <button onClick={() => make('post')} disabled={!!busy} className={`${hbtn.primary} !py-2.5 !text-xs`}>{busy === 'post' ? 'Making…' : 'Post'}</button>
              </div>
              <p className="text-[10px] text-[#78716C] text-center leading-snug">Story = Facebook / Instagram story · Post = Instagram feed. We make the picture first, then ask before opening the app.</p>
            </div>
            <ErrorNote text={err} />
          </>
        )}
      </div>
    </div>
    {ready && <ShareSheet pic={ready} onClose={() => setReady(null)} />}
  </>);
};
