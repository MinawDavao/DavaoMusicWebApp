import React, { useRef, useState } from 'react';
import { Camera, Move, RotateCcw, Trash2, ZoomIn } from 'lucide-react';
import { Avatar, FilePick, btn } from './ui';
import { Lightbox } from './Zoom';

/** Which part of the card photo shows: focus point (0–100 %) and zoom (1–3×). */
export interface CardCrop { x: number; y: number; zoom: number }
export const DEFAULT_CROP: CardCrop = { x: 50, y: 50, zoom: 1 };
export const cropOf = (c: any): CardCrop => ({
  x: Number.isFinite(c?.x) ? Math.min(100, Math.max(0, c.x)) : 50,
  y: Number.isFinite(c?.y) ? Math.min(100, Math.max(0, c.y)) : 50,
  zoom: Number.isFinite(c?.zoom) ? Math.min(3, Math.max(1, c.zoom)) : 1,
});

const FADE_LEFT = 'linear-gradient(to left, #000 25%, transparent 95%)';
const FADE_DOWN = 'linear-gradient(to bottom, #000 40%, transparent 100%)';

/** The photo layer itself (fills its box), cropped to the chosen focus point and zoom. */
export const Photo: React.FC<{ url: string; crop: CardCrop }> = ({ url, crop }) => (
  <img
    src={url}
    alt=""
    draggable={false}
    className="absolute inset-0 w-full h-full object-cover select-none"
    style={{ objectPosition: `${crop.x}% ${crop.y}%`, transform: `scale(${crop.zoom})`, transformOrigin: `${crop.x}% ${crop.y}%` }}
  />
);

/**
 * Soft background photo on the right side of a profile card, fading out toward the avatar and the bottom.
 * The box is always 75% of the card width with a 4:3 shape, so the editor preview matches the real card.
 */
export const CardBackdrop: React.FC<{ url: string; crop?: any }> = ({ url, crop }) => (
  <div aria-hidden="true" className="absolute top-0 right-0 w-[75%] aspect-[4/3] pointer-events-none" style={{ maskImage: FADE_DOWN, WebkitMaskImage: FADE_DOWN }}>
    <div className="relative w-full h-full overflow-hidden" style={{ opacity: 0.32, maskImage: FADE_LEFT, WebkitMaskImage: FADE_LEFT }}>
      <Photo url={url} crop={cropOf(crop)} />
    </div>
  </div>
);

