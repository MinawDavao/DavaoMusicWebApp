import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, BadgeCheck, Camera, Check, Flag, Globe, Lock, MapPin, Plus, Search, Send, Tag, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  CATEGORY_LABELS, CONDITION_LABELS, DEAL_LABELS, checkFile, errorMessage, peso, publicUrl, timeAgo, uploadFile,
  type DealType, type GearCategory, type GearCondition, type Listing,
} from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { SponsoredSpotlight } from '../components/SponsoredSpotlight';
import { ReportModal } from '../components/ReportModal';
import { Avatar, EmptyState, ErrorNote, Field, FilePick, OkNote, Spinner, btn, inputCls } from '../components/ui';

type TypeFilter = 'all' | 'sale' | 'trade' | 'wtb';
const TYPE_TABS: { key: TypeFilter; label: string; types: DealType[] }[] = [
  { key: 'all', label: 'All', types: [] },
  { key: 'sale', label: 'For Sale', types: ['for_sale', 'sale_or_trade'] },
  { key: 'trade', label: 'For Trade', types: ['for_trade', 'sale_or_trade'] },
  { key: 'wtb', label: 'WTB', types: ['looking_to_buy'] },
];
const DEAL_STYLE: Record<DealType, string> = {
  for_sale: 'bg-[#53E6D4] text-[#0F1417]',
  sale_or_trade: 'bg-[#53E6D4] text-[#0F1417]',
  for_trade: 'bg-[#6045F4] text-white',
  looking_to_buy: 'bg-[#FFB800] text-[#0F1417]',
};

