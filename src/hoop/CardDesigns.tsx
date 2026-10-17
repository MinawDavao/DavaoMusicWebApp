import React, { useId, useMemo, useRef } from 'react';
import { Photo, cropOf, useDragCrop } from '../components/CardBackground';
import { fmt1, type HoopStats } from './lib';
import { LevelBadge, TradingCard, whiteStroke, type TradingCardProps } from './TradingCard';

/**
 * Hoop Method card SERIES — a player's card gets fancier the more they play.
 *   1 Glow → 2 Hardwood → 3 Neon Night → 4 Holo Chrome → 5 Black Gold → 6 Supernova → 7 Royal Crest
 * Every design takes the same props as TradingCard. All sizes are in cqw (percent of the card width) and the
 * card is laid out on a 100 × 140 grid, so 1 grid unit = 1cqw — identical on any phone and in the saved picture.
 * Original designs (no real card brand's look, names or logos).
 */

export interface CardSeries { n: number; key: string; name: string; tagline: string; Comp: React.FC<TradingCardProps>; unlock?: string }

// ------------------------------------------------------------------------------------------------ shared bits
const cq = (n: number) => `${n}cqw`;
const POS: Record<string, string> = {
  'Point Guard': 'PG', 'Shooting Guard': 'SG', Guard: 'G', 'Small Forward': 'SF', 'Power Forward': 'PF', Forward: 'F', Center: 'C', 'All-around': 'ALL',
};
/** Deterministic random numbers (the same card always looks the same). */
const rng0 = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
/** Seeds are scrambled first, so nearby seeds don't line things up in a row. */
const rng = (seed: number) => { const r = rng0((Math.floor(Math.abs(Math.sin(seed * 12.9898 + 78.233) * 43758.5453) * 1e4) % 2147483646) + 1); r(); r(); return r; };
const useSvgId = () => useId().replace(/[^a-zA-Z0-9]/g, '');

function useFace(p: TradingCardProps) {
  const { person, card, stats, photoUrl, crop, club } = p;
  const url = photoUrl !== undefined ? photoUrl : (card.card_photo_url || person.avatar_url);
  const c = crop || cropOf(card.card_photo_url ? card.card_photo_crop : null);
  const parts = person.display_name.trim().split(/\s+/);
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const clubName = (club?.name || 'Basketball Club').replace(/^hoop method\s+/i, '') || 'Basketball Club';
  return {
    url, c, first, last, clubName, logo: club?.logo_url || '/hoop-ball.png',
    num: card.jersey_number ?? null,
    pos: card.position ? (POS[card.position] || card.position.slice(0, 3).toUpperCase()) : '',
    s: stats as HoopStats | null,
    initial: person.display_name[0]?.toUpperCase() || '?',
    /** shrink long last names so they always fit */
    fit: (max: number, room: number) => (last.length > room ? Math.max(max * 0.5, (max * room) / last.length) : max),
  };
}
const statRow = (s: HoopStats | null) => ([['RPG', s?.rpg], ['APG', s?.apg], ['SPG', s?.spg], ['BPG', s?.bpg]] as [string, number | undefined][]);
const footer = (s: HoopStats | null) => `${s?.games ?? 0} GP · ${s ? `${s.wins}-${s.losses}` : '0-0'} · BEST ${s?.best_pts ?? 0}`;

const Shell: React.FC<{ children: React.ReactNode; radius?: number; shadow?: string; glow?: string }> = ({ children, radius = 5, shadow = 'rgba(0,0,0,0.6)', glow }) => (
  <div className="relative w-full aspect-[5/7] select-none" style={{ containerType: 'inline-size' }}>
    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: cq(radius), boxShadow: `${glow ? `${glow}, ` : ''}0 ${cq(2.5)} ${cq(7)} ${shadow}` }}>{children}</div>
  </div>
);
/** Place something on the 100 × 140 grid. */
const At: React.FC<{ x?: number; y?: number; r?: number; b?: number; w?: number; h?: number; style?: React.CSSProperties; className?: string; children?: React.ReactNode }> = ({ x, y, r, b, w, h, style, className = '', children }) => (
  <div className={`absolute ${className}`} style={{ left: x != null ? cq(x) : undefined, top: y != null ? cq(y) : undefined, right: r != null ? cq(r) : undefined, bottom: b != null ? cq(b) : undefined, width: w != null ? cq(w) : undefined, height: h != null ? cq(h) : undefined, ...style }}>{children}</div>
);
const PhotoOr: React.FC<{ url: string | null | undefined; c: ReturnType<typeof cropOf>; initial: string; color?: string }> = ({ url, c, initial, color = 'rgba(255,255,255,0.15)' }) =>
  url ? <Photo url={url} crop={c} />
    : <div className="absolute inset-0 flex items-center justify-center font-hoop italic font-black" style={{ fontSize: cq(60), color }}>{initial}</div>;

/** Glossy glare that follows the finger when the card is tilted (falls back to a fixed spot). */
const Glare: React.FC<{ strength?: number; tint?: string }> = ({ strength = 0.38, tint = '255,255,255' }) => (
  <span aria-hidden className="absolute inset-0 pointer-events-none" style={{
    background: `radial-gradient(60% 45% at var(--gx, 28%) var(--gy, 18%), rgba(${tint},${strength}) 0%, rgba(${tint},${strength * 0.35}) 35%, rgba(${tint},0) 70%)`,
    mixBlendMode: 'screen',
  }} />
);
/** A soft light band that sweeps across the card (on screen only). */
const Sheen: React.FC<{ strength?: number }> = ({ strength = 0.45 }) => (
  <span aria-hidden data-fx="anim" className="absolute inset-0 pointer-events-none overflow-hidden" style={{ borderRadius: 'inherit' }}>
    <span className="hoop-sheen absolute top-0 bottom-0" style={{ left: 0, width: '38%', background: `linear-gradient(90deg, transparent, rgba(255,255,255,${strength * 0.5}) 40%, rgba(255,255,255,${strength}) 50%, rgba(255,255,255,${strength * 0.5}) 60%, transparent)`, mixBlendMode: 'overlay' }} />
  </span>
);
/** Fine print texture, like card stock. */
const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.12 }) => {
  const id = useSvgId();
  return (
    <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity, mixBlendMode: 'overlay' }}>
      <filter id={`g${id}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter={`url(#g${id})`} />
    </svg>
  );
};
/** Four-point sparkle stars. */
const Sparkles: React.FC<{ seed: number; n: number; color?: string; area?: [number, number, number, number]; size?: [number, number]; twinkle?: boolean }> = ({ seed, n, color = '#fff', area = [0, 0, 100, 140], size = [0.8, 2.4], twinkle = true }) => {
  const stars = useMemo(() => { const r = rng(seed); return Array.from({ length: n }, () => ({ x: area[0] + r() * (area[2] - area[0]), y: area[1] + r() * (area[3] - area[1]), s: size[0] + r() * (size[1] - size[0]), d: r() * 2.6 })); }, [seed, n, area, size]);
  return (
    <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 140" preserveAspectRatio="none">
      {stars.map((s, i) => (
        <path key={i} className={twinkle ? 'hoop-twinkle' : undefined} style={{ animationDelay: `${s.d}s` }} fill={color}
          d={`M${s.x} ${s.y - s.s} L${s.x + s.s * 0.18} ${s.y - s.s * 0.18} L${s.x + s.s} ${s.y} L${s.x + s.s * 0.18} ${s.y + s.s * 0.18} L${s.x} ${s.y + s.s} L${s.x - s.s * 0.18} ${s.y + s.s * 0.18} L${s.x - s.s} ${s.y} L${s.x - s.s * 0.18} ${s.y - s.s * 0.18}Z`} />
      ))}
    </svg>
  );
};
/** Thin foil border around the whole card. */
const FoilEdge: React.FC<{ gradient: string; width?: number; radius?: number }> = ({ gradient, width = 1.1, radius = 5 }) => (
  <span aria-hidden className="absolute inset-0 pointer-events-none" style={{
    borderRadius: cq(radius), padding: cq(width), background: gradient,
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude',
  }} />
);

