import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles, Tag } from 'lucide-react';
import { SPONSORS } from '../data/sponsors';
import type { AdvertisementItem } from '../types';
import { Modal, btn } from './ui';

/** Sponsored Spotlight carousel (kept as-is; sponsors will be managed by an admin later). */
export const SponsoredSpotlight: React.FC<{ onGoToDeals?: () => void; compact?: boolean }> = ({ onGoToDeals, compact = false }) => {
  const ads = SPONSORS;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState<AdvertisementItem | null>(null);
  const [copied, setCopied] = useState(false);
  const ad = ads[idx] || ads[0];

  useEffect(() => {
    if (paused || ads.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % ads.length), 5000);
    return () => clearInterval(t);
  }, [paused, ads.length]);

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!ad) return null;
  const prev = () => setIdx((i) => (i - 1 + ads.length) % ads.length);
  const next = () => setIdx((i) => (i + 1) % ads.length);

  return (
    <section className="space-y-2.5" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex items-center justify-between px-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Tag className="w-3.5 h-3.5 text-[#6045F4]" />
          <span>Sponsored Spotlight</span>
        </div>
        <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-full border border-white/10">
          <button onClick={prev} aria-label="Previous spotlight" className="w-6 h-6 rounded-full hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <span className="text-[10px] text-slate-300 font-mono">{idx + 1} / {ads.length}</span>
          <button onClick={next} aria-label="Next spotlight" className="w-6 h-6 rounded-full hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-b from-[#181D24] to-[#12161A] border border-[#6045F4]/30 overflow-hidden">
        {compact ? (
          <div className="flex gap-3 p-3">
            <img src={ad.imageUrl} alt="" className="w-20 h-20 rounded-xl object-cover bg-[#252D37] flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#A78BFA] truncate">{ad.sponsorName}</span>
                {ad.promoCode && <span className="text-[9px] font-mono font-bold text-[#53E6D4] bg-[#53E6D4]/10 border border-[#53E6D4]/30 px-1.5 py-0.5 rounded-full">{ad.promoCode}</span>}
              </div>
              <p className="text-[13px] font-bold text-white leading-snug">{ad.title}</p>
              <p className="text-[11px] text-[#8E9AA7] truncate">{ad.tagline}</p>
              <button onClick={() => setOpen(ad)} className="mt-1 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#6045F4] text-white text-[11px] font-bold cursor-pointer">{ad.ctaText} <ChevronRight className="w-3 h-3" /></button>
            </div>
          </div>
        ) : (
          <>
            <button className="relative block w-full h-48 sm:h-56 overflow-hidden bg-black cursor-pointer" onClick={() => setOpen(ad)} aria-label={`Open ${ad.title}`}>
              <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#181D24] via-black/20 to-black/50" />
              <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/80 border border-[#53E6D4]/40 text-[#53E6D4] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />{ad.badge}
              </span>
              <span className="absolute bottom-3 left-3 flex gap-1.5">
                {ads.map((_, i) => <span key={i} className={`h-1.5 rounded-full ${i === idx ? 'w-6 bg-[#53E6D4]' : 'w-2 bg-white/40'}`} />)}
              </span>
            </button>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#A78BFA] uppercase tracking-wider">Featured Sponsor</span>
                <span className="text-slate-300 truncate">{ad.sponsorName}</span>
              </div>
              <h3 className="font-heading font-extrabold text-white text-base sm:text-lg leading-snug">{ad.title}</h3>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">{ad.tagline}</p>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => setOpen(ad)} className={btn.primary}>{ad.ctaText} <ChevronRight className="w-4 h-4" /></button>
                  {onGoToDeals && <button onClick={onGoToDeals} className={btn.ghost}>Deals Hub <ExternalLink className="w-3.5 h-3.5 text-[#53E6D4]" /></button>}
                </div>
                {ad.promoCode && (
                  <button onClick={() => copy(ad.promoCode!)} className="flex items-center gap-2 bg-[#0C1014] px-3 py-1.5 rounded-xl border border-white/10 text-xs cursor-pointer">
                    <span className="text-[10px] text-slate-400 font-mono">Code:</span>
                    <span className="font-mono font-bold text-[#53E6D4]">{ad.promoCode}</span>
                    <span className="text-[10px] text-slate-400">{copied ? '✓ Copied' : '(copy)'}</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)}>
          <span className="text-xs text-slate-400 font-mono">{open.sponsorName}</span>
          <img src={open.imageUrl} alt="" className="w-full h-44 rounded-xl object-cover bg-black" />
          <p className="text-sm text-[#CBD5E1] leading-relaxed">{open.details}</p>
          {open.promoCode && (
            <div className="p-3 rounded-xl bg-[#0F1417] border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Promo Code</span>
                <span className="text-sm font-mono font-bold text-[#53E6D4]">{open.promoCode}</span>
              </div>
              <button onClick={() => copy(open.promoCode!)} className={btn.primary}>{copied ? 'Copied ✓' : 'Copy Code'}</button>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
};