export const DealsScreen: React.FC = () => {
  const go = useNav();
  const { user, termsAccepted } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Listing[]>([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [cat, setCat] = useState<GearCategory | 'all'>('all');
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const load = useCallback(async () => {
    let query = supabase
      .from('listings')
      .select('*, profiles(id, display_name, avatar_url, role, instagram, facebook, is_verified), listing_photos(id, image_path, position)')
      .neq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(60);
    const tab = TYPE_TABS.find((t) => t.key === type)!;
    if (tab.types.length) query = query.in('deal_type', tab.types);
    if (cat !== 'all') query = query.eq('category', cat);
    const s = q.trim();
    if (s) query = query.textSearch('search', s, { type: 'websearch', config: 'simple' });
    const { data } = await query;
    setItems((data as Listing[]) || []);
    setLoading(false);
  }, [q, type, cat]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const canPost = !!user && termsAccepted;

  return (
    <div className="px-3 py-4 space-y-6">
      <SponsoredSpotlight compact />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2.5">
          <div>
            <h1 className="font-heading font-bold text-lg text-white">Gear Exchange <span className="text-[#53E6D4]">({items.length})</span></h1>
            <p className="text-[11px] text-[#8E9AA7]">Buy, sell &amp; trade gear across Davao</p>
          </div>
          {canPost && !posting && <button onClick={() => { setPosted(false); setPosting(true); }} className={`${btn.mint} !py-2 !text-[13px] whitespace-nowrap`}><Plus className="w-4 h-4" />Post a Deal</button>}
        </div>

        {!user && (
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#1B1D33] border border-[#6045F4]/40">
            <Lock className="w-5 h-5 text-[#B7A8FF] flex-shrink-0" />
            <span className="flex-1 text-xs text-[#EBEBED]">Log in as a Fan or Artist to post your own gear deals.</span>
            <button onClick={() => go({ name: 'auth' })} className={`${btn.primary} !py-1.5 !text-xs`}>Log In</button>
          </div>
        )}
        {user && !termsAccepted && (
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#1B1D33] border border-[#6045F4]/40">
            <span className="flex-1 text-xs text-[#EBEBED]">Accept the Terms of Agreement to post deals.</span>
            <button onClick={() => go({ name: 'onboarding' })} className={`${btn.primary} !py-1.5 !text-xs`}>Review Terms</button>
          </div>
        )}

        {posting && <PostDeal onCancel={() => setPosting(false)} onPosted={() => { setPosting(false); setPosted(true); setQ(''); setType('all'); setCat('all'); load(); }} />}
        <OkNote text={posted ? 'Your deal is live at the top of Gear Exchange.' : null} />

        <div className="flex items-center gap-2 h-12 pl-3.5 pr-2 rounded-2xl bg-[#161B20] border border-white/15">
          <Search className="w-4 h-4 text-[#8E9AA7]" />
          <label htmlFor="deal-search" className="sr-only">Search deals</label>
          <input id="deal-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search gear, brand, district…" className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[#EBEBED]" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="w-8 h-8 rounded-full bg-[#252D37] text-white flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>}
        </div>
        <div role="group" aria-label="Deal type" className="flex gap-0.5 p-1 rounded-xl bg-[#161B20] border border-white/[0.08]">
          {TYPE_TABS.map((t) => (
            <button key={t.key} onClick={() => setType(t.key)} className={`flex-1 h-8 rounded-lg text-xs font-bold cursor-pointer ${type === t.key ? 'bg-[#6045F4] text-white' : 'text-[#8E9AA7]'}`}>{t.label}</button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(['all', ...Object.keys(CATEGORY_LABELS)] as (GearCategory | 'all')[]).map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`flex-shrink-0 h-8 px-3 rounded-full text-[11px] font-bold cursor-pointer border whitespace-nowrap ${cat === c ? 'bg-[#6045F4] border-[#6045F4] text-white' : 'bg-[#161B20] border-white/15 text-[#8E9AA7]'}`}>
              {c === 'all' ? 'All Categories' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : items.length === 0 ? (
          q || type !== 'all' || cat !== 'all'
            ? <EmptyState icon={Search} title="No deals match your search" text="Try another keyword, deal type or category." action={<button onClick={() => { setQ(''); setType('all'); setCat('all'); }} className={btn.ghost}>Clear filters</button>} />
            : <EmptyState icon={Tag} title="There are no deals posted yet" text="Be the first to sell, trade or ask for gear in the Davao scene." />
        ) : items.map((it) => <ListingCard key={it.id} it={it} onReport={() => setReport(it.id)} onChange={load} />)}
      </section>

      {report && <ReportModal targetType="listing" targetId={report} label="this listing" onClose={() => setReport(null)} onLogin={() => go({ name: 'auth' })} />}
    </div>
  );
};

const ListingCard: React.FC<{ it: Listing; onReport: () => void; onChange: () => void }> = ({ it, onReport, onChange }) => {
  const go = useNav();
  const { user } = useAuth();
  const [contact, setContact] = useState(false);
  const mine = it.seller_id === user?.id;
  const photos = [...(it.listing_photos || [])].sort((a, b) => a.position - b.position);
  const [pi, setPi] = useState(0);
  const photo = photos[pi];

  const markSold = async () => { await supabase.from('listings').update({ status: it.status === 'sold' ? 'active' : 'sold' }).eq('id', it.id); onChange(); };
  const remove = async () => {
    if (!confirm('Delete this listing?')) return;
    await supabase.from('listings').delete().eq('id', it.id);
    if (photos.length) await supabase.storage.from('gear-photos').remove(photos.map((p) => p.image_path));
    onChange();
  };

  return (
    <article className="rounded-2xl bg-[#1D232A] border border-white/[0.08] p-3.5 space-y-3">
      <div className="flex items-center gap-2.5">
        <button onClick={() => go({ name: 'profile', id: it.seller_id })} className="cursor-pointer"><Avatar src={it.profiles?.avatar_url} name={it.profiles?.display_name} size={38} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-white truncate">{it.profiles?.display_name || 'Member'}</span>
            {it.profiles?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-[#53E6D4]" />}
            <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${it.profiles?.role === 'artist' ? 'bg-[#6045F4]/20 text-[#B7A8FF]' : 'bg-white/5 text-[#EBEBED]'}`}>{it.profiles?.role === 'artist' ? 'BAND' : 'FAN'}</span>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-[#8E9AA7]"><MapPin className="w-2.5 h-2.5 text-[#53E6D4]" />{it.district || 'Davao City'} • {timeAgo(it.created_at)}</span>
        </div>
        <span className={`px-2 py-1 rounded-full text-[9px] font-bold whitespace-nowrap ${it.status === 'sold' ? 'bg-[#252D37] text-[#8E9AA7]' : DEAL_STYLE[it.deal_type]}`}>{it.status === 'sold' ? 'SOLD' : DEAL_LABELS[it.deal_type].toUpperCase()}</span>
      </div>
      <div className="flex justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-[9px] font-bold tracking-wider text-[#53E6D4]">{CATEGORY_LABELS[it.category].toUpperCase()} • {CONDITION_LABELS[it.condition].toUpperCase()}</p>
          <h3 className="font-heading font-bold text-[15px] leading-snug text-white">{it.title}</h3>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-heading font-bold text-[17px] text-[#53E6D4] whitespace-nowrap">{peso(it.price)}</p>
          <p className="text-[9px] text-[#8E9AA7]">{it.deal_type === 'looking_to_buy' ? 'budget' : 'PHP'}</p>
        </div>
      </div>
      {it.description && <p className="text-xs text-[#8E9AA7] leading-relaxed whitespace-pre-line">{it.description}</p>}
      {it.trade_wishlist && (
        <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-[#6045F4]/15 border border-[#6045F4]/35 text-xs leading-relaxed">
          <ArrowLeftRight className="w-3.5 h-3.5 text-[#B7A8FF] mt-0.5 flex-shrink-0" />
          <span><strong className="text-[#B7A8FF]">{it.deal_type === 'looking_to_buy' ? 'Wants:' : 'Trade Wishlist:'}</strong> {it.trade_wishlist}</span>
        </div>
      )}
      {photo && (
        <div className="relative">
          <img src={publicUrl('gear-photos', photo.image_path)!} alt={it.title} className="w-full h-56 object-cover rounded-xl bg-[#252D37]" />
          {photos.length > 1 && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
              {photos.map((_, i) => <button key={i} onClick={() => setPi(i)} aria-label={`Photo ${i + 1}`} className={`h-2 rounded-full cursor-pointer ${i === pi ? 'w-5 bg-[#53E6D4]' : 'w-2 bg-white/60'}`} />)}
            </div>
          )}
        </div>
      )}
      {it.specs?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{it.specs.map((s) => <span key={s} className="px-2 py-1 rounded-md bg-[#161B20] border border-white/[0.08] font-mono text-[10px]">✓ {s}</span>)}</div>
      )}
      {contact && (
        <div className="p-3 rounded-xl bg-[#161B20] border border-white/[0.08] text-xs space-y-1.5">
          <p className="font-bold text-white">Contact {it.profiles?.display_name}</p>
          {it.profiles?.instagram && <p className="flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />{it.profiles.instagram}</p>}
          {it.profiles?.facebook && <p className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#53E6D4]" />{it.profiles.facebook}</p>}
          {!it.profiles?.instagram && !it.profiles?.facebook && <p className="text-[#8E9AA7]">This seller hasn’t added contact links yet. Leave a comment on their Connect posts or visit their profile.</p>}
          <p className="text-[10px] text-[#8E9AA7]">Meet in safe public places. MINAW DVO isn’t part of the deal.</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        {mine ? (
          <>
            <button onClick={markSold} className={`${btn.ghost} !py-2 !text-xs`}><Check className="w-3.5 h-3.5" />{it.status === 'sold' ? 'Mark Active' : 'Mark Sold'}</button>
            <span className="flex-1" />
            <button onClick={remove} aria-label="Delete listing" className={btn.icon}><Trash2 className="w-4 h-4" /></button>
          </>
        ) : (
          <>
            <button onClick={() => setContact(!contact)} className={`${btn.primary} !py-2 !text-xs`}><Send className="w-3.5 h-3.5" />Inquire / Offer</button>
            <button onClick={() => go({ name: 'profile', id: it.seller_id })} className={`${btn.ghost} !py-2 !text-xs`}>Seller Profile</button>
            <span className="flex-1" />
            <button onClick={onReport} aria-label="Report listing" className={btn.icon}><Flag className="w-4 h-4" /></button>
          </>
        )}
      </div>
    </article>
  );
};

const PostDeal: React.FC<{ onCancel: () => void; onPosted: () => void }> = ({ onCancel, onPosted }) => {
  const { user, profile, band } = useAuth();
  const [deal, setDeal] = useState<DealType>('for_sale');
  const [cat, setCat] = useState<GearCategory>('guitars_bass');
  const [cond, setCond] = useState<GearCondition>('like_mint');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [wish, setWish] = useState('');
  const [desc, setDesc] = useState('');
  const [specs, setSpecs] = useState('');
  const [district, setDistrict] = useState(profile?.district || '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsWish = deal !== 'for_sale';
  const ok = title.trim().length >= 3 && (deal === 'for_trade' || price.trim() !== '');

  const pill = <T extends string>(val: T, cur: T, set: (v: T) => void, label: string) => (
    <button key={val} type="button" onClick={() => set(val)} className={`h-8 px-3 rounded-full text-xs font-bold cursor-pointer border ${cur === val ? 'bg-[#6045F4] border-[#6045F4] text-white' : 'bg-[#0F1417] border-white/15 text-[#EBEBED]'}`}>{label}</button>
  );

  const submit = async () => {
    if (!ok || !user) return;
    setBusy(true); setErr(null);
    try {
      const { data, error } = await supabase.from('listings').insert({
        seller_id: user.id, band_id: band?.id ?? null, title: title.trim(), category: cat, deal_type: deal, condition: cond,
        price: price.trim() ? Number(price.replace(/[^0-9.]/g, '')) : null, trade_wishlist: needsWish ? wish.trim() || null : null,
        description: desc.trim() || null, specs: specs.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6), district: district.trim() || null,
      }).select('id').single();
      if (error) throw error;
      for (let i = 0; i < files.length; i++) {
        const path = await uploadFile('gear-photos', user.id, files[i]);
        const { error: pe } = await supabase.from('listing_photos').insert({ listing_id: (data as any).id, image_path: path, position: i });
        if (pe) throw pe;
      }
      onPosted();
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl bg-[#1D232A] border border-[#53E6D4]/45 p-4 space-y-3.5">
      <div className="flex items-center justify-between">
        <div><h2 className="font-heading font-bold text-lg text-white">Post a Deal</h2><p className="text-[11px] text-[#8E9AA7]">Sell, trade or ask for gear in the Davao scene</p></div>
        <button onClick={onCancel} aria-label="Close" className={btn.icon}><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2"><p className="text-[13px] font-bold text-white">Listing Type</p><div className="flex flex-wrap gap-1.5">{(Object.keys(DEAL_LABELS) as DealType[]).map((d) => pill(d, deal, setDeal, DEAL_LABELS[d]))}</div></div>
      <Field label="Item Title" htmlFor="d-title"><input id="d-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Boss DS-1 Distortion (Made in Japan)" /></Field>
      <div className="space-y-2"><p className="text-[13px] font-bold text-white">Category</p><div className="flex flex-wrap gap-1.5">{(Object.keys(CATEGORY_LABELS) as GearCategory[]).map((c) => pill(c, cat, setCat, CATEGORY_LABELS[c]))}</div></div>
      <div className="space-y-2"><p className="text-[13px] font-bold text-white">Condition</p><div className="flex flex-wrap gap-1.5">{(Object.keys(CONDITION_LABELS) as GearCondition[]).map((c) => pill(c, cond, setCond, CONDITION_LABELS[c]))}</div></div>
      <Field label={deal === 'looking_to_buy' ? 'Budget (₱)' : deal === 'for_trade' ? 'Value (₱, optional)' : 'Asking Price (₱)'} htmlFor="d-price">
        <input id="d-price" inputMode="decimal" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
      </Field>
      {needsWish && <Field label={deal === 'looking_to_buy' ? 'What exactly are you looking for?' : 'What would you trade for?'} htmlFor="d-wish"><input id="d-wish" className={inputCls} value={wish} onChange={(e) => setWish(e.target.value)} /></Field>}
      <Field label="Description" htmlFor="d-desc" hint="condition, inclusions, meetup"><textarea id="d-desc" rows={4} className={`${inputCls} py-3 resize-none`} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <Field label="Key Specs" htmlFor="d-specs" hint="comma separated"><input id="d-specs" className={inputCls} value={specs} onChange={(e) => setSpecs(e.target.value)} /></Field>
      <div className="space-y-2">
        <p className="flex items-center text-[13px] font-bold text-white">Photos <span className="ml-auto text-[10px] font-medium text-[#8E9AA7]">{files.length} / 5</span></p>
        <div className="grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-[#252D37]">
              <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/70 text-white flex items-center justify-center cursor-pointer"><X className="w-3 h-3" /></button>
            </div>
          ))}
          {files.length < 5 && (
            <FilePick accept="image/jpeg,image/png,image/webp" multiple onPick={() => {}} onPickMany={(fs) => {
              const good = fs.filter((f) => !checkFile(f, 'image'));
              if (good.length < fs.length) setErr('Some photos were skipped (JPG/PNG/WebP up to 5 MB only).');
              setFiles([...files, ...good].slice(0, 5));
            }} className="aspect-square rounded-xl border-[1.5px] border-dashed border-[#53E6D4] bg-[#53E6D4]/5 text-[#53E6D4] text-[10px] font-bold flex flex-col items-center justify-center gap-1 cursor-pointer">
              <Plus className="w-5 h-5" />Add
            </FilePick>
          )}
        </div>
      </div>
      <Field label="Meetup District" icon={MapPin} htmlFor="d-dist"><input id="d-dist" className={inputCls} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Matina, Davao City" /></Field>
      <ErrorNote text={err} />
      <button onClick={submit} disabled={!ok || busy} className={`${btn.mint} w-full h-12`}><Send className="w-4 h-4" />{busy ? 'Posting…' : 'Post Deal'}</button>
      <p className="-mt-2 text-center text-[11px] text-[#8E9AA7]">{ok ? 'Your deal will appear at the top of Gear Exchange.' : 'Add a title and price to post.'}</p>
    </div>
  );
};