const GOLD = 'linear-gradient(135deg, #FFF6CF 0%, #F0C75E 18%, #A9781F 35%, #FFE89A 50%, #B8862B 66%, #FFF1B8 82%, #9A6B18 100%)';
const GOLD_V = 'linear-gradient(180deg, #FFF6CF 0%, #F2CF6E 30%, #B8872A 55%, #FFE7A0 75%, #9C6E1E 100%)';
const CHROME = 'linear-gradient(135deg, #FFFFFF 0%, #8F99A6 14%, #F4F7FA 28%, #6E7884 44%, #E8EDF2 58%, #7D8794 74%, #FFFFFF 88%, #A3ADB9 100%)';
const RAINBOW = 'linear-gradient(90deg, #FF9AD5, #FFC48C, #FFF59A, #A8FFB4, #9AE6FF, #B4A8FF, #FF9AD5)';
const textFill = (bg: string): React.CSSProperties => ({ background: bg, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' });

// =====================================================================================================
// SERIES 2 · HARDWOOD — polished arena floor, glass backboard with rim & net, steel nameplate, LED scoreboard
// =====================================================================================================
export const HardwoodCard: React.FC<TradingCardProps> = (p) => {
  const f = useFace(p);
  const id = useSvgId();
  const planks = useMemo(() => {
    const r = rng(77), out: { x: number; y: number; h: number; c: string; g: number[] }[] = [];
    const tones = ['#D9A05F', '#CC9152', '#E2AC6C', '#C2864A', '#D49858', '#C88D4F', '#DDA766'];
    for (let col = 0; col < 14; col++) {
      let y = -r() * 30;
      while (y < 140) { const h = 22 + r() * 34; out.push({ x: col * (100 / 14), y, h, c: tones[Math.floor(r() * tones.length)], g: [r(), r(), r()] }); y += h; }
    }
    return out;
  }, []);
  const W = 100 / 14;
  const ledGhost: React.CSSProperties = { position: 'absolute', inset: 0, color: 'rgba(255,170,40,0.08)', textShadow: 'none' };
  const dots = (c: string): React.CSSProperties => ({ backgroundImage: `radial-gradient(circle, transparent 62%, ${c} 66%)`, backgroundSize: `${cq(0.55)} ${cq(0.55)}`, opacity: 0.55 });
  const ghost = (v: string) => v.replace(/\d/g, '8');
  return (
    <Shell>
      {/* floor */}
      <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none">
        <defs>
          <filter id={`b${id}`}><feGaussianBlur stdDeviation="1.6" /></filter>
          <filter id={`b2${id}`}><feGaussianBlur stdDeviation="0.6" /></filter>
          <linearGradient id={`beam${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF8E6" stopOpacity="0.55" /><stop offset="1" stopColor="#FFF8E6" stopOpacity="0" /></linearGradient>
          <clipPath id={`cc${id}`}><circle cx="50" cy="128" r="17" /></clipPath>
        </defs>
        {planks.map((k, i) => (
          <g key={i}>
            <rect x={k.x} y={k.y} width={W} height={k.h} fill={k.c} />
            {k.g.map((g, j) => <path key={j} d={`M${k.x + 0.8 + g * (W - 1.6)} ${k.y} C ${k.x + 0.5 + g * (W - 1)} ${k.y + k.h / 3}, ${k.x + 1.2 + g * (W - 2)} ${k.y + (2 * k.h) / 3}, ${k.x + 0.8 + g * (W - 1.6)} ${k.y + k.h}`} stroke="rgba(110,55,15,0.22)" strokeWidth="0.18" fill="none" />)}
            <rect x={k.x} y={k.y} width={W} height="0.28" fill="rgba(70,32,8,0.55)" />
            <rect x={k.x} y={k.y} width="0.22" height={k.h} fill="rgba(70,32,8,0.45)" />
          </g>
        ))}
        {/* painted court: key in the club colour, lines, centre circle with the club logo */}
        <rect x="30" y="104" width="40" height="40" fill="var(--hp, #F28C14)" opacity="0.42" />
        <g fill="none" stroke="#FFFDF6" strokeWidth="0.85" opacity="0.92">
          <path d="M30 140 V104 H70 V140" /><path d="M36.5 104 A13.5 13.5 0 0 1 63.5 104" /><path d="M3 140 V114 A47 47 0 0 1 97 114 V140" />
          <circle cx="50" cy="128" r="17" />
        </g>
        <image href={f.logo} x="33" y="111" width="34" height="34" clipPath={`url(#cc${id})`} opacity="0.16" preserveAspectRatio="xMidYMid slice" />
        {/* arena lights reflecting in the varnish */}
        <g filter={`url(#b${id})`} fill="#FFF7E2">
          {[14, 38, 62, 86].map((x, i) => <ellipse key={i} cx={x} cy={96 + (i % 2) * 6} rx="2.6" ry="16" opacity="0.32" />)}
        </g>
        {/* spotlight beams + dust */}
        <polygon points="-6,0 18,0 46,140 -30,140" fill={`url(#beam${id})`} opacity="0.35" />
        <polygon points="82,0 106,0 130,140 54,140" fill={`url(#beam${id})`} opacity="0.3" />
        <g fill="#FFF7E2" filter={`url(#b2${id})`}>
          {Array.from({ length: 26 }, (_, i) => { const r = rng(300 + i); return <circle key={i} cx={(r() * 50 + (i % 2 ? 60 : -5))} cy={r() * 140} r={0.25 + r() * 0.5} opacity={0.4 + r() * 0.5} />; })}
        </g>
      </svg>
      {/* varnish gloss */}
      <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(170deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.05) 22%, transparent 40%, rgba(255,240,210,0.10) 70%, transparent 85%)' }} />

      {/* glass backboard with the photo */}
      <At x={7} y={13} r={7} h={70} style={{ borderRadius: cq(2.4), padding: cq(1.5), background: 'linear-gradient(160deg, rgba(255,255,255,0.85), rgba(220,235,245,0.55) 40%, rgba(255,255,255,0.8))', boxShadow: `0 ${cq(1.6)} ${cq(4)} rgba(60,28,6,0.55), inset 0 0 0 ${cq(0.35)} rgba(255,255,255,0.9)` }}>
        <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: cq(1.2), background: 'radial-gradient(120% 90% at 50% 0%, #3A4D72, #121A2C)' }}>
          <PhotoOr url={f.url} c={f.c} initial={f.initial} />
          <span className="absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 26%, rgba(255,255,255,0) 64%, rgba(255,255,255,0.12) 78%, rgba(255,255,255,0) 92%)' }} />
          <span className="absolute inset-x-0 bottom-0" style={{ height: '28%', background: 'linear-gradient(transparent, rgba(10,12,20,0.55))' }} />
        </div>
        {/* bolts */}
        {[[1.2, 1.2], [null, 1.2], [1.2, null], [null, null]].map(([l, t], i) => (
          <span key={i} className="absolute rounded-full" style={{ left: l != null ? cq(l as number) : undefined, right: l == null ? cq(1.2) : undefined, top: t != null ? cq(t as number) : undefined, bottom: t == null ? cq(1.2) : undefined, width: cq(1.6), height: cq(1.6), background: 'radial-gradient(circle at 35% 30%, #fff, #8D96A3 55%, #4A515B)' }} />
        ))}
      </At>
      {/* rim + net */}
      <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 140" preserveAspectRatio="none">
        <defs><linearGradient id={`rim${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF8A3D" /><stop offset="1" stopColor="#B83A0C" /></linearGradient></defs>
        <rect x="47" y="80.5" width="6" height="3.4" rx="0.4" fill="#C9D1DA" stroke="#6F7883" strokeWidth="0.25" />
        <g stroke="rgba(255,255,255,0.92)" strokeWidth="0.32" fill="none" strokeLinecap="round">
          {Array.from({ length: 12 }, (_, i) => {
            const t = i / 11, x0 = 35 + t * 30, x1 = 40 + t * 20, x2 = 43 + t * 14;
            const n0 = 35 + Math.min(1, t + 1 / 11) * 30, n1 = 40 + Math.min(1, t + 1 / 11) * 20;
            return <g key={i}><path d={`M${x0} 84.5 L${n1} 89.5 L${x2 + 1.2} 94.5`} /><path d={`M${n0} 84.5 L${x1} 89.5 L${x2} 94.5`} /></g>;
          })}
          <path d="M36.5 89.5 Q50 91 63.5 89.5" /><path d="M41 94.5 Q50 95.6 59 94.5" />
        </g>
        <ellipse cx="50" cy="84.3" rx="15.5" ry="2.1" fill="none" stroke={`url(#rim${id})`} strokeWidth="1.3" />
        <ellipse cx="50" cy="83.9" rx="15.5" ry="2.1" fill="none" stroke="rgba(255,220,180,0.7)" strokeWidth="0.25" />
      </svg>

      {/* club badge on a ribbon */}
      <At x={5} y={4} style={{ display: 'flex', alignItems: 'center', gap: cq(1.6) }}>
        <span className="relative flex-shrink-0" style={{ width: cq(9.5), height: cq(9.5), borderRadius: '50%', padding: cq(0.7), background: GOLD, boxShadow: `0 ${cq(0.6)} ${cq(1.4)} rgba(40,18,4,0.5)` }}>
          <img src={f.logo} alt="" className="w-full h-full object-cover rounded-full bg-[#F6EFEC]" />
        </span>
        <span className="font-hoop font-black uppercase leading-none" style={{ fontSize: cq(3.2), letterSpacing: cq(0.35), color: '#fff', padding: `${cq(1)} ${cq(2.4)} ${cq(1)} ${cq(1.6)}`, background: 'linear-gradient(180deg, #2A1708, #120903)', clipPath: 'polygon(0 0, 100% 0, 94% 50%, 100% 100%, 0 100%)', maxWidth: cq(50) }}>{f.clubName}</span>
      </At>
      {/* tackle-twill jersey number patch */}
      <At r={5} y={3} w={16} h={14.5} style={{ borderRadius: cq(2), background: 'var(--hp, #F28C14)', boxShadow: `0 ${cq(0.8)} ${cq(1.6)} rgba(40,18,4,0.55), inset 0 ${cq(0.4)} 0 rgba(255,255,255,0.35)`, border: `${cq(0.6)} solid #fff` }}>
        <span className="absolute" style={{ inset: cq(0.8), borderRadius: cq(1.3), border: `${cq(0.25)} dashed rgba(255,255,255,0.75)` }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center font-hoop font-black leading-none text-white">
          <span style={{ fontSize: cq(8.6), WebkitTextStroke: `${cq(0.35)} #1C120A`, textShadow: `${cq(0.45)} ${cq(0.45)} 0 #1C120A` }}>{f.num ?? '–'}</span>
          {f.pos && <span style={{ fontSize: cq(2.8), letterSpacing: cq(0.5), color: '#1C120A', marginTop: cq(0.3) }}>{f.pos}</span>}
        </div>
      </At>

      {/* brushed-steel nameplate */}
      <At x={5} r={5} y={97} h={12.5} style={{ borderRadius: cq(1.6), background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 0.4%, rgba(0,0,0,0.06) 0.4% 0.8%), linear-gradient(180deg, #E9EDF1 0%, #B9C1CA 45%, #8D96A1 55%, #CDD3DA 100%)', boxShadow: `0 ${cq(1)} ${cq(2.4)} rgba(40,18,4,0.55), inset 0 ${cq(0.35)} 0 #fff, inset 0 -${cq(0.35)} 0 rgba(0,0,0,0.35)` }}>
        {[0, 1].map((i) => (
          <span key={i} className="absolute rounded-full" style={{ top: '50%', [i ? 'right' : 'left']: cq(1.4), width: cq(1.7), height: cq(1.7), transform: 'translateY(-50%)', background: 'radial-gradient(circle at 35% 30%, #fff, #7B848F 60%, #3E444C)' }}>
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: '70%', height: cq(0.25), background: '#3E444C', transform: `translate(-50%,-50%) rotate(${i ? 35 : -20}deg)` }} />
          </span>
        ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: `0 ${cq(5)}` }}>
          {f.first && <p className="font-hoop font-bold uppercase leading-none whitespace-nowrap" style={{ fontSize: cq(3.3), letterSpacing: cq(0.9), color: '#4A3420', textShadow: `0 ${cq(0.18)} 0 rgba(255,255,255,0.8)` }}>{f.first}</p>}
          <p className="font-hoop font-black uppercase leading-none whitespace-nowrap" style={{ fontSize: cq(f.fit(8.8, 11)), letterSpacing: cq(0.3), color: '#22272E', textShadow: `0 ${cq(0.25)} 0 rgba(255,255,255,0.85), 0 -${cq(0.12)} 0 rgba(0,0,0,0.35)` }}>{f.last}</p>
        </div>
      </At>

      {/* LED scoreboard */}
      <At x={4} r={4} y={111} h={19} style={{ borderRadius: cq(2.2), background: 'linear-gradient(180deg, #2B2F35, #0E1012)', boxShadow: `0 ${cq(1.2)} ${cq(3)} rgba(0,0,0,0.6), inset 0 ${cq(0.3)} 0 rgba(255,255,255,0.18)`, padding: `${cq(1.2)} ${cq(1.4)}` }}>
        <div className="absolute flex justify-between" style={{ left: cq(3), right: cq(3), top: cq(0.4) }}>
          {Array.from({ length: 9 }, (_, i) => <span key={i} className="rounded-full" style={{ width: cq(0.7), height: cq(0.7), background: i % 2 ? '#FF4D3A' : '#FFB21F', boxShadow: `0 0 ${cq(0.8)} ${i % 2 ? '#FF4D3A' : '#FFB21F'}` }} />)}
        </div>
        <div className="flex h-full" style={{ gap: cq(1), paddingTop: cq(0.8) }}>
          <div className="relative flex flex-col items-center justify-center" style={{ width: '36%', borderRadius: cq(1), background: '#060708', border: `${cq(0.3)} solid #31363C` }}>
            <span className="relative font-bold leading-none" style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: cq(9.4) }}>
              <span aria-hidden style={ledGhost}>{ghost(fmt1(f.s?.ppg))}</span>
              <span style={{ color: '#FFB21F', textShadow: `0 0 ${cq(1)} rgba(255,170,30,1), 0 0 ${cq(3)} rgba(255,120,0,0.6)` }}>{fmt1(f.s?.ppg)}</span>
              <span aria-hidden className="absolute inset-0" style={dots('#060708')} />
            </span>
            <span className="font-hoop font-bold leading-none" style={{ fontSize: cq(2.5), color: '#AEB6C0', letterSpacing: cq(0.7), marginTop: cq(0.9) }}>PTS / GAME</span>
          </div>
          <div className="flex-1 grid grid-cols-4" style={{ gap: cq(0.7) }}>
            {statRow(f.s).map(([k, v]) => (
              <div key={k} className="relative flex flex-col items-center justify-center" style={{ borderRadius: cq(0.8), background: '#0A0B0D', border: `${cq(0.3)} solid #31363C` }}>
                <span className="relative font-bold leading-none" style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: cq(4.6) }}>
                  <span aria-hidden style={{ ...ledGhost, color: 'rgba(255,80,50,0.08)' }}>{ghost(fmt1(v))}</span>
                  <span style={{ color: '#FF5A3C', textShadow: `0 0 ${cq(0.9)} rgba(255,80,50,1)` }}>{fmt1(v)}</span>
                  <span aria-hidden className="absolute inset-0" style={dots('#0A0B0D')} />
                </span>
                <span className="font-hoop font-bold leading-none" style={{ fontSize: cq(2.4), color: '#AEB6C0', marginTop: cq(0.7) }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ borderRadius: cq(2.2), background: 'linear-gradient(165deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 35%)' }} />
      </At>
      <At x={6} r={6} y={131.5} className="flex justify-between font-hoop font-black uppercase" style={{ fontSize: cq(2.7), color: '#2A1708', letterSpacing: cq(0.3) }}>
        <span>{footer(f.s)}</span><span>SERIES 2 · HARDWOOD</span>
      </At>

      <Grain opacity={0.14} />
      <Sparkles seed={21} n={10} area={[4, 4, 96, 96]} size={[0.6, 1.6]} />
      <Glare strength={0.32} tint="255,244,220" />
      <Sheen />
      <FoilEdge gradient={GOLD} width={1.2} />
    </Shell>
  );
};

// =====================================================================================================
// SERIES 3 · NEON NIGHT — rainy city court after dark, neon tubes with mounting clips, wet street reflections
// =====================================================================================================
export const NeonCard: React.FC<TradingCardProps> = (p) => {
  const f = useFace(p);
  const id = useSvgId();
  const pink = '#FF2E93', cyan = '#2EF2FF', violet = '#9B5CFF';
  const glow = (c: string, s = 1) => `0 0 ${cq(0.5 * s)} #fff, 0 0 ${cq(1.2 * s)} ${c}, 0 0 ${cq(2.6 * s)} ${c}, 0 0 ${cq(5.5 * s)} ${c}`;
  const city = useMemo(() => {
    const r = rng(9), b: { x: number; w: number; h: number; win: { x: number; y: number; c: string }[] }[] = [];
    let x = -2;
    while (x < 102) {
      const w = 6 + r() * 10, h = 20 + r() * 38, win: { x: number; y: number; c: string }[] = [];
      for (let wy = 104 - h + 3; wy < 102; wy += 3.2) for (let wx = x + 1.2; wx < x + w - 1.5; wx += 2.4) if (r() < 0.38) win.push({ x: wx, y: wy, c: r() < 0.7 ? '#FFD98A' : r() < 0.5 ? '#FF7FC4' : '#7FF6FF' });
      b.push({ x, w, h, win }); x += w + 0.6;
    }
    return b;
  }, []);
  const tube = (c: string, inset: number, rad: number, w: number) => (
    <>
      <span className="absolute pointer-events-none" style={{ inset: cq(inset), borderRadius: cq(rad), border: `${cq(w)} solid ${c}`, boxShadow: `${glow(c, 0.8)}, inset 0 0 ${cq(2)} ${c}` }} />
      <span className="absolute pointer-events-none" style={{ inset: cq(inset + w * 0.35), borderRadius: cq(rad), border: `${cq(w * 0.3)} solid rgba(255,255,255,0.85)` }} />
    </>
  );
  return (
    <Shell>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #160A33 0%, #0D0724 45%, #07041A 70%, #04020C 100%)' }} />
      <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none">
        <defs>
          <filter id={`bl${id}`}><feGaussianBlur stdDeviation="2.2" /></filter>
          <filter id={`bs${id}`}><feGaussianBlur stdDeviation="0.5" /></filter>
          <pattern id={`fence${id}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 H4 M0 0 V4" stroke="rgba(170,190,255,0.22)" strokeWidth="0.22" fill="none" /></pattern>
          <linearGradient id={`fade${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <mask id={`fm${id}`}><rect width="100" height="70" fill={`url(#fade${id})`} /></mask>
        </defs>
        {/* moon haze + light pollution */}
        <circle cx="82" cy="18" r="16" fill={violet} opacity="0.25" filter={`url(#bl${id})`} />
        <ellipse cx="50" cy="104" rx="70" ry="18" fill={pink} opacity="0.14" filter={`url(#bl${id})`} />
        {/* skyline with lit windows */}
        <g>
          {city.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={104 - b.h} width={b.w} height={b.h} fill={i % 3 ? '#120C2A' : '#0E0922'} />
              <rect x={b.x} y={104 - b.h} width={b.w} height="0.4" fill={i % 2 ? pink : cyan} opacity="0.6" />
              {b.win.map((w, j) => <rect key={j} x={w.x} y={w.y} width="1.1" height="1.5" fill={w.c} opacity="0.85" />)}
            </g>
          ))}
        </g>
        {/* chain-link fence */}
        <rect width="100" height="70" fill={`url(#fence${id})`} mask={`url(#fm${id})`} />
        {/* wet street with reflections */}
        <rect y="104" width="100" height="36" fill="#05030F" />
        <g filter={`url(#bl${id})`}>
          {[[12, pink], [30, cyan], [52, '#FFD98A'], [70, pink], [88, cyan]].map(([x, c], i) => <rect key={i} x={(x as number) - 1.8} y="104" width="3.6" height="34" fill={c as string} opacity="0.35" />)}
        </g>
        {/* rain */}
        <g stroke="rgba(200,220,255,0.28)" strokeWidth="0.18">
          {Array.from({ length: 70 }, (_, i) => { const r = rng(500 + i); const x = r() * 110, y = r() * 140; return <line key={i} x1={x} y1={y} x2={x - 1.6} y2={y + 6} />; })}
        </g>
        {/* bokeh */}
        <g filter={`url(#bs${id})`}>
          {Array.from({ length: 14 }, (_, i) => { const r = rng(900 + i); return <circle key={i} cx={r() * 100} cy={r() * 140} r={1 + r() * 2.6} fill={[pink, cyan, violet, '#FFD98A'][i % 4]} opacity={0.18 + r() * 0.25} />; })}
        </g>
        {/* graffiti spray dots */}
        <g fill={pink} opacity="0.5">
          {Array.from({ length: 40 }, (_, i) => { const r = rng(1200 + i); const a = r() * Math.PI * 2, d = Math.pow(r(), 1.8) * 9; return <circle key={i} cx={92 + Math.cos(a) * d} cy={100 + Math.sin(a) * d} r={0.15 + r() * 0.4} />; })}
        </g>
      </svg>

      {/* photo window */}
      <At x={9} y={16} r={9} h={64} style={{ borderRadius: cq(3.2), overflow: 'hidden', background: 'radial-gradient(120% 90% at 50% 10%, #3A2266, #0D0724)' }}>
        <PhotoOr url={f.url} c={f.c} initial={f.initial} color="rgba(46,242,255,0.18)" />
        <span className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${pink}38, transparent 45%, ${cyan}26 100%)`, mixBlendMode: 'screen' }} />
        <span className="absolute inset-0" style={{ boxShadow: `inset ${cq(2)} 0 ${cq(4)} -${cq(1)} ${pink}66, inset -${cq(2)} 0 ${cq(4)} -${cq(1)} ${cyan}66` }} />
        <span className="absolute inset-x-0 bottom-0" style={{ height: '30%', background: 'linear-gradient(transparent, rgba(7,4,26,0.85))' }} />
      </At>
      {/* neon tubes around the photo + mounting clips */}
      <At x={9} y={16} r={9} h={64}>
        {tube(pink, -1.3, 4.2, 0.7)}
        {tube(cyan, 0.9, 2.4, 0.42)}
        {[[20, -2.1], [80, -2.1], [20, 63.2], [80, 63.2]].map(([px, y], i) => <span key={i} className="absolute" style={{ left: `${px}%`, top: cq(y), width: cq(2.2), height: cq(1.8), borderRadius: cq(0.4), background: 'linear-gradient(180deg, #9AA3AE, #4A515B)' }} />)}
      </At>

      {/* club neon sign */}
      <At x={7} y={4.5} style={{ display: 'flex', alignItems: 'center', gap: cq(1.6), padding: `${cq(0.9)} ${cq(2)} ${cq(0.9)} ${cq(0.9)}`, borderRadius: cq(6), background: 'rgba(10,5,25,0.75)', border: `${cq(0.3)} solid ${violet}`, boxShadow: `0 0 ${cq(2)} ${violet}88` }}>
        <img src={f.logo} alt="" className="object-cover bg-[#F6EFEC] rounded-full" style={{ width: cq(7), height: cq(7), boxShadow: glow(cyan, 0.4) }} />
        <span className="font-hoop italic font-black uppercase leading-none" style={{ fontSize: cq(3.3), color: '#F1FEFF', textShadow: glow(cyan, 0.45), maxWidth: cq(46) }}>{f.clubName}</span>
      </At>
      {/* number: neon outline, slightly flickering half */}
      <At r={7} y={3} style={{ textAlign: 'right' }}>
        <p className="font-hoop italic font-black leading-none" style={{ fontSize: cq(15), color: 'transparent', WebkitTextStroke: `${cq(0.45)} #FFE6F3`, filter: `drop-shadow(0 0 ${cq(0.8)} ${pink}) drop-shadow(0 0 ${cq(2.2)} ${pink})` }}>{f.num ?? ''}</p>
        {f.pos && <p className="font-hoop font-black leading-none" style={{ fontSize: cq(3.6), color: '#F1FEFF', textShadow: glow(cyan, 0.45), letterSpacing: cq(0.6), marginTop: cq(0.4) }}>{f.pos}</p>}
      </At>

      {/* name */}
      <At x={8} r={8} y={83}>
        {f.first && <p className="font-hoop italic font-bold uppercase leading-none whitespace-nowrap" style={{ fontSize: cq(4.2), color: '#FFE6F3', textShadow: glow(pink, 0.45), letterSpacing: cq(0.9) }}>{f.first}</p>}
        <p className="font-hoop italic font-black uppercase leading-[0.95] whitespace-nowrap" style={{ fontSize: cq(f.fit(11.5, 9)), color: '#F1FEFF', WebkitTextStroke: `${cq(0.15)} #fff`, textShadow: glow(cyan, 0.85) }}>{f.last}</p>
      </At>

      {/* stats on a glass sign */}
      <At x={6} r={6} y={104} h={22} style={{ borderRadius: cq(2.6), background: 'linear-gradient(180deg, rgba(30,18,60,0.78), rgba(8,4,20,0.85))', border: `${cq(0.35)} solid ${violet}`, boxShadow: `0 0 ${cq(2.4)} ${violet}77, inset 0 0 ${cq(2.4)} ${violet}44`, padding: `${cq(1.6)} ${cq(2.4)}` }}>
        <div className="flex items-center h-full" style={{ gap: cq(2.4) }}>
          <div className="leading-none text-center" style={{ minWidth: cq(26) }}>
            <span className="font-hoop italic font-black block" style={{ fontSize: cq(13.5), color: '#FFE6F3', textShadow: glow(pink, 1) }}>{fmt1(f.s?.ppg)}</span>
            <span className="font-hoop font-black block" style={{ fontSize: cq(2.5), color: pink, letterSpacing: cq(0.9), marginTop: cq(0.6), textShadow: glow(pink, 0.25) }}>POINTS / GAME</span>
          </div>
          <div className="flex-1 grid grid-cols-2" style={{ gap: cq(1.1) }}>
            {statRow(f.s).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between" style={{ padding: `${cq(0.5)} ${cq(1.4)}`, borderRadius: cq(1.2), border: `${cq(0.28)} solid ${cyan}`, boxShadow: `0 0 ${cq(1)} ${cyan}88, inset 0 0 ${cq(1)} ${cyan}44` }}>
                <span className="font-hoop font-bold" style={{ fontSize: cq(2.7), color: '#A9FBFF' }}>{k}</span>
                <span className="font-hoop italic font-black" style={{ fontSize: cq(5), color: '#F1FEFF', textShadow: glow(cyan, 0.35) }}>{fmt1(v)}</span>
              </div>
            ))}
          </div>
        </div>
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ borderRadius: cq(2.6), background: 'linear-gradient(170deg, rgba(255,255,255,0.14), transparent 40%)' }} />
      </At>
      <At x={7} r={7} y={129} className="flex justify-between font-hoop font-bold uppercase" style={{ fontSize: cq(2.6), color: '#C9B8FF', letterSpacing: cq(0.4) }}>
        <span>{footer(f.s)}</span><span style={{ color: pink, textShadow: glow(pink, 0.22) }}>SERIES 3 · NEON NIGHT</span>
      </At>

      {/* outer neon frame */}
      <span className="absolute pointer-events-none" style={{ inset: cq(1.4), borderRadius: cq(4.2), border: `${cq(0.4)} solid ${violet}`, boxShadow: `0 0 ${cq(1.5)} ${violet}, inset 0 0 ${cq(1.5)} ${violet}` }} />
      <Grain opacity={0.16} />
      <Sparkles seed={33} n={12} color="#E6FDFF" area={[2, 2, 98, 100]} size={[0.5, 1.5]} />
      <Glare strength={0.22} tint="255,200,240" />
      <Sheen strength={0.35} />
    </Shell>
  );
};

