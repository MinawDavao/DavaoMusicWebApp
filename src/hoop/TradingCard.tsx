import React from 'react';
import { toBlob } from 'html-to-image';
import { Move } from 'lucide-react';
import { Photo, cropOf, useDragCrop, type CardCrop } from '../components/CardBackground';
import { fmt1, type HoopCard, type HoopPerson, type HoopStats } from './lib';

/**
 * "My Card": a glowing trading card (5:7, like a playing card) with the player's card photo
 * fading down into gold stats. Every size is in cqw (percent of the card width), so the card
 * looks the same on any phone and in the saved image.
 */

const GOLD_TEXT: React.CSSProperties = {
  background: 'linear-gradient(180deg, #FFF6C9 0%, #FFD45A 38%, #F5A623 70%, #C9780A 100%)',
  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  filter: 'drop-shadow(0 0.4cqw 0 rgba(0,0,0,0.55)) drop-shadow(0 0 2.2cqw rgba(255,190,60,0.45))',
};
const POS_SHORT: Record<string, string> = {
  'Point Guard': 'PG', 'Shooting Guard': 'SG', Guard: 'G', 'Small Forward': 'SF', 'Power Forward': 'PF',
  Forward: 'F', Center: 'C', 'All-around': 'ALL',
};
const FADE = 'linear-gradient(180deg, #000 0%, #000 52%, rgba(0,0,0,0.55) 74%, transparent 100%)';
const cq = (n: number) => `${n}cqw`;

export interface TradingCardProps {
  person: Pick<HoopPerson, 'display_name' | 'avatar_url'>;
  card: Pick<HoopCard, 'jersey_number' | 'position'> & { card_photo_url?: string | null; card_photo_crop?: any };
  stats: HoopStats | null;
  /** editor: show this photo/crop instead of the saved one, and let the photo be dragged */
  photoUrl?: string | null;
  crop?: CardCrop;
  onCropChange?: (c: CardCrop) => void;
}

