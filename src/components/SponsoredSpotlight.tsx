import React, { useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, ExternalLink, Phone, Sparkles, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Sponsor } from '../lib/db';
import { useNav } from '../nav';
import { Modal, btn } from './ui';

export const SPONSOR_COLS = '*, venue:profiles!sponsors_venue_id_fkey(id, display_name, username, avatar_url)';

const safeLink = (u: string | null) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
const telLink = (c: string | null) => (c && /^[+\d][\d\s()-]{6,}$/.test(c.trim()) ? `tel:${c.replace(/[^+\d]/g, '')}` : null);
const mailLink = (c: string | null) => (c && /^\S+@\S+\.\S+$/.test(c.trim()) ? `mailto:${c.trim()}` : null);

/** Sponsored Spotlight carousel. Sponsors are managed in the Admin Panel → Sponsors. */
export const SponsoredSpotlight: React.FC<{ onGoToDeals?: () => void; compact?: boolean }> = ({ onGoToDeals, compact = false }) => {
  const go = useNav();
  const [ads, setAds] = useState<Sponsor[]>([]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState<Sponsor | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // RLS only returns active sponsors inside their date window (admins also see inactive ones, so filter here too)
    const now = Date.now();
    supabase.from('sponsors').select(SPONSOR_COLS).eq('is_active', true).order('sort_order').order('created_at', { ascending: false })
      .then(({ data }) => setAds(((data as unknown as Sponsor[]) || []).filter((s) =>
        (!s.starts_at || new Date(s.starts_at).getTime() <= now) && (!s.ends_at || new Date(s.ends_at).getTime() > now))));
  }, []);

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
  const openAd = (ad: Sponsor) => {
    setOpen(ad);
    supabase.rpc('record_sponsor_click', { p_id: ad.id }).then(() => {}, () => {});
  };

  const ad = ads[idx] || ads[0];
  if (!ad) return null;
  const prev = () => setIdx((i) => (i - 1 + ads.length) % ads.length);
  const next = () => setIdx((i) => (i + 1) % ads.length);
  const img = ad.image_url || '/og-image.png';

  return (
    <section className="space-y-2.5" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex items-center justify-between px-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Tag className="w-3.5 h-3.5 text-[#6045F4]" />
          <span>Sponsored Spotlight</span>
        </div>
        {ads.length > 1 && (
          <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-full border border-white/10">
            <button onClick={prev} aria-label="Previous spotlight" className="w-6 h-6 rounded-full hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className="text-[10px] text-slate-300 font-mono">{idx + 1} / {ads.length}</span>
            <button onClick={next} aria-label="Next spotlight" className="w-6 h-6 rounded-full hover:bg-white/15 text-white flex items-center justify-center cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-gradient-to-b from-[#181D24] to-[#12161A] border border-[#6045F4]/30 overflow-hidden">
        {compact ? (
          <div className="flex gap-3 p-3">
            <img src={img} alt="" className="w-20 h-20 rounded-xl object-cover bg-[#252D37] flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#A78BFA] truncate">{ad.sponsor_name}</span>
                {ad.promo_code && <span className="text-[9px] font-mono font-bold text-[#53E6D4] bg-[#53E6D4]/10 border border-[#53E6D4]/30 px-1.5 py-0.5 rounded-full">{ad.promo_code}</span>}
              </div>
              <p className="text-[13px] font-bold text-white leading-snug">{ad.title}</p>
              {ad.tagline && <p className="text-[11px] text-[#8E9AA7] truncate">{ad.tagline}</p>}
              <button onClick={() => openAd(ad)} className="mt-1 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#6045F4] text-white text-[11px] font-bold cursor-pointer">{ad.cta_text} <ChevronRight className="w-3 h-3" /></button>
            </div>
          </div>
        ) : (
          <>
            <button className="relative block w-full h-48 sm:h-56 overflow-hidden bg-black cursor-pointer" onClick={() => openAd(ad)} aria-label={`Open ${ad.title}`}>
              <img src={img} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#181D24] via-black/20 to-black/50" />
              {ad.badge && (
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/80 border border-[#53E6D4]/40 text-[#53E6D4] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />{ad.badge}
                </span>
              )}
              {ads.length > 1 && (
                <span className="absolute bottom-3 left-3 flex gap-1.5">
                  {ads.map((_, i) => <span key={i} className={`h-1.5 rounded-full ${i === idx ? 'w-6 bg-[#53E6D4]' : 'w-2 bg-white/40'}`} />)}
                </span>
              )}
            </button>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#A78BFA] uppercase tracking-wider">Featured Sponsor</span>
                <span className="text-slate-300 truncate">{ad.sponsor_name}</span>
              </div>
              <h3 className="font-heading font-extrabold text-white text-base sm:text-lg leading-snug">{ad.title}</h3>
              {ad.tagline && <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">{ad.tagline}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => openAd(ad)} className={btn.primary}>{ad.cta_text} <ChevronRight className="w-4 h-4" /></button>
                  {onGoToDeals && <button onClick={onGoToDeals} className={btn.ghost}>Deals Hub <ExternalLink className="w-3.5 h-3.5 text-[#53E6D4]" /></button>}
                </div>
                {ad.promo_code && (
                  <button onClick={() => copy(ad.promo_code!)} className="flex items-center gap-2 bg-[#0C1014] px-3 py-1.5 rounded-xl border border-white/10 text-xs cursor-pointer">
                    <span className="text-[10px] text-slate-400 font-mono">Code:</span>
                    <span className="font-mono font-bold text-[#53E6D4]">{ad.promo_code}</span>
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
          <span className="text-xs text-slate-400 font-mono">{open.sponsor_name}</span>
          {open.image_url && <img src={open.image_url} alt="" className="w-full h-44 rounded-xl object-cover bg-black" />}
          {open.details && <p className="text-sm text-[#CBD5E1] leading-relaxed whitespace-pre-line">{open.details}</p>}
          {open.promo_code && (
            <div className="p-3 rounded-xl bg-[#0F1417] border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Promo Code</span>
                <span className="text-sm font-mono font-bold text-[#53E6D4]">{open.promo_code}</span>
              </div>
              <button onClick={() => copy(open.promo_code!)} className={btn.primary}>{copied ? 'Copied ✓' : 'Copy Code'}</button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {open.venue && (
              <button onClick={() => { setOpen(null); go({ name: 'profile', id: open.venue!.id }); }} className={`${btn.mint} w-full`}>
                <Building2 className="w-4 h-4" />View {open.venue.display_name} on MINAW DAVAO
              </button>
            )}
            {safeLink(open.link_url) && (
              <a href={safeLink(open.link_url)!} target="_blank" rel="noopener noreferrer sponsored" className={`${btn.primary} w-full`}>
                <ExternalLink className="w-4 h-4" />Visit their page
              </a>
            )}
            {open.contact && (
              (telLink(open.contact) || mailLink(open.contact))
                ? <a href={(telLink(open.contact) || mailLink(open.contact))!} className={`${btn.ghost} w-full`}><Phone className="w-4 h-4" />{open.contact}</a>
                : <p className="flex items-center justify-center gap-2 text-xs text-[#EBEBED]"><Phone className="w-4 h-4 text-[#53E6D4]" />{open.contact}</p>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
};
