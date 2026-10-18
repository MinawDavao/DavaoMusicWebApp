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
  /** the club this card belongs to (badge top-left) */
  club?: { name: string; logo_url: string | null; oneofone_url?: string | null } | null;
}

/** White letters with a black stroke and a soft drop shadow (8-way text-shadow = a solid outline that also shows in saved pictures). */
export const whiteStroke = (w = 0.3, stroke = '#000000', glow = false): React.CSSProperties => {
  const o = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]
    .map(([x, y]) => `${cq(x * w)} ${cq(y * w)} 0 ${stroke}`).join(', ');
  // optional soft warm-gold glow around the letters (kept light)
  const g = glow ? `, 0 0 ${cq(1.2 + w * 3)} rgba(255,222,140,0.85), 0 0 ${cq(2.6 + w * 6)} rgba(255,196,80,0.45)` : '';
  return { color: '#FFFFFF', textShadow: `${o}, 0 ${cq(w + 0.35)} ${cq(0.5)} rgba(0,0,0,0.6)${g}` };
};

/** "LEVEL n CARD" — on every card design, so players see which card they're on (card n = their n-th finished schedule).
 *  tone 'royal': gold letters with a navy outline (card 2). */
const LEVEL_GOLD = 'linear-gradient(180deg, #FFF8DC 0%, #FFE08A 30%, #E0A93A 58%, #FFF1B8 80%, #C9902A 100%)';
export const LevelBadge: React.FC<{ n: number; scale?: number; glow?: boolean; tone?: 'white' | 'royal' }> = ({ n, scale = 1, glow = false, tone = 'white' }) => {
  const royal = (num: boolean): React.CSSProperties => ({
    background: LEVEL_GOLD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    filter: [
      `drop-shadow(0 0 ${cq(0.22 * scale)} #0A1A4A)`, `drop-shadow(0 0 ${cq(0.22 * scale)} #0A1A4A)`,
      `drop-shadow(0 ${cq(0.35 * scale)} ${cq(0.3 * scale)} rgba(0,0,0,0.6))`,
    ].join(' '),
  });
  const word = tone === 'royal' ? royal(false) : whiteStroke(0.22 * scale, '#000000', glow);
  const num = tone === 'royal' ? royal(true) : whiteStroke(0.32 * scale, '#000000', glow);
  return (
    <div className="flex flex-col items-center leading-none pointer-events-none select-none">
      <span className="font-hoop font-black" style={{ fontSize: cq(3.4 * scale), letterSpacing: cq(0.5 * scale), padding: `${cq(0.3)} ${cq(0.6)}`, ...word }}>LEVEL</span>
      <span style={{ fontFamily: '"Yellowtail", "Brush Script MT", cursive', fontSize: cq((tone === 'royal' ? 13.5 : 12) * scale), lineHeight: 0.95, padding: `0 ${cq(1.8 * scale)}`,
        ...(tone === 'royal' ? { marginTop: cq(-1.8 * scale), marginBottom: cq(-0.8 * scale) } : {}), ...num }}>{n}</span>
      <span className="font-hoop font-black" style={{ fontSize: cq(3.4 * scale), letterSpacing: cq(0.5 * scale), padding: `${cq(0.3)} ${cq(0.6)}`, ...word }}>CARD</span>
    </div>
  );
};