export const TradingCard: React.FC<TradingCardProps> = ({ person, card, stats, photoUrl, crop, onCropChange }) => {
  const url = photoUrl !== undefined ? photoUrl : (card.card_photo_url || person.avatar_url);
  const c = crop || cropOf(card.card_photo_url ? card.card_photo_crop : null);
  const editing = !!onCropChange;
  const drag = useDragCrop(c, onCropChange || (() => {}));

  const parts = person.display_name.trim().split(/\s+/);
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const s = stats;
  const pos = card.position ? (POS_SHORT[card.position] || card.position.slice(0, 3).toUpperCase()) : '';
  const lastSize = last.length > 9 ? Math.max(6, 92 / last.length) : 10.5;
  const firstSize = first.length > 22 ? Math.max(3, 100 / first.length) : 4.6;

  return (
    <div className="relative w-full aspect-[5/7] select-none" style={{ containerType: 'inline-size' }}>
      {/* glowing gold → orange → pink frame */}
      <div className="absolute inset-0" style={{
        borderRadius: cq(6), padding: cq(1.1),
        background: 'linear-gradient(145deg, #FFE27A 0%, #F7A51C 26%, #FF5E7E 52%, #9D5CFF 74%, #FFD24A 100%)',
        boxShadow: `0 0 ${cq(3)} rgba(255,196,64,0.75), 0 0 ${cq(9)} rgba(255,120,60,0.45), 0 0 ${cq(16)} rgba(170,90,255,0.30)`,
      }}>
        <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: cq(5), background: '#08070D' }}>
          {/* lights */}
          <span className="absolute pointer-events-none" style={{ left: '-25%', top: '-15%', width: '85%', height: '60%', background: 'radial-gradient(closest-side, rgba(255,140,30,0.55), transparent)' }} />
          <span className="absolute pointer-events-none" style={{ right: '-30%', top: '8%', width: '90%', height: '65%', background: 'radial-gradient(closest-side, rgba(225,60,170,0.50), transparent)' }} />
          <span className="absolute pointer-events-none" style={{ left: '-30%', top: '38%', width: '80%', height: '55%', background: 'radial-gradient(closest-side, rgba(40,160,255,0.40), transparent)' }} />
          <span className="absolute pointer-events-none" style={{ right: '-20%', bottom: '-12%', width: '90%', height: '50%', background: 'radial-gradient(closest-side, rgba(255,200,60,0.30), transparent)' }} />
          {/* light streaks */}
          {[18, 46, 71].map((l, i) => (
            <span key={l} className="absolute pointer-events-none" style={{
              left: `${l}%`, top: '-10%', width: cq(i === 1 ? 1.4 : 0.7), height: '75%', transform: 'rotate(28deg)', transformOrigin: 'top',
              background: 'linear-gradient(180deg, transparent, rgba(255,235,190,0.55), transparent)', filter: `blur(${cq(0.3)})`,
            }} />
          ))}
          {/* court lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
            <g fill="none" stroke="rgba(255,210,120,0.10)" strokeWidth="0.35">
              <circle cx="50" cy="140" r="30" /><circle cx="50" cy="140" r="12" />
              <path d="M8 140 V96 A42 42 0 0 1 92 96 V140" />
              <path d="M0 70 H100" />
            </g>
          </svg>

          {/* the photo, fading down into the stats */}
          <div
            ref={editing ? drag.box : undefined}
            {...(editing ? drag.handlers : {})}
            role={editing ? 'slider' : undefined}
            tabIndex={editing ? 0 : undefined}
            aria-label={editing ? 'Card photo position. Drag, or use the arrow keys.' : undefined}
            aria-valuetext={editing ? `${Math.round(c.x)}% across, ${Math.round(c.y)}% down` : undefined}
            className={`absolute inset-x-0 top-0 overflow-hidden ${editing ? `touch-none outline-none ${drag.active ? 'cursor-grabbing' : 'cursor-grab'}` : ''}`}
            style={{ height: '76%', maskImage: drag.active ? undefined : FADE, WebkitMaskImage: drag.active ? undefined : FADE }}
          >
            {url
              ? <Photo url={url} crop={c} />
              : <div className="absolute inset-0 flex items-center justify-center font-hoop italic font-black text-white/15" style={{ fontSize: cq(60) }}>{person.display_name[0]?.toUpperCase()}</div>}
          </div>

          {/* neon inner frame */}
          <span className="absolute pointer-events-none" style={{
            inset: cq(3), borderRadius: cq(4), border: `${cq(0.55)} solid rgba(255,214,90,0.95)`,
            boxShadow: `0 0 ${cq(1.6)} rgba(255,200,70,0.9), inset 0 0 ${cq(1.6)} rgba(255,200,70,0.55)`,
          }} />
          {/* corner accents */}
          {[{ left: cq(1.6), top: '22%' }, { right: cq(1.6), top: '22%' }, { left: cq(1.6), bottom: '18%' }, { right: cq(1.6), bottom: '18%' }].map((p, i) => (
            <span key={i} className="absolute pointer-events-none" style={{ ...p, width: cq(1), height: '12%', borderRadius: cq(1), background: '#FFE38A', boxShadow: `0 0 ${cq(2)} #FFB52E` }} />
          ))}

          {/* club badge */}
          <div className="absolute flex items-center pointer-events-none" style={{ left: cq(6.5), top: cq(6.5), gap: cq(2) }}>
            <img src="/hoop-method-logo.jpg" alt="" className="object-cover" style={{ width: cq(11), height: cq(11), borderRadius: '50%', border: `${cq(0.5)} solid #FFD45A`, boxShadow: `0 0 ${cq(2)} rgba(255,200,70,0.8)` }} />
            <span className="font-hoop font-bold uppercase leading-none text-white" style={{ fontSize: cq(3.2), letterSpacing: cq(0.5), textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
              Sunday<br /><span style={{ color: '#FFD45A', fontSize: cq(4.2) }}>Hoop Method</span>
            </span>
          </div>

          {/* jersey number + position */}
          <div className="absolute text-right pointer-events-none" style={{ right: cq(7), top: cq(5) }}>
            <p className="font-hoop italic font-black leading-none" style={{ fontSize: cq(15), color: 'transparent', WebkitTextStroke: `${cq(0.5)} #FFD45A`, filter: `drop-shadow(0 0 ${cq(1.5)} rgba(255,190,60,0.8))` }}>
              {card.jersey_number ?? ''}
            </p>
            {pos && <p className="font-hoop font-bold text-white leading-none" style={{ fontSize: cq(4.2), letterSpacing: cq(0.6), marginTop: cq(0.8), textShadow: '0 1px 4px #000' }}>{pos}</p>}
          </div>

          {/* name + stats */}
          <div className="absolute pointer-events-none" style={{ left: cq(7), right: cq(7), bottom: cq(6.5) }}>
            {first && <p className="font-hoop font-bold uppercase text-white leading-none whitespace-nowrap" style={{ fontSize: cq(firstSize), letterSpacing: cq(0.6), textShadow: '0 2px 6px #000' }}>{first}</p>}
            <p className="font-hoop italic font-black uppercase text-white leading-[0.95] whitespace-nowrap" style={{ fontSize: cq(lastSize), textShadow: `0 ${cq(0.5)} ${cq(1.5)} #000, 0 0 ${cq(4)} rgba(255,150,60,0.55)` }}>{last}</p>

            <div className="flex items-end" style={{ gap: cq(2.5), marginTop: cq(1.5) }}>
              <p className="font-hoop italic font-black leading-[0.82]" style={{ ...GOLD_TEXT, fontSize: cq(25) }}>{fmt1(s?.ppg)}</p>
              <div className="flex flex-col items-center justify-center font-hoop font-black leading-none" style={{
                marginBottom: cq(1.6), padding: `${cq(1.2)} ${cq(1.6)}`, borderRadius: cq(1.5), fontSize: cq(4.2), letterSpacing: cq(0.3),
                color: '#1A1205', background: 'linear-gradient(180deg, #FFE98A, #F5A623)', boxShadow: `0 0 ${cq(2.5)} rgba(255,190,60,0.7)`,
              }}>
                <span>P</span><span>P</span><span>G</span>
              </div>
            </div>

            <div className="grid grid-cols-4" style={{ marginTop: cq(2.4), paddingTop: cq(2), borderTop: `${cq(0.3)} solid rgba(255,212,90,0.55)` }}>
              {([['RPG', s?.rpg], ['APG', s?.apg], ['SPG', s?.spg], ['BPG', s?.bpg]] as [string, number | undefined][]).map(([k, v], i) => (
                <div key={k} className="text-center" style={{ borderLeft: i ? `${cq(0.3)} solid rgba(255,212,90,0.30)` : undefined }}>
                  <p className="font-hoop font-black leading-none" style={{ ...GOLD_TEXT, fontSize: cq(8) }}>{fmt1(v)}</p>
                  <p className="font-hoop font-bold leading-none text-white/80" style={{ fontSize: cq(3), letterSpacing: cq(0.5), marginTop: cq(0.8) }}>{k}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between font-hoop font-bold uppercase" style={{ marginTop: cq(2.6), fontSize: cq(3), letterSpacing: cq(0.4) }}>
              <span className="text-white/85">{s?.games ?? 0} GP · {s ? `${s.wins}-${s.losses}` : '0-0'} · Best {s?.best_pts ?? 0}</span>
              <span style={{ color: '#FFD45A' }}>minawdavao.com</span>
            </div>
          </div>

          {editing && (
            <span className="absolute flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 text-[10px] font-bold text-white pointer-events-none" style={{ left: '50%', top: '34%', transform: 'translateX(-50%)' }}>
              <Move className="w-3 h-3" />{drag.active ? 'Moving…' : 'Drag the photo'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- saving the card as a picture

let fontCss: Promise<string> | null = null;
/** The card's fonts as embedded CSS, so the saved picture uses them too (latin letters only, to stay small). */
function cardFonts(): Promise<string> {
  if (fontCss) return fontCss;
  fontCss = (async () => {
    const css = await (await fetch('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,800;0,900;1,800;1,900&display=swap')).text();
    const blocks = css.split('/*').filter((b) => b.trim().startsWith('latin */'));
    const out: string[] = [];
    for (const b of blocks) {
      const face = b.slice(b.indexOf('@font-face'));
      const m = face.match(/url\((https:[^)]+)\)/);
      if (!m) continue;
      const buf = await (await fetch(m[1])).blob();
      const data = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(buf); });
      out.push(face.replace(m[1], data));
    }
    return out.join('\n');
  })().catch(() => { fontCss = null; return ''; });
  return fontCss;
}

/** Turns the card into a PNG and opens the phone's share sheet (or downloads it on a computer). */
export async function saveCardImage(node: HTMLElement, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const fontEmbedCSS = await cardFonts();
  const opts = { pixelRatio: 3, cacheBust: true, fontEmbedCSS, backgroundColor: '#050508' };
  await toBlob(node, opts);   // first pass warms up images and fonts (Safari draws them only on the second pass)
  const blob = await toBlob(node, opts);
  if (!blob) throw new Error('Could not make the picture. Please try again.');
  const file = new File([blob], fileName, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: 'My Sunday Hoop Method card' }); return 'shared'; }
    catch (e: any) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