// =====================================================================================================
// SERIES 4 · HOLO CHROME — rainbow holographic foil, engraved guilloche, faceted chrome, prism flare, stat gauges
// =====================================================================================================
export const HoloCard: React.FC<TradingCardProps> = (p) => {
  const f = useFace(p);
  const id = useSvgId();
  const max: Record<string, number> = { RPG: 12, APG: 10, SPG: 4, BPG: 3 };
  return (
    <Shell radius={5}>
      {/* chrome body */}
      <div className="absolute inset-0" style={{ background: CHROME }} />
      <At x={1.8} y={1.8} r={1.8} b={1.8} style={{ borderRadius: cq(3.8), overflow: 'hidden' }}>
        {/* holographic foil base — the rainbow shifts as the card tilts */}
        <div className="absolute inset-0" style={{
          background: [
            'repeating-linear-gradient(125deg, rgba(255,255,255,0.28) 0 0.5%, transparent 0.5% 1.8%)',
            `linear-gradient(115deg, #FF9AD5 0%, #FFC48C 14%, #FFF59A 28%, #A8FFB4 42%, #9AE6FF 56%, #B4A8FF 70%, #FF9AD5 84%, #FFC48C 100%)`,
          ].join(','),
          backgroundSize: '100% 100%, 220% 220%',
          backgroundPosition: '0 0, var(--gx, 30%) var(--gy, 20%)',
        }} />
        <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none">
          <defs>
            <pattern id={`st${id}`} width="7" height="7" patternUnits="userSpaceOnUse">
              <path d="M3.5 1.6 L3.9 3.1 L5.4 3.5 L3.9 3.9 L3.5 5.4 L3.1 3.9 L1.6 3.5 L3.1 3.1Z" fill="rgba(255,255,255,0.55)" />
            </pattern>
            <filter id={`fl${id}`}><feGaussianBlur stdDeviation="1.4" /></filter>
          </defs>
          <rect width="100" height="140" fill={`url(#st${id})`} opacity="0.55" />
          {/* guilloche rosette (banknote engraving) */}
          <g fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.2">
            {Array.from({ length: 36 }, (_, i) => <ellipse key={i} cx="50" cy="52" rx="44" ry="17" transform={`rotate(${i * 5} 50 52)`} />)}
          </g>
          <g fill="none" stroke="rgba(110,80,210,0.5)" strokeWidth="0.14">
            {Array.from({ length: 24 }, (_, i) => <ellipse key={i} cx="50" cy="52" rx="30" ry="9" transform={`rotate(${i * 7.5} 50 52)`} />)}
          </g>
          {/* wavy engraving at the bottom */}
          <g fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.15">
            {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M0 ${92 + i * 3.2} ${Array.from({ length: 10 }, (_, j) => `Q ${j * 10 + 5} ${92 + i * 3.2 + (j % 2 ? 1.8 : -1.8)} ${j * 10 + 10} ${92 + i * 3.2}`).join(' ')}`} />)}
          </g>
          {/* prism flare */}
          <g filter={`url(#fl${id})`} opacity="0.75">
            <ellipse cx="82" cy="14" rx="9" ry="9" fill="#fff" opacity="0.55" />
          </g>
        </svg>
        <span aria-hidden className="absolute" style={{ left: '-10%', right: '-10%', top: cq(13), height: cq(2), background: RAINBOW, opacity: 0.55, filter: `blur(${cq(0.6)})`, transform: 'rotate(-8deg)' }} />

        {/* arched photo window: chrome bevel + inner rim light */}
        <At x={7.2} y={12.2} r={7.2} h={77} style={{ borderRadius: `${cq(43)} ${cq(43)} ${cq(3)} ${cq(3)}`, padding: cq(1.4), background: CHROME, boxShadow: `0 ${cq(1.2)} ${cq(3.5)} rgba(40,30,90,0.45)` }}>
          <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: `${cq(41.6)} ${cq(41.6)} ${cq(1.8)} ${cq(1.8)}`, background: 'radial-gradient(120% 90% at 50% 10%, #3C4E86, #121A33)' }}>
            <PhotoOr url={f.url} c={f.c} initial={f.initial} />
            <span className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${cq(3)} rgba(180,220,255,0.55)` }} />
            <span className="absolute inset-0" style={{ background: 'linear-gradient(125deg, rgba(255,255,255,0.28) 0%, transparent 32%, transparent 70%, rgba(180,160,255,0.22) 100%)' }} />
            <span className="absolute inset-0" style={{ background: RAINBOW, opacity: 0.08, mixBlendMode: 'color' }} />
          </div>
        </At>

        {/* engraved number medallion */}
        <At x={2.6} y={2.6} w={19} h={19} style={{ borderRadius: '50%', background: CHROME, boxShadow: `0 ${cq(0.8)} ${cq(2)} rgba(0,0,0,0.35)` }}>
          <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 40 40">
            {Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return <line key={i} x1={20 + Math.cos(a) * 17.2} y1={20 + Math.sin(a) * 17.2} x2={20 + Math.cos(a) * (i % 4 ? 18.4 : 19.2)} y2={20 + Math.sin(a) * (i % 4 ? 18.4 : 19.2)} stroke="#4A5260" strokeWidth="0.4" />; })}
            <circle cx="20" cy="20" r="15.4" fill="none" stroke="#fff" strokeWidth="0.8" />
            <circle cx="20" cy="20" r="14.4" fill="none" stroke="#5A6370" strokeWidth="0.4" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center font-hoop font-black leading-none" style={{ color: '#1D2433', textShadow: `0 ${cq(0.2)} 0 rgba(255,255,255,0.8)` }}>
            <span style={{ fontSize: cq(8.2) }}>{f.num ?? '–'}</span>
            {f.pos && <span style={{ fontSize: cq(2.6), letterSpacing: cq(0.4) }}>{f.pos}</span>}
          </div>
        </At>
        {/* club */}
        <At r={3} y={3.6} style={{ display: 'flex', alignItems: 'center', gap: cq(1.4), maxWidth: cq(58) }}>
          <span className="font-hoop font-black uppercase text-right leading-none" style={{ fontSize: cq(3.1), color: '#1D2433', textShadow: `0 ${cq(0.2)} 0 rgba(255,255,255,0.7)` }}>{f.clubName}</span>
          <span className="flex-shrink-0 rounded-full" style={{ width: cq(9.5), height: cq(9.5), padding: cq(0.7), background: CHROME }}><img src={f.logo} alt="" className="w-full h-full object-cover rounded-full bg-[#F6EFEC]" /></span>
        </At>

        {/* dark glass plate with holo name + gauges */}
        <At x={3} r={3} y={92} style={{ borderRadius: cq(3), padding: cq(1), background: CHROME }}>
          <div className="relative w-full overflow-hidden" style={{ borderRadius: cq(2.2), padding: `${cq(1.6)} ${cq(3)} ${cq(1.2)}`, background: 'linear-gradient(180deg, #1C2338, #0B0F1D)' }}>
            <span aria-hidden className="absolute inset-0" style={{ background: 'repeating-linear-gradient(125deg, rgba(255,255,255,0.03) 0 0.5%, transparent 0.5% 1.6%)' }} />
            <div className="relative flex items-end justify-between" style={{ gap: cq(2) }}>
              <div className="min-w-0">
                {f.first && <p className="font-hoop font-bold uppercase leading-none whitespace-nowrap" style={{ fontSize: cq(3.4), letterSpacing: cq(0.7), color: '#C4CEFF' }}>{f.first}</p>}
                <p className="font-hoop italic font-black uppercase leading-[0.95] whitespace-nowrap" style={{ fontSize: cq(f.fit(8.6, 11)), ...textFill(RAINBOW), filter: `drop-shadow(0 0 ${cq(1)} rgba(180,220,255,0.35))` }}>{f.last}</p>
              </div>
              <div className="text-right leading-none flex-shrink-0">
                <span className="font-hoop italic font-black" style={{ fontSize: cq(11), ...textFill('linear-gradient(180deg, #FFFFFF, #C9D3E3 60%, #8F9BB0)') }}>{fmt1(f.s?.ppg)}</span>
                <span className="block font-hoop font-black" style={{ fontSize: cq(2.5), color: '#A8FFE9', letterSpacing: cq(0.7) }}>PTS / GAME</span>
              </div>
            </div>
            <div className="relative grid grid-cols-4" style={{ marginTop: cq(1.3), paddingTop: cq(1.2), borderTop: `${cq(0.3)} solid rgba(196,206,255,0.3)`, gap: cq(2) }}>
              {statRow(f.s).map(([k, v]) => (
                <div key={k} className="leading-none">
                  <div className="flex items-baseline justify-between">
                    <span className="font-hoop font-bold" style={{ fontSize: cq(2.4), color: '#C4CEFF' }}>{k}</span>
                    <span className="font-hoop font-black" style={{ fontSize: cq(4.4), color: '#fff' }}>{fmt1(v)}</span>
                  </div>
                  <div style={{ height: cq(0.8), marginTop: cq(0.6), borderRadius: cq(1), background: 'rgba(255,255,255,0.1)' }}>
                    <div style={{ width: `${Math.min(100, ((v || 0) / max[k]) * 100)}%`, height: '100%', borderRadius: cq(1), background: RAINBOW }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="relative flex justify-between font-hoop font-bold uppercase" style={{ marginTop: cq(1.3), fontSize: cq(2.4), color: '#8E9AC8', letterSpacing: cq(0.3) }}>
              <span>{footer(f.s)}</span><span>SERIES 4 · HOLO CHROME</span>
            </div>
          </div>
        </At>

        <Sparkles seed={44} n={18} area={[2, 2, 98, 92]} size={[0.6, 2]} />
        <Glare strength={0.5} />
        <Sheen strength={0.55} />
        <Grain opacity={0.08} />
      </At>
      {/* faceted chrome corners */}
      <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 140" preserveAspectRatio="none">
        {[[0, 0, 1, 1], [100, 0, -1, 1], [0, 140, 1, -1], [100, 140, -1, -1]].map(([x, y, sx, sy], i) => (
          <g key={i}><polygon points={`${x},${y} ${x + sx * 7},${y} ${x},${y + sy * 7}`} fill="#fff" opacity="0.5" /><polygon points={`${x + sx * 7},${y} ${x + sx * 9},${y} ${x},${y + sy * 9} ${x},${y + sy * 7}`} fill="#5E6874" opacity="0.35" /></g>
        ))}
      </svg>
    </Shell>
  );
};

// =====================================================================================================
// SERIES 5 · BLACK GOLD — matte black, spot-gloss deco pattern, gold filigree, laurel crest, gold medallion
// =====================================================================================================
export const BlackGoldCard: React.FC<TradingCardProps> = (p) => {
  const f = useFace(p);
  const id = useSvgId();
  const step = 'polygon(0 7%, 7% 7%, 7% 3.5%, 14% 3.5%, 14% 0, 86% 0, 86% 3.5%, 93% 3.5%, 93% 7%, 100% 7%, 100% 100%, 0 100%)';
  const laurel = (side: 1 | -1) => (
    <g transform={side < 0 ? 'translate(40 0) scale(-1 1)' : undefined}>
      <path d="M8 34 Q4 22 10 8" fill="none" stroke={`url(#gc${id})`} strokeWidth="0.9" />
      {[30, 25, 20, 15, 10].map((y, i) => <ellipse key={i} cx={6.6 + i * 0.4} cy={y} rx="1.4" ry="3.1" fill={`url(#gc${id})`} transform={`rotate(${-35 + i * 6} ${6.6 + i * 0.4} ${y})`} />)}
    </g>
  );
  return (
    <Shell>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #221D14 0%, #0B0A08 55%, #050404 100%)' }} />
      <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`gd${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF4C8" /><stop offset="0.3" stopColor="#E9C15A" /><stop offset="0.55" stopColor="#A5761F" /><stop offset="0.8" stopColor="#F6D982" /><stop offset="1" stopColor="#9C6E1E" /></linearGradient>
          {/* spot-gloss fans (barely visible, like spot UV) */}
          <pattern id={`fan${id}`} width="10" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 6 A5 5 0 0 1 10 6" fill="none" stroke="rgba(255,240,200,0.07)" strokeWidth="0.3" />
            <path d="M2 6 A3 3 0 0 1 8 6" fill="none" stroke="rgba(255,240,200,0.06)" strokeWidth="0.3" />
            <path d="M-5 3 A5 5 0 0 1 5 3 M5 3 A5 5 0 0 1 15 3" fill="none" stroke="rgba(255,240,200,0.05)" strokeWidth="0.3" />
          </pattern>
          <filter id={`gb${id}`}><feGaussianBlur stdDeviation="1.2" /></filter>
        </defs>
        <rect width="100" height="140" fill={`url(#fan${id})`} />
        {/* sunburst behind the photo */}
        <g stroke={`url(#gd${id})`} strokeWidth="0.3" opacity="0.4">
          {Array.from({ length: 37 }, (_, i) => { const a = Math.PI * (i / 36); return <line key={i} x1="50" y1="56" x2={50 - 80 * Math.cos(a)} y2={56 - 80 * Math.sin(a)} />; })}
        </g>
        <g stroke={`url(#gd${id})`} strokeWidth="0.22" opacity="0.28">
          {Array.from({ length: 25 }, (_, i) => { const a = Math.PI * (i / 24); return <line key={i} x1="50" y1="140" x2={50 - 60 * Math.cos(a)} y2={140 - 60 * Math.sin(a)} />; })}
        </g>
        {/* gold frame: stepped deco corners, double lines, side bars */}
        <g fill="none" stroke={`url(#gd${id})`}>
          <path d="M8 2.5 H92 L97.5 8 V132 L92 137.5 H8 L2.5 132 V8 Z" strokeWidth="0.9" />
          <path d="M9.5 4.6 H90.5 L95.4 9.5 V130.5 L90.5 135.4 H9.5 L4.6 130.5 V9.5 Z" strokeWidth="0.3" />
          {[[2.5, 8, 1, 1], [97.5, 8, -1, 1], [2.5, 132, 1, -1], [97.5, 132, -1, -1]].map(([x, y, sx, sy], i) => (
            <g key={i} strokeWidth="0.55">
              <path d={`M${x + sx * 4} ${y + sy * 4} h${sx * 6} M${x + sx * 4} ${y + sy * 4} v${sy * 6}`} />
              <path d={`M${x + sx * 4} ${y + sy * 4} m${sx * 2} ${sy * 2} a4 4 0 0 1 ${sx * 4} ${sy * 4}`} />
              <circle cx={x + sx * 4} cy={y + sy * 4} r="0.9" fill={`url(#gd${id})`} />
            </g>
          ))}
          {[[3.6, 1], [96.4, -1]].map(([x], i) => (
            <g key={i} strokeWidth="0.35">
              <line x1={x} y1="36" x2={x} y2="104" />
              {[44, 56, 70, 84, 96].map((y) => <rect key={y} x={(x as number) - 0.9} y={y} width="1.8" height="1.8" transform={`rotate(45 ${x} ${y + 0.9})`} fill={`url(#gd${id})`} />)}
            </g>
          ))}
          {/* top crest chevrons */}
          <path d="M36 9.5 L50 4.6 L64 9.5" strokeWidth="0.45" /><path d="M40 11 L50 7.4 L60 11" strokeWidth="0.3" />
        </g>
        {/* gold leaf flakes */}
        <g fill={`url(#gd${id})`}>
          {Array.from({ length: 34 }, (_, i) => { const r = rng(700 + i); const x = 6 + r() * 88, y = 6 + r() * 128, s = 0.3 + r() * 0.9; return <polygon key={i} points={`${x},${y} ${x + s},${y + s * 0.4} ${x + s * 0.4},${y + s} ${x - s * 0.3},${y + s * 0.6}`} opacity={0.35 + r() * 0.55} />; })}
        </g>
        <ellipse cx="50" cy="14" rx="30" ry="3" fill="#FFE7A0" opacity="0.12" filter={`url(#gb${id})`} />
      </svg>

      {/* photo: stepped deco frame */}
      <At x={11} y={16} r={11} h={70} style={{ padding: cq(0.9), background: GOLD_V, clipPath: step }}>
        <div className="relative w-full h-full overflow-hidden" style={{ background: '#15120C', clipPath: step }}>
          <PhotoOr url={f.url} c={f.c} initial={f.initial} color="rgba(242,210,122,0.2)" />
          <span className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(60,40,10,0.12), transparent 40%, rgba(10,8,4,0.8) 100%)' }} />
          <span className="absolute inset-0" style={{ background: 'radial-gradient(90% 60% at 50% 20%, rgba(255,220,140,0.18), transparent 70%)', mixBlendMode: 'screen' }} />
          <span className="absolute" style={{ inset: cq(1.4), border: `${cq(0.22)} solid rgba(242,210,122,0.55)`, clipPath: step }} />
        </div>
      </At>

      {/* club line */}
      <At x={0} r={0} y={7.2} style={{ textAlign: 'center' }}>
        <span className="font-hoop font-bold uppercase leading-none" style={{ fontSize: cq(2.8), letterSpacing: cq(1), ...textFill(GOLD_V) }}>◆ {f.clubName} ◆</span>
      </At>
      {/* laurel crest with the number */}
      <At x={4} y={11} w={20} h={20}>
        <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 40 40">
          <defs><linearGradient id={`gc${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF4C8" /><stop offset="0.3" stopColor="#E9C15A" /><stop offset="0.55" stopColor="#A5761F" /><stop offset="0.8" stopColor="#F6D982" /><stop offset="1" stopColor="#9C6E1E" /></linearGradient></defs>
          {laurel(1)}{laurel(-1)}
          <circle cx="20" cy="19" r="10.5" fill="#0A0907" stroke={`url(#gc${id})`} strokeWidth="1.1" />
          <circle cx="20" cy="19" r="9" fill="none" stroke={`url(#gc${id})`} strokeWidth="0.3" />
        </svg>
        <div className="absolute flex flex-col items-center justify-center font-hoop font-black leading-none" style={{ left: 0, right: 0, top: '22%', height: '50%' }}>
          <span style={{ fontSize: cq(6.4), ...textFill(GOLD_V) }}>{f.num ?? '–'}</span>
          {f.pos && <span style={{ fontSize: cq(2.2), ...textFill(GOLD_V) }}>{f.pos}</span>}
        </div>
      </At>
      <At r={6} y={13} w={10.5} h={10.5} style={{ borderRadius: '50%', padding: cq(0.6), background: GOLD }}>
        <img src={f.logo} alt="" className="w-full h-full object-cover rounded-full bg-[#F6EFEC]" />
      </At>

      {/* name, engraved gold with deco rules */}
      <At x={6} r={6} y={89} style={{ textAlign: 'center' }}>
        {f.first && <p className="uppercase leading-none whitespace-nowrap" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: cq(3.4), letterSpacing: cq(1.4), color: '#DCCBA2' }}>{f.first}</p>}
        <div className="flex items-center justify-center" style={{ gap: cq(2) }}>
          <span style={{ flex: 1, height: cq(0.3), background: 'linear-gradient(90deg, transparent, #C99A3A)' }} />
          <p className="uppercase leading-[1.08] whitespace-nowrap font-bold" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: cq(f.fit(8.2, 10)), letterSpacing: cq(0.6), ...textFill(GOLD_V), filter: `drop-shadow(0 ${cq(0.25)} 0 #000) drop-shadow(0 0 ${cq(1.2)} rgba(240,200,100,0.35))` }}>{f.last}</p>
          <span style={{ flex: 1, height: cq(0.3), background: 'linear-gradient(270deg, transparent, #C99A3A)' }} />
        </div>
      </At>

      {/* stats with the PPG medallion */}
      <At x={8} r={8} y={105} h={20} className="flex items-center justify-between">
        {[0, 1].map((i) => { const [k, v] = statRow(f.s)[i]; return (
          <div key={k} className="text-center leading-none" style={{ width: cq(11) }}>
            <span className="font-hoop font-black block" style={{ fontSize: cq(5), color: '#F4EAD0' }}>{fmt1(v)}</span>
            <span className="font-hoop font-bold block" style={{ fontSize: cq(2.3), color: '#C99A3A', marginTop: cq(0.5), letterSpacing: cq(0.4) }}>{k}</span>
          </div>
        ); })}
        <div className="relative flex flex-col items-center justify-center" style={{ width: cq(20), height: cq(20), borderRadius: '50%', background: 'radial-gradient(circle, #1A160E 58%, transparent 60%), conic-gradient(from 0deg, #FFF4C8, #A5761F, #F6D982, #9C6E1E, #FFF4C8)', boxShadow: `0 0 ${cq(3)} rgba(240,200,100,0.35)` }}>
          <span className="font-hoop font-black leading-none" style={{ fontSize: cq(8.2), ...textFill(GOLD_V) }}>{fmt1(f.s?.ppg)}</span>
          <span className="font-hoop font-bold leading-none" style={{ fontSize: cq(2.1), color: '#E8C25A', letterSpacing: cq(0.8), marginTop: cq(0.4) }}>PPG</span>
        </div>
        {[2, 3].map((i) => { const [k, v] = statRow(f.s)[i]; return (
          <div key={k} className="text-center leading-none" style={{ width: cq(11) }}>
            <span className="font-hoop font-black block" style={{ fontSize: cq(5), color: '#F4EAD0' }}>{fmt1(v)}</span>
            <span className="font-hoop font-bold block" style={{ fontSize: cq(2.3), color: '#C99A3A', marginTop: cq(0.5), letterSpacing: cq(0.4) }}>{k}</span>
          </div>
        ); })}
      </At>
      <At x={12} r={12} y={127.4} className="flex justify-between font-hoop font-bold uppercase" style={{ fontSize: cq(2.4), color: '#9C7E45', letterSpacing: cq(0.3) }}>
        <span>{footer(f.s)}</span><span style={textFill(GOLD_V)}>ONE OF ONE · 1/1</span>
      </At>

      <Sparkles seed={55} n={16} color="#FFE7A0" area={[4, 4, 96, 136]} size={[0.5, 1.8]} />
      <Glare strength={0.2} tint="255,230,170" />
      <Sheen strength={0.4} />
      <Grain opacity={0.1} />
      <FoilEdge gradient={GOLD} width={0.8} />
    </Shell>
  );
};