/** Editor: drag the photo to choose what shows, zoom with the slider. Shows a mini profile card preview. */
export const CardBackgroundAdjuster: React.FC<{
  url: string; crop: CardCrop; onChange: (c: CardCrop) => void; avatar: string | null; name: string; square?: boolean;
}> = ({ url, crop, onChange, avatar, name, square }) => {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; start: CardCrop } | null>(null);
  const [active, setActive] = useState(false);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, start: crop };
    setActive(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; const el = box.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    // Moving the photo right shows more of its left side, so the focus point moves the opposite way.
    const k = 1.6 / d.start.zoom;
    onChange({
      ...d.start,
      x: Math.min(100, Math.max(0, d.start.x - ((e.clientX - d.px) / r.width) * 100 * k)),
      y: Math.min(100, Math.max(0, d.start.y - ((e.clientY - d.py) / r.height) * 100 * k)),
    });
  };
  const onUp = () => { drag.current = null; setActive(false); };
  const nudge = (dx: number, dy: number) => onChange({ ...crop, x: Math.min(100, Math.max(0, crop.x + dx)), y: Math.min(100, Math.max(0, crop.y + dy)) });

  return (
    <div className="space-y-2">
      {/* mini card: 16:9 so the 75%-wide 4:3 photo box fills its full height, same as the real card */}
      <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden bg-[#1D232A] border border-white/10">
        <div className="absolute top-0 right-0 w-[75%] aspect-[4/3]" style={active ? undefined : { maskImage: FADE_DOWN, WebkitMaskImage: FADE_DOWN }}>
          <div
            ref={box}
            role="slider"
            tabIndex={0}
            aria-label="Card photo position. Drag, or use the arrow keys."
            aria-valuetext={`${Math.round(crop.x)}% across, ${Math.round(crop.y)}% down`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 3;
              if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); }
              if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); }
              if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); }
              if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step); }
            }}
            className={`relative w-full h-full overflow-hidden touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#53E6D4] ${active ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={active ? { opacity: 0.9 } : { opacity: 0.32, maskImage: FADE_LEFT, WebkitMaskImage: FADE_LEFT }}
          >
            <Photo url={url} crop={crop} />
          </div>
        </div>
        {/* fake card content, so you can see how readable it stays */}
        <div className="absolute left-3 top-3 space-y-1.5 pointer-events-none">
          <Avatar src={avatar} name={name} size={46} square={square} ring />
          <p className="font-heading font-bold text-sm text-white drop-shadow">{name || 'Your name'}</p>
          <span className="block w-20 h-1.5 rounded bg-white/20" />
        </div>
        <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-[10px] font-bold text-white pointer-events-none">
          <Move className="w-3 h-3" />{active ? 'Moving…' : 'Drag to move'}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <ZoomIn className="w-4 h-4 text-[#8E9AA7] flex-shrink-0" />
        <input
          type="range" min={1} max={3} step={0.05} value={crop.zoom}
          onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) })}
          aria-label="Zoom card photo"
          className="flex-1 accent-[#53E6D4]"
        />
        <button type="button" onClick={() => onChange(DEFAULT_CROP)} className="flex items-center gap-1 text-[11px] font-bold text-[#8E9AA7] hover:text-white cursor-pointer">
          <RotateCcw className="w-3.5 h-3.5" />Reset
        </button>
      </div>
    </div>
  );
};

// ================================================================ BAND COVER PHOTO (3:1 banner on the band page)

/** Drag-to-move + keyboard arrows for any crop box. */
export function useDragCrop(crop: CardCrop, onChange: (c: CardCrop) => void) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; start: CardCrop } | null>(null);
  const [active, setActive] = useState(false);
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { px: e.clientX, py: e.clientY, start: crop };
      setActive(true);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current; const el = box.current;
      if (!d || !el) return;
      const r = el.getBoundingClientRect();
      const k = 1.6 / d.start.zoom;
      onChange({ ...d.start, x: clamp(d.start.x - ((e.clientX - d.px) / r.width) * 100 * k), y: clamp(d.start.y - ((e.clientY - d.py) / r.height) * 100 * k) });
    },
    onPointerUp: () => { drag.current = null; setActive(false); },
    onPointerCancel: () => { drag.current = null; setActive(false); },
    onKeyDown: (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 3;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const m = mv[e.key]; if (!m) return;
      e.preventDefault();
      onChange({ ...crop, x: clamp(crop.x + m[0]), y: clamp(crop.y + m[1]) });
    },
  };
  return { box, active, handlers };
}

/** The band page cover: always 3:1, cropped to the artist’s chosen position. Tap to see the full photo. */
export const CoverPhoto: React.FC<{ url: string | null; crop?: any; alt: string }> = ({ url, crop, alt }) => {
  const [open, setOpen] = useState(false);
  if (!url) return <div className="w-full aspect-[3/1] bg-[#252D37]" />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`View ${alt} full size`} className="relative block w-full aspect-[3/1] overflow-hidden bg-[#252D37] cursor-zoom-in">
        <Photo url={url} crop={cropOf(crop)} />
      </button>
      {open && <Lightbox images={[url]} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
};

/** Editor for the band cover: same 3:1 shape as the band page, drag to move, slider to zoom. */
export const CoverAdjuster: React.FC<{
  url: string; crop: CardCrop; onChange: (c: CardCrop) => void; logo?: string | null; name?: string;
}> = ({ url, crop, onChange, logo, name }) => {
  const { box, active, handlers } = useDragCrop(crop, onChange);
  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={box}
          role="slider"
          tabIndex={0}
          aria-label="Cover photo position. Drag, or use the arrow keys."
          aria-valuetext={`${Math.round(crop.x)}% across, ${Math.round(crop.y)}% down`}
          {...handlers}
          className={`relative w-full aspect-[3/1] rounded-xl overflow-hidden bg-[#252D37] touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#53E6D4] ${active ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <Photo url={url} crop={crop} />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-[10px] font-bold text-white pointer-events-none">
            <Move className="w-3 h-3" />{active ? 'Moving…' : 'Drag to move'}
          </span>
        </div>
        {/* where the logo sits on the band page, so nothing important hides behind it */}
        {(logo || name) && (
          <span className="absolute left-3 -bottom-6 pointer-events-none opacity-90"><Avatar src={logo ?? null} name={name} size={48} square ring /></span>
        )}
      </div>
      <div className={`flex items-center gap-2.5 ${logo || name ? 'pl-16' : ''}`}>
        <ZoomIn className="w-4 h-4 text-[#8E9AA7] flex-shrink-0" />
        <input type="range" min={1} max={3} step={0.05} value={crop.zoom} onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) })} aria-label="Zoom cover photo" className="flex-1 accent-[#53E6D4]" />
        <button type="button" onClick={() => onChange(DEFAULT_CROP)} className="flex items-center gap-1 text-[11px] font-bold text-[#8E9AA7] hover:text-white cursor-pointer"><RotateCcw className="w-3.5 h-3.5" />Reset</button>
      </div>
    </div>
  );
};

/** Cover photo field used in artist sign-up and Edit Band Page: pick a photo, then drag/zoom it into place. */
export const CoverField: React.FC<{
  url: string | null; crop: CardCrop; onCrop: (c: CardCrop) => void; onPick: (f: File) => void; onRemove?: () => void;
  uploading?: boolean; logo?: string | null; name?: string;
}> = ({ url, crop, onCrop, onPick, onRemove, uploading, logo, name }) => (
  <div className="space-y-2">
    <p className="text-[13px] font-bold text-white">Cover photo</p>
    {url ? (
      <>
        <p className="text-[11px] text-[#8E9AA7]">Drag the photo so the important part (faces, your logo) isn’t cut off, and zoom with the slider. This is exactly how it shows on your band page.</p>
        <CoverAdjuster url={url} crop={crop} onChange={onCrop} logo={logo} name={name} />
        <div className="flex gap-2 pt-1">
          <FilePick accept="image/jpeg,image/png,image/webp" onPick={onPick} disabled={uploading} className={`${btn.ghost} !py-1.5 !text-xs`}><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />{uploading ? 'Uploading…' : 'Change cover'}</FilePick>
          {onRemove && <button type="button" onClick={onRemove} className={`${btn.ghost} !py-1.5 !text-xs`}><Trash2 className="w-3.5 h-3.5" />Remove</button>}
        </div>
      </>
    ) : (
      <FilePick accept="image/jpeg,image/png,image/webp" onPick={onPick} disabled={uploading} className="block w-full aspect-[3/1] rounded-2xl border-[1.5px] border-dashed border-white/15 bg-[#0F1417] overflow-hidden cursor-pointer">
        <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-[#8E9AA7] text-xs font-bold"><Camera className="w-5 h-5" />{uploading ? 'Uploading…' : 'Add a cover photo (wide photos look best)'}</span>
      </FilePick>
    )}
  </div>
);