export const TradingCard: React.FC<TradingCardProps> = ({ person, card, stats, photoUrl, crop, onCropChange, club }) => {
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
  const clubName = (club?.name || 'Basketball Club').replace(/^hoop method\s+/i, '') || 'Basketball Club';
  const clubSize = clubName.length > 14 ? Math.max(2.6, 58 / clubName.length) : 4.2;

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
            <img src={club?.logo_url || '/hoop-ball.png'} alt="" className="object-cover bg-[#F6EFEC]" style={{ width: cq(11), height: cq(11), borderRadius: '50%', border: `${cq(0.5)} solid #FFD45A`, boxShadow: `0 0 ${cq(2)} rgba(255,200,70,0.8)` }} />
            <span className="font-hoop font-bold uppercase leading-none text-white" style={{ fontSize: cq(3.2), letterSpacing: cq(0.5), textShadow: '0 1px 3px rgba(0,0,0,0.9)', maxWidth: cq(52) }}>
              Hoop Method<br /><span className="block" style={{ color: '#FFD45A', fontSize: cq(clubSize), letterSpacing: cq(0.2), marginTop: cq(0.4) }}>{clubName}</span>
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
              <div className="ml-auto" style={{ marginBottom: cq(0.6), marginRight: cq(1) }}><LevelBadge n={1} scale={0.85} /></div>
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
    const css = await (await fetch('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,700;0,800;0,900;1,800;1,900&family=Yellowtail&display=swap')).text();
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

/** The card (the padded box around it, glow included) as a PNG. */
export async function cardBlob(node: HTMLElement): Promise<Blob> {
  const fontEmbedCSS = await cardFonts();
  // moving shine effects are left out of the picture (they'd be frozen mid-sweep)
  const opts = { pixelRatio: 3, cacheBust: true, fontEmbedCSS, backgroundColor: '#050508', filter: (n: HTMLElement) => !(n.dataset && n.dataset.fx === 'anim') };
  await toBlob(node, opts);   // first pass warms up images and fonts (Safari draws them only on the second pass)
  const blob = await toBlob(node, opts);
  if (!blob) throw new Error('Could not make the picture. Please try again.');
  return blob;
}

type ShareResult = 'shared' | 'downloaded' | 'cancelled';
/** Can this phone/browser hand a picture to other apps (Instagram, Facebook…) through its share menu? */
export function canSharePicture(blob: Blob, fileName: string): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try { return !!nav.canShare?.({ files: [new File([blob], fileName, { type: 'image/png' })] }); } catch { return false; }
}
/** Downloads the picture (computers, and phones without a share menu). */
export function downloadPicture(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/**
 * Opens the phone's share menu with the picture (Instagram, Facebook, Messenger… are listed there), or downloads it.
 * Must be called straight from a tap: phones refuse the share menu if seconds passed since the tap,
 * so make the picture first and call this from a second "Share" button.
 */
export async function shareOrDownload(blob: Blob, fileName: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (canSharePicture(blob, fileName)) {
    // files only: Instagram drops share sheets that also carry text
    try { await navigator.share({ files: [file] }); return 'shared'; }
    catch (e: any) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  downloadPicture(blob, fileName);
  return 'downloaded';
}

/** Turns the card into a PNG and opens the phone's share sheet (or downloads it on a computer). */
export async function saveCardImage(node: HTMLElement, fileName: string): Promise<ShareResult> {
  return shareOrDownload(await cardBlob(node), fileName);
}

export type SocialFormat = 'story' | 'post';
/**
 * The card on a social-media sized picture:
 *   story 1080×1920 (9:16 — Facebook & Instagram stories)   post 1080×1350 (4:5 — Instagram feed)
 * Dark background with a glow in the club colour, club name on top, minawdavao.com at the bottom.
 * Text stays out of the top/bottom 250px of a story, where Instagram puts its own buttons.
 */
export async function socialPicture(node: HTMLElement, format: SocialFormat, opts: { clubName?: string | null; color?: string }): Promise<Blob> {
  const W = 1080, H = format === 'story' ? 1920 : 1350;
  const img = await createImageBitmap(await cardBlob(node));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Could not make the picture. Please try again.');
  const color = /^#[0-9a-f]{6}$/i.test(opts.color || '') ? opts.color! : '#F28C14';   // 6-digit hex (alpha is appended below)

  // background
  ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.62);
  glow.addColorStop(0, color + '55'); glow.addColorStop(0.45, color + '18'); glow.addColorStop(1, '#05050800');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // card (the padded box already has its own dark rounded background)
  const topText = format === 'story' ? 300 : 110, bottomText = format === 'story' ? H - 270 : H - 52;
  const room = { w: W - (format === 'story' ? 60 : 200), h: (bottomText - (format === 'story' ? 205 : 170)) - (topText + 40) };
  const k = Math.min(room.w / img.width, room.h / img.height);
  const cw = img.width * k, ch = img.height * k;
  const cy = topText + 40 + (room.h - ch) / 2;
  ctx.drawImage(img, (W - cw) / 2, cy, cw, ch);

  // text
  const font = (style: string, px: number) => `${style} ${px}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  try { await Promise.all([document.fonts.load(font('italic 900', 60)), document.fonts.load(font('700', 30))]); } catch { /* use the fallback font */ }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const club = (opts.clubName || 'Hoop Method').toUpperCase();
  let px = format === 'story' ? 64 : 54;
  ctx.font = font('italic 900', px);
  while (ctx.measureText(club).width > W - 140 && px > 30) { px -= 2; ctx.font = font('italic 900', px); }
  ctx.fillStyle = '#FFFFFF'; ctx.fillText(club, W / 2, topText);
  // invite: "Get your own Player Card. Sign up to MINAWDAVAO.COM and join <club>." — website big and bold
  const site = format === 'story' ? 78 : 62, small = format === 'story' ? 34 : 28;
  const fit = (text: string, style: string, size: number) => {
    let px = size; ctx.font = font(style, px);
    while (ctx.measureText(text).width > W - 120 && px > 18) { px -= 1; ctx.font = font(style, px); }
  };
  const l3 = bottomText, l2 = l3 - small - 14, l1 = l2 - site - 8;
  fit('GET YOUR OWN PLAYER CARD! SIGN UP TO', '700', small); ctx.fillStyle = '#FFFFFF';
  ctx.fillText('GET YOUR OWN PLAYER CARD! SIGN UP TO', W / 2, l1);
  ctx.font = font('italic 900', site); ctx.fillStyle = color;
  ctx.shadowColor = color + '88'; ctx.shadowBlur = 24;
  ctx.fillText('MINAWDAVAO.COM', W / 2, l2);
  ctx.shadowBlur = 0;
  const join = `AND JOIN ${club}`;
  fit(join, '700', small); ctx.fillStyle = '#D6D3D1';
  ctx.fillText(join, W / 2, l3);

  const out = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
  if (!out) throw new Error('Could not make the picture. Please try again.');
  return out;
}