// =====================================================================================================
// SERIES 6 · SUPERNOVA — deep-space nebula, star field, cracked-ice shards, lens flare, orbit rings
// =====================================================================================================
export const SupernovaCard: React.FC<TradingCardProps> = (p) => {
  const f = useFace(p);
  const id = useSvgId();
  const shards = useMemo(() => {
    const r = rng(4242), out: string[] = [];
    for (let i = 0; i < 46; i++) {
      const cx = r() * 100, cy = r() * 140, n = 3 + Math.floor(r() * 2), s = 5 + r() * 11, a0 = r() * Math.PI;
      out.push(Array.from({ length: n }, (_, k) => { const a = a0 + (k / n) * Math.PI * 2 + r() * 0.6; const d = s * (0.6 + r() * 0.6); return `${(cx + Math.cos(a) * d).toFixed(2)},${(cy + Math.sin(a) * d).toFixed(2)}`; }).join(' '));
    }
    return out;
  }, []);
  const cut = 'polygon(7% 0, 100% 0, 100% 90%, 93% 100%, 0 100%, 0 10%)';
  return (
    <Shell radius={5}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 100% at 50% 30%, #1B0F3D 0%, #0A0620 55%, #03020A 100%)' }} />
      <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none">
        <defs>
          <filter id={`nb${id}`}><feGaussianBlur stdDeviation="7" /></filter>
          <filter id={`sb${id}`}><feGaussianBlur stdDeviation="0.35" /></filter>
          <filter id={`fb${id}`}><feGaussianBlur stdDeviation="1.6" /></filter>
          <linearGradient id={`ice${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF9AD5" /><stop offset="0.33" stopColor="#9AE6FF" /><stop offset="0.66" stopColor="#B4A8FF" /><stop offset="1" stopColor="#FFF59A" /></linearGradient>
        </defs>
        {/* nebula clouds */}
        <g filter={`url(#nb${id})`}>
          <ellipse cx="25" cy="40" rx="34" ry="22" fill="#B026FF" opacity="0.45" />
          <ellipse cx="78" cy="30" rx="30" ry="24" fill="#FF2E93" opacity="0.35" />
          <ellipse cx="60" cy="96" rx="40" ry="20" fill="#2EC7FF" opacity="0.32" />
          <ellipse cx="20" cy="118" rx="28" ry="16" fill="#6A2EFF" opacity="0.4" />
        </g>
        {/* star field */}
        <g fill="#fff">
          {Array.from({ length: 150 }, (_, i) => { const r = rng(2000 + i); return <circle key={i} cx={r() * 100} cy={r() * 140} r={r() < 0.92 ? 0.12 + r() * 0.18 : 0.4 + r() * 0.3} opacity={0.35 + r() * 0.65} />; })}
        </g>
        {/* cracked-ice shards */}
        <g fill={`url(#ice${id})`} fillOpacity="0.07" stroke="rgba(255,255,255,0.32)" strokeWidth="0.16">
          {shards.map((pts, i) => <polygon key={i} points={pts} />)}
        </g>
        {/* lens flare */}
        <g>
          <circle cx="84" cy="12" r="10" fill="#fff" opacity="0.35" filter={`url(#fb${id})`} />
          <circle cx="84" cy="12" r="2.6" fill="#fff" />
          <rect x="44" y="11.6" width="80" height="0.8" fill="#fff" opacity="0.7" filter={`url(#sb${id})`} />
          <rect x="83.6" y="-20" width="0.8" height="64" fill="#fff" opacity="0.5" filter={`url(#sb${id})`} />
          {[[70, 26, 2.4, '#9AE6FF'], [58, 38, 1.4, '#FF9AD5'], [40, 56, 3.2, '#B4A8FF']].map(([x, y, rr, c], i) => <polygon key={i} points={Array.from({ length: 6 }, (_, k) => `${(x as number) + Math.cos((k / 6) * Math.PI * 2) * (rr as number)},${(y as number) + Math.sin((k / 6) * Math.PI * 2) * (rr as number)}`).join(' ')} fill={c as string} opacity="0.22" />)}
        </g>
      </svg>

      {/* photo with a cut-corner energy frame */}
      <At x={5} y={6} r={5} h={84} style={{ clipPath: cut, padding: cq(0.8), background: 'linear-gradient(135deg, #FF9AD5, #9B5CFF 35%, #2EC7FF 70%, #FFF59A)' }}>
        <div className="relative w-full h-full overflow-hidden" style={{ clipPath: cut, background: 'radial-gradient(120% 90% at 50% 10%, #3A2A7A, #0B0820)' }}>
          <PhotoOr url={f.url} c={f.c} initial={f.initial} color="rgba(180,168,255,0.2)" />
          <span className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(176,38,255,0.28), transparent 40%, rgba(46,199,255,0.22) 100%)', mixBlendMode: 'screen' }} />
          <span className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${cq(4)} rgba(155,92,255,0.7)` }} />
          <span className="absolute inset-x-0 bottom-0" style={{ height: '35%', background: 'linear-gradient(transparent, rgba(5,3,15,0.9))' }} />
        </div>
      </At>
      {/* shards flying off the frame */}
      <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 140" preserveAspectRatio="none">
        <g stroke="rgba(255,255,255,0.75)" strokeWidth="0.2">
          {[[3, 30, 2.2, 15], [1.5, 52, 1.4, -20], [97, 68, 2, 40], [98.5, 44, 1.2, 10], [6, 80, 1.6, -35], [94, 86, 2.4, 25]].map(([x, y, s, a], i) => (
            <polygon key={i} points={`${x},${y - s} ${x + s * 0.8},${y + s * 0.6} ${x - s * 0.7},${y + s * 0.4}`} transform={`rotate(${a} ${x} ${y})`} fill={['#FF9AD5', '#9AE6FF', '#B4A8FF'][i % 3]} fillOpacity="0.55" />
          ))}
        </g>
      </svg>

      {/* club */}
      <At x={8} y={9} style={{ display: 'flex', alignItems: 'center', gap: cq(1.4), padding: `${cq(0.8)} ${cq(2)} ${cq(0.8)} ${cq(0.8)}`, borderRadius: cq(6), background: 'rgba(10,6,30,0.6)', border: `${cq(0.3)} solid rgba(180,168,255,0.6)` }}>
        <img src={f.logo} alt="" className="object-cover rounded-full bg-[#F6EFEC]" style={{ width: cq(6.5), height: cq(6.5) }} />
        <span className="font-hoop font-black uppercase leading-none" style={{ fontSize: cq(3), color: '#EDE8FF', maxWidth: cq(44) }}>{f.clubName}</span>
      </At>
      {/* number orb with orbit rings */}
      <At r={6} y={7} w={21} h={21}>
        <svg aria-hidden className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 40 40">
          <defs><radialGradient id={`orb${id}`} cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFFFFF" /><stop offset="0.3" stopColor="#C9B8FF" /><stop offset="0.7" stopColor="#6A2EFF" /><stop offset="1" stopColor="#1B0F3D" /></radialGradient></defs>
          <ellipse cx="20" cy="20" rx="21" ry="6.5" fill="none" stroke="#9AE6FF" strokeWidth="0.6" opacity="0.8" transform="rotate(-20 20 20)" />
          <ellipse cx="20" cy="20" rx="19" ry="9" fill="none" stroke="#FF9AD5" strokeWidth="0.4" opacity="0.7" transform="rotate(30 20 20)" />
          <circle cx="20" cy="20" r="12.5" fill={`url(#orb${id})`} />
          <circle cx="3.5" cy="25.5" r="1.2" fill="#9AE6FF" /><circle cx="35" cy="10" r="0.9" fill="#FF9AD5" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center font-hoop font-black leading-none text-white" style={{ textShadow: `0 0 ${cq(1.2)} rgba(106,46,255,0.9)` }}>
          <span style={{ fontSize: cq(8) }}>{f.num ?? '–'}</span>
          {f.pos && <span style={{ fontSize: cq(2.5), letterSpacing: cq(0.4) }}>{f.pos}</span>}
        </div>
      </At>

      {/* name */}
      <At x={7} r={7} y={75}>
        {f.first && <p className="font-hoop font-bold uppercase leading-none whitespace-nowrap" style={{ fontSize: cq(4), letterSpacing: cq(1), color: '#C9B8FF', textShadow: `0 0 ${cq(1.4)} rgba(155,92,255,0.8)` }}>{f.first}</p>}
        <p className="font-hoop italic font-black uppercase leading-[0.95] whitespace-nowrap" style={{ fontSize: cq(f.fit(12.5, 9)), ...textFill('linear-gradient(180deg, #FFFFFF 0%, #E3DBFF 40%, #9B8CFF 70%, #FFFFFF 100%)'), filter: `drop-shadow(0 0 ${cq(1.6)} rgba(155,92,255,0.85)) drop-shadow(0 ${cq(0.3)} 0 #1B0F3D)` }}>{f.last}</p>
      </At>

      {/* glass stats panel with a constellation */}
      <At x={5} r={5} y={93} h={33} style={{ borderRadius: cq(3), background: 'linear-gradient(180deg, rgba(40,26,90,0.55), rgba(10,6,30,0.8))', border: `${cq(0.35)} solid rgba(180,168,255,0.55)`, boxShadow: `0 0 ${cq(3)} rgba(106,46,255,0.4), inset 0 ${cq(0.3)} 0 rgba(255,255,255,0.15)`, overflow: 'hidden' }}>
        <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 90 33" preserveAspectRatio="none">
          <polyline points="6,26 18,20 30,24 44,14 58,18 70,8 84,12" fill="none" stroke="rgba(180,168,255,0.35)" strokeWidth="0.3" />
          {[[6, 26], [18, 20], [30, 24], [44, 14], [58, 18], [70, 8], [84, 12]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.6" fill="#fff" opacity="0.7" />)}
        </svg>
        <div className="relative flex items-center h-full" style={{ padding: `0 ${cq(3)}`, gap: cq(3) }}>
          <div className="text-center leading-none">
            <span className="font-hoop italic font-black block" style={{ fontSize: cq(15), ...textFill('linear-gradient(180deg, #FFFFFF, #C9B8FF 55%, #7F5CFF)'), filter: `drop-shadow(0 0 ${cq(1.5)} rgba(155,92,255,0.8))` }}>{fmt1(f.s?.ppg)}</span>
            <span className="font-hoop font-black block" style={{ fontSize: cq(2.5), color: '#9AE6FF', letterSpacing: cq(1), marginTop: cq(0.4) }}>POINTS / GAME</span>
          </div>
          <div className="flex-1 grid grid-cols-2" style={{ gap: `${cq(1.6)} ${cq(2.4)}` }}>
            {statRow(f.s).map(([k, v]) => (
              <div key={k} className="leading-none" style={{ borderLeft: `${cq(0.5)} solid ${['#FF9AD5', '#9AE6FF', '#B4A8FF', '#FFF59A'][['RPG', 'APG', 'SPG', 'BPG'].indexOf(k)]}`, paddingLeft: cq(1.6) }}>
                <span className="font-hoop italic font-black block" style={{ fontSize: cq(6), color: '#fff' }}>{fmt1(v)}</span>
                <span className="font-hoop font-bold block" style={{ fontSize: cq(2.4), color: '#C9B8FF', marginTop: cq(0.3) }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      </At>
      <At x={7} r={7} y={129.6} className="flex justify-between font-hoop font-bold uppercase" style={{ fontSize: cq(2.6), color: '#A99BDF', letterSpacing: cq(0.4) }}>
        <span>{footer(f.s)}</span><span style={textFill('linear-gradient(90deg, #FF9AD5, #9AE6FF, #FFF59A)')}>SERIES 6 · SUPERNOVA</span>
      </At>

      <Sparkles seed={66} n={22} area={[2, 2, 98, 138]} size={[0.5, 2.2]} />
      <Glare strength={0.3} tint="230,220,255" />
      <Sheen strength={0.45} />
      <Grain opacity={0.1} />
      <FoilEdge gradient="linear-gradient(135deg, #FF9AD5, #9B5CFF 30%, #2EC7FF 60%, #FFF59A 85%, #FF9AD5)" width={1} />
    </Shell>
  );
};

// =====================================================================================================
// SERIES 7 · ROYAL CREST — the club's own artwork (club logo in the round badge) (public/hoop-cards/royal-frame.webp, hollow centre is
// transparent). The photo sits BEHIND the frame; number goes in the top shield, name + stats on the plate.
// =====================================================================================================
const ROYAL_GOLD = 'linear-gradient(180deg, #FFF7D6 0%, #F4D57A 32%, #C9952F 58%, #FFE9A8 80%, #A97A22 100%)';
export const RoyalCard: React.FC<TradingCardProps> = (p) => {
  const f = useFace(p);
  const stats: [string, number | undefined][] = [['PPG', f.s?.ppg], ...statRow(f.s)];
  const editing = !!p.onCropChange;
  const drag = useDragCrop(f.c, p.onCropChange || (() => {}));
  return (
    <Shell radius={1.6} /* gold rim, then a royal-blue glow around the whole card */ glow={`0 0 ${cq(0.9)} rgba(255,214,110,0.95), 0 0 ${cq(2.6)} rgba(240,180,60,0.6), 0 0 ${cq(5)} rgba(50,110,255,0.95), 0 0 ${cq(10)} rgba(40,95,245,0.7), 0 0 ${cq(16)} rgba(30,80,230,0.4)`}>
      <div className="absolute inset-0" style={{ background: '#0A1430' }} />
      {/* photo shows through the frame's hollow centre */}
      <div ref={editing ? drag.box : undefined} {...(editing ? drag.handlers : {})} role={editing ? 'slider' : undefined} tabIndex={editing ? 0 : undefined}
        aria-label={editing ? 'Card photo position. Drag, or use the arrow keys.' : undefined}
        className={`absolute overflow-hidden ${editing ? `touch-none outline-none ${drag.active ? 'cursor-grabbing' : 'cursor-grab'}` : ''}`}
        style={{ left: cq(14.5), right: cq(14.5), top: cq(16), height: cq(87), background: 'radial-gradient(90% 60% at 50% 30%, #2C4C8C 0%, #12224A 60%, #0A1430 100%)' }}>
        <PhotoOr url={f.url} c={f.c} initial={f.initial} color="rgba(127,216,255,0.22)" />
        <span className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,20,48,0.25), transparent 30%, transparent 70%, rgba(10,20,48,0.55))' }} />
      </div>
      <img src="/hoop-cards/royal-frame.webp" alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* club logo in the round badge (top-left) */}
      <At x={9} y={10.85} w={10.2} h={10.2} className="overflow-hidden pointer-events-none" style={{ borderRadius: '50%', background: '#F6EFEC', boxShadow: `inset 0 0 ${cq(1)} rgba(0,0,0,0.5)` }}>
        <img src={f.logo} alt="" className="w-full h-full object-cover" />
      </At>

      {editing && (
        <At x={0} r={0} y={88} className="flex justify-center pointer-events-none">
          <span className="flex items-center rounded-full font-bold text-white" style={{ gap: cq(1), padding: `${cq(1)} ${cq(2.6)}`, fontSize: cq(3), background: 'rgba(0,0,0,0.6)' }}>{drag.active ? 'Moving…' : 'Drag the photo'}</span>
        </At>
      )}

      {/* LEVEL 2 CARD over the bottom-right of the photo */}
      <At r={16.5} y={77} w={17} className="flex justify-center"><LevelBadge n={2} scale={0.85} tone="royal" /></At>

      {/* top shield: number + position */}
      <At x={35} w={30} y={9.2} h={14.5} className="pointer-events-none flex flex-col items-center justify-center font-hoop font-black leading-none">
        <span style={{ fontSize: cq(f.num != null && f.num >= 10 ? 10 : 11), ...textFill(ROYAL_GOLD), filter: `drop-shadow(0 ${cq(0.3)} 0 rgba(0,0,0,0.7))` }}>{f.num ?? '–'}</span>
        {f.pos && <span style={{ fontSize: cq(2.6), color: '#9FE3FF', letterSpacing: cq(0.6), marginTop: cq(0.3) }}>{f.pos}</span>}
      </At>

      {/* bottom plate: club, name, stats */}
      <At x={12} r={12} y={100.6} h={29.4} className="flex flex-col items-center text-center">
        {f.first && <p className="font-hoop font-bold uppercase leading-none whitespace-nowrap" style={{ fontSize: cq(4.4), letterSpacing: cq(1), color: '#DCEBFF', marginTop: cq(1.4) }}>{f.first}</p>}
        {/* last name in a sporty script; padding keeps the swashes from being cut off by the gold text fill */}
        <p className="whitespace-nowrap" style={{ fontFamily: '"Yellowtail", "Brush Script MT", cursive', fontWeight: 400, fontSize: cq(f.fit(12.5, 9)), lineHeight: 1.1, padding: `0 ${cq(2)} ${cq(0.6)}`, margin: `${cq(-0.6)} 0 ${cq(-1)}`, ...textFill(ROYAL_GOLD), filter: `drop-shadow(0 ${cq(0.35)} 0 rgba(0,0,0,0.85))` }}>{f.last}</p>
        <span style={{ width: '88%', height: cq(0.3), margin: `${cq(0.4)} 0 ${cq(0.8)}`, background: 'linear-gradient(90deg, transparent, #E9C15A 20%, #FFF2C4 50%, #E9C15A 80%, transparent)' }} />
        <div className="flex w-full justify-around">
          {stats.map(([k, v], i) => (
            <div key={k} className="leading-none" style={{ width: cq(12) }}>
              <span className="font-hoop font-black block" style={{ fontSize: cq(i === 0 ? 5.2 : 4.4), ...(i === 0 ? textFill(ROYAL_GOLD) : { color: '#F2F7FF' }) }}>{fmt1(v)}</span>
              <span className="font-hoop font-bold block" style={{ fontSize: cq(1.9), color: '#E2B954', letterSpacing: cq(0.5), marginTop: cq(0.5) }}>{k}</span>
            </div>
          ))}
        </div>
        <p className="font-hoop font-bold uppercase leading-none" style={{ marginTop: cq(1.6), fontSize: cq(1.8), color: '#7FA6D6', letterSpacing: cq(0.4) }}>{footer(f.s)}</p>
      </At>


      {/* glossy light streak on top of everything (club artwork, transparent PNG) */}
      <img src="/hoop-cards/royal-gloss.webp" alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
    </Shell>
  );
};

// =====================================================================================================
// LEVEL 3 · STARLIGHT — the club's own "HOOP METHOD" glitter & gold frame (public/hoop-cards/level3-frame.webp,
// photo window transparent with its soft shadow). Logo in the left circle, number + position in the right one,
// PPG and "LEVEL 3 CARD" over the bottom of the photo, last name on the plate, other stats in the bottom bar.
// Text is white with a black stroke; LEVEL 3 and the first name use the script font.
// =====================================================================================================
/** White letters with a black stroke and a light gold glow. */
const whiteGold = (w = 0.3) => whiteStroke(w, '#000000', true);
const silver = (w = 0.3) => whiteGold(w);
const goldText = () => whiteGold(0.2);

export const StarlightCard: React.FC<TradingCardProps> = (p) => {
  const f = useFace(p);
  const editing = !!p.onCropChange;
  const drag = useDragCrop(f.c, p.onCropChange || (() => {}));
  const last = f.last.toUpperCase();
  const lastSize = Math.min(6.4, 18.6 / Math.max(1, last.length * 0.5));          // fits the name plate
  const club = f.clubName.toUpperCase();
  const clubSize = Math.min(2.9, 19.5 / Math.max(1, club.length * 0.5));   // stays clear of the plate's two stars
  const stats: [string, number | undefined][] = [['APG', f.s?.apg], ['RPG', f.s?.rpg], ['BPG', f.s?.bpg], ['SPG', f.s?.spg]];
  return (
    <Shell radius={1.6} /* soft silver glow around the whole card */ glow={`0 0 ${cq(1.2)} rgba(240,244,250,0.85), 0 0 ${cq(4)} rgba(220,228,242,0.55), 0 0 ${cq(9)} rgba(200,212,235,0.3)`}>
      <div className="absolute inset-0" style={{ background: '#0A1430' }} />
      {/* photo behind the frame's window */}
      <div ref={editing ? drag.box : undefined} {...(editing ? drag.handlers : {})} role={editing ? 'slider' : undefined} tabIndex={editing ? 0 : undefined}
        aria-label={editing ? 'Card photo position. Drag, or use the arrow keys.' : undefined}
        className={`absolute overflow-hidden ${editing ? `touch-none outline-none ${drag.active ? 'cursor-grabbing' : 'cursor-grab'}` : ''}`}
        style={{ left: cq(8.6), right: cq(8.6), top: cq(19), height: cq(108.5), background: 'radial-gradient(90% 60% at 50% 30%, #2C4C8C 0%, #12224A 60%, #0A1430 100%)' }}>
        <PhotoOr url={f.url} c={f.c} initial={f.initial} color="rgba(246,201,76,0.22)" />
        {/* darker bottom so PPG, LEVEL and the name read well over any photo */}
        <span className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent 0%, transparent 62%, rgba(6,14,40,0.55) 80%, rgba(6,14,40,0.85) 100%)' }} />
      </div>
      <img src="/hoop-cards/level3-frame.webp" alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />

      {editing && (
        <At x={0} r={0} y={60} className="flex justify-center pointer-events-none">
          <span className="flex items-center rounded-full font-bold text-white" style={{ gap: cq(1), padding: `${cq(1)} ${cq(2.6)}`, fontSize: cq(3), background: 'rgba(0,0,0,0.6)' }}>{drag.active ? 'Moving…' : 'Drag the photo'}</span>
        </At>
      )}

      <div className="absolute inset-0 pointer-events-none font-hoop leading-none">
        {/* club line in the small plate under HOOP METHOD */}
        <At x={38.2} w={25} y={16.1} h={5} className="flex items-center justify-center" style={{ paddingTop: cq(0.25) }}>
          <span className="font-black whitespace-nowrap" style={{ fontSize: cq(clubSize), letterSpacing: cq(0.35), ...goldText() }}>{club}</span>
        </At>
        {/* left circle: club logo */}
        <At x={10.05} y={21.15} w={12.45} h={12.45} className="overflow-hidden" style={{ borderRadius: '50%', background: '#F6EFEC', boxShadow: `inset 0 0 0 ${cq(0.25)} rgba(138,90,14,0.9)` }}>
          <img src={f.logo} alt="" className="w-full h-full object-cover" style={{ transform: 'scale(1.06)' }} />
        </At>
        {/* right circle: number + position */}
        <At x={78.3} y={21.4} w={12} h={12} className="flex flex-col items-center justify-center">
          <span className="font-black" style={{ fontSize: cq(f.num != null && f.num >= 10 ? 7.4 : 8.4), ...silver(0.28) }}>{f.num ?? '–'}</span>
          {f.pos && <span className="font-black" style={{ fontSize: cq(2.3), letterSpacing: cq(0.3), marginTop: cq(0.3), ...goldText() }}>{f.pos}</span>}
        </At>

        {/* PPG (left) and LEVEL 3 CARD (right) over the bottom of the photo */}
        <At x={11} w={24} y={102.5} className="flex flex-col items-center">
          <span className="font-black" style={{ fontSize: cq(10), ...silver(0.35) }}>{fmt1(f.s?.ppg)}</span>
          <span className="font-black" style={{ fontSize: cq(3.4), letterSpacing: cq(0.5), marginTop: cq(0.6), ...goldText() }}>PPG</span>
        </At>
        <At r={11} w={22} y={101} className="flex justify-center"><LevelBadge n={3} glow /></At>

        {/* first name above the plate, last name big on the plate */}
        {f.first && (
          <At x={24} r={24} y={110.2} className="flex justify-center">
            <span className="whitespace-nowrap" style={{ fontFamily: '"Yellowtail", "Brush Script MT", cursive', fontSize: cq(Math.min(5.6, 80 / Math.max(1, f.first.length * 0.62))), lineHeight: 1.1, padding: `0 ${cq(1.2)}`, ...whiteGold(0.25) }}>{f.first}</span>
          </At>
        )}
        <At x={40.4} w={19.4} y={117.7} h={7.4} className="flex items-center justify-center">
          <span className="font-black whitespace-nowrap" style={{ fontSize: cq(lastSize), ...silver(0.3) }}>{last}</span>
        </At>

        {/* other stats in the bottom bar */}
        <At x={18} r={18} y={127.9} h={6.3} className="grid grid-cols-4 items-center">
          {stats.map(([k, v]) => (
            <span key={k} className="flex items-baseline justify-center" style={{ gap: cq(0.6), paddingTop: cq(0.3) }}>
              <span className="font-black" style={{ fontSize: cq(4.1), ...silver(0.22) }}>{fmt1(v)}</span>
              <span className="font-black" style={{ fontSize: cq(1.9), letterSpacing: cq(0.2), ...goldText() }}>{k}</span>
            </span>
          ))}
        </At>
      </div>
    </Shell>
  );
};

// =====================================================================================================
// 1-OF-1 — the club's own 1-of-1 artwork (public/hoop-cards/oneofone-frame.webp: notched card, transparent photo
// window + corners). Photo behind, the player's NAME ONLY on the gold plate, golden glow around the card.
// CARD BACK — the club's own back artwork (public/hoop-cards/card-back.webp) with an orange glow.
// =====================================================================================================
/** Where the winner's signature sits on the 1-of-1 (card grid units: 100 wide × 140 tall) — over the lower photo, above the shield. */
export const SIG_ZONE = { x: 12, y: 70, w: 76, h: 26 };

export const OneOfOneCard: React.FC<TradingCardProps & { glow?: boolean; signature?: string | null }> = (props) => {
  const { glow = true, signature, ...p } = props;
  const f = useFace(p as TradingCardProps);
  const editing = !!p.onCropChange;
  const drag = useDragCrop(f.c, p.onCropChange || (() => {}));
  const name = (p as TradingCardProps).person.display_name.trim().toUpperCase();
  const size = Math.min(4.8, 62 / Math.max(1, name.length * 0.52));
  return (
    <div className="relative w-full aspect-[5/7] select-none" style={{
      containerType: 'inline-size',
      filter: glow ? `drop-shadow(0 0 ${cq(1)} rgba(255,214,110,0.95)) drop-shadow(0 0 ${cq(3.5)} rgba(255,184,60,0.7)) drop-shadow(0 0 ${cq(8)} rgba(240,160,40,0.4))` : undefined,
    }}>
      <div ref={editing ? drag.box : undefined} {...(editing ? drag.handlers : {})} role={editing ? 'slider' : undefined} tabIndex={editing ? 0 : undefined}
        aria-label={editing ? 'Card photo position. Drag, or use the arrow keys.' : undefined}
        className={`absolute overflow-hidden ${editing ? `touch-none outline-none ${drag.active ? 'cursor-grabbing' : 'cursor-grab'}` : ''}`}
        style={{ left: cq(11.5), right: cq(11.5), top: cq(26), height: cq(93), background: 'radial-gradient(90% 60% at 50% 30%, #3A3220 0%, #15120C 70%)' }}>
        <PhotoOr url={f.url} c={f.c} initial={f.initial} color="rgba(242,210,122,0.25)" />
      </div>
      <img src="/hoop-cards/oneofone-frame.webp" alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
      {editing && (
        <At x={0} r={0} y={62} className="flex justify-center pointer-events-none">
          <span className="flex items-center rounded-full font-bold text-white" style={{ padding: `${cq(1)} ${cq(2.6)}`, fontSize: cq(3), background: 'rgba(0,0,0,0.6)' }}>{drag.active ? 'Moving…' : 'Drag the photo'}</span>
        </At>
      )}
      {/* the winner's own signature (transparent picture), written across the photo */}
      {signature && (
        <At x={SIG_ZONE.x} y={SIG_ZONE.y} w={SIG_ZONE.w} h={SIG_ZONE.h} className="pointer-events-none">
          <img src={signature} alt="Signed" draggable={false} className="w-full h-full object-contain" style={{ filter: `drop-shadow(0 ${cq(0.25)} ${cq(0.3)} rgba(0,0,0,0.55))` }} />
        </At>
      )}
      {/* name only, on the gold plate */}
      <At x={18} r={18} y={121.7} h={6.8} className="flex items-center justify-center pointer-events-none">
        <span className="font-hoop font-black whitespace-nowrap leading-none" style={{ fontSize: cq(size), letterSpacing: cq(0.35), color: '#141A3A', textShadow: `0 ${cq(0.2)} 0 rgba(255,240,190,0.65)` }}>{name}</span>
      </At>
    </div>
  );
};

export const CardBack: React.FC<{ club?: { name: string; logo_url: string | null } | null; glow?: boolean }> = ({ glow = true }) => (
  <div className="relative w-full aspect-[5/7] select-none" style={{
    containerType: 'inline-size',
    filter: glow ? `drop-shadow(0 0 ${cq(1)} rgba(255,150,60,0.95)) drop-shadow(0 0 ${cq(4)} rgba(255,120,30,0.65)) drop-shadow(0 0 ${cq(9)} rgba(255,100,20,0.35))` : undefined,
  }}>
    <img src="/hoop-cards/card-back.webp" alt="" draggable={false} className="absolute inset-0 w-full h-full" />
  </div>
);

// ------------------------------------------------------------------------------------------------ tilt
/**
 * Tilting a card with a finger / mouse: the card turns slightly in 3D and the glare (and the holo rainbow)
 * follows the finger, like a real foil card under a light. Purely visual — nothing is saved.
 */
export const TiltCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const b = el.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
    el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    el.style.transform = `perspective(900px) rotateY(${((x - 0.5) * 14).toFixed(2)}deg) rotateX(${((0.5 - y) * 14).toFixed(2)}deg)`;
  };
  const leave = () => { const el = ref.current; if (!el) return; el.style.transform = ''; el.style.removeProperty('--gx'); el.style.removeProperty('--gy'); };
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave} className={className}
      style={{ transition: 'transform 0.25s ease-out', transformStyle: 'preserve-3d', touchAction: 'pan-y' }}>
      {children}
    </div>
  );
};

/** The cards in use, in order. Each player moves to card 2 after THEIR 2nd finished schedule (see ClubCard.tsx). */
export const CARD_SERIES: CardSeries[] = [
  { n: 1, key: 'glow', name: 'Glow', tagline: 'Your first card — gold glow and light streaks.', Comp: TradingCard },
  { n: 2, key: 'royal', name: 'Royal Crest', tagline: 'Gold & sapphire frame with the club badge, crest shield and a gold nameplate. Players get it after their 2nd finished schedule.', Comp: RoyalCard, unlock: 'After 2 schedules' },
  { n: 3, key: 'starlight', name: 'Starlight', tagline: 'HOOP METHOD glitter & gold frame — logo and number circles, PPG and LEVEL 3 over the photo. Players get it after their 3rd finished schedule.', Comp: StarlightCard, unlock: 'After 3 schedules' },
  { n: 4, key: 'oneofone', name: '1 of 1', tagline: 'The rare card — only the player you pick wins it from a card pack each schedule. Name only, golden glow.', Comp: OneOfOneCard, unlock: 'Pack winner only' },
];
