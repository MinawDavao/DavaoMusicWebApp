import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Building2, Camera, Check, Eye, EyeOff, MousePointerClick, Pencil, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { checkFile, errorMessage, removeImageByUrl, uploadImage, type Sponsor } from '../../lib/db';
import { useAuth } from '../../context/AuthContext';
import { SPONSOR_COLS } from '../../components/SponsoredSpotlight';
import { Avatar, ErrorNote, Field, FilePick, Spinner, btn, inputCls } from '../../components/ui';
import { ActBtn, Chip, DeleteBtn, OpenBtn, Row } from './kit';

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

const status = (s: Sponsor): [string, 'mint' | 'amber' | 'gray' | 'red'] => {
  const now = Date.now();
  if (!s.is_active) return ['Off', 'gray'];
  if (s.starts_at && new Date(s.starts_at).getTime() > now) return ['Scheduled', 'amber'];
  if (s.ends_at && new Date(s.ends_at).getTime() <= now) return ['Ended', 'red'];
  return ['Live', 'mint'];
};

export const AdminSponsors: React.FC = () => {
  const [list, setList] = useState<Sponsor[] | null>(null);
  const [editing, setEditing] = useState<Sponsor | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from('sponsors').select(SPONSOR_COLS).order('sort_order').order('created_at', { ascending: false });
    if (error) setErr(errorMessage(error));
    setList((data as unknown as Sponsor[]) || []);
  };
  useEffect(() => { load(); }, []);

  const patch = async (s: Sponsor, p: Partial<Sponsor>) => {
    const { error } = await supabase.from('sponsors').update(p).eq('id', s.id);
    if (error) return setErr(errorMessage(error));
    load();
  };
  const move = async (i: number, dir: -1 | 1) => {
    if (!list) return;
    const j = i + dir; if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    // renumber everything so the order is always clean
    const order = [...list]; order[i] = b; order[j] = a;
    await Promise.all(order.map((s, k) => (s.sort_order !== k + 1 ? supabase.from('sponsors').update({ sort_order: k + 1 }).eq('id', s.id) : null)));
    load();
  };

  if (editing) return <SponsorForm initial={editing === 'new' ? null : editing} nextOrder={(list?.length || 0) + 1} onDone={() => { setEditing(null); load(); }} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[#8E9AA7] leading-relaxed">These rotate in the Sponsored Spotlight on Home and Deals. Only “Live” ones are shown to users, in this order.</p>
        <button onClick={() => setEditing('new')} className={`${btn.primary} !py-2 !text-xs flex-shrink-0`}><Plus className="w-4 h-4" />New sponsor</button>
      </div>
      <ErrorNote text={err} />
      {list === null ? <Spinner /> : list.length === 0 ? <p className="text-xs text-[#8E9AA7]">No sponsors yet. Add the first one.</p> : list.map((s, i) => {
        const [label, tone] = status(s);
        return (
          <Row key={s.id} dim={label !== 'Live'}
            thumb={s.image_url ? <img src={s.image_url} alt="" className="w-20 h-14 rounded-xl object-cover bg-[#252D37]" /> : <span className="block w-20 h-14 rounded-xl bg-[#252D37]" />}
            title={s.title}
            sub={<>
              <p className="text-[11px] text-[#8E9AA7]">{s.sponsor_name}{s.promo_code ? ` · code ${s.promo_code}` : ''}</p>
              {(s.starts_at || s.ends_at) && <p className="text-[11px] text-[#8E9AA7]">{s.starts_at ? `From ${new Date(s.starts_at).toLocaleDateString()}` : 'Now'} → {s.ends_at ? new Date(s.ends_at).toLocaleDateString() : 'no end date'}</p>}
              {s.venue && <p className="flex items-center gap-1 text-[11px] text-[#FFC34D]"><Building2 className="w-3 h-3" />Linked to {s.venue.display_name}</p>}
            </>}
            chips={<><Chip tone={tone}>{label}</Chip><Chip><MousePointerClick className="w-3 h-3" />{s.clicks} click{s.clicks === 1 ? '' : 's'}</Chip></>}
            actions={<>
              <ActBtn onClick={() => setEditing(s)}><Pencil className="w-3.5 h-3.5" />Edit</ActBtn>
              <ActBtn onClick={() => patch(s, { is_active: !s.is_active })}>{s.is_active ? <><EyeOff className="w-3.5 h-3.5" />Turn off</> : <><Eye className="w-3.5 h-3.5" />Turn on</>}</ActBtn>
              <ActBtn onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></ActBtn>
              <ActBtn onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></ActBtn>
              {s.venue && <OpenBtn to={{ name: 'profile', id: s.venue.id }} label="Business page" />}
              <DeleteBtn onDelete={async () => {
                if (!confirm(`Delete the sponsor “${s.title}”? This can’t be undone. (Use “Turn off” to just hide it.)`)) return;
                const { error } = await supabase.from('sponsors').delete().eq('id', s.id);
                if (error) return setErr(errorMessage(error));
                if (s.image_url?.includes('/sponsors/')) await removeImageByUrl(s.image_url);
                load();
              }} />
            </>}
          />
        );
      })}
    </div>
  );
};

type Biz = { id: string; display_name: string; username: string; avatar_url: string | null };

/** Search Venue/Business accounts to link a sponsor to their MINAW DAVAO page. */
const BusinessPicker: React.FC<{ value: Biz | null; onChange: (b: Biz | null) => void }> = ({ value, onChange }) => {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Biz[]>([]);
  useEffect(() => {
    const s = q.trim().replace(/[%_,()\\]/g, '');
    if (!s) { setRes([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, display_name, username, avatar_url').eq('role', 'venue')
        .or(`display_name.ilike.%${s}%,username.ilike.%${s}%`).limit(6);
      setRes((data as Biz[]) || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#FFB800]/10 border border-[#FFB800]/40">
        <Avatar src={value.avatar_url} name={value.display_name} size={32} square />
        <span className="flex-1 min-w-0"><span className="block text-[13px] font-bold text-white truncate">{value.display_name}</span><span className="block font-mono text-[10px] text-[#8E9AA7]">@{value.username}</span></span>
        <button type="button" onClick={() => onChange(null)} aria-label="Unlink business" className={btn.icon}><X className="w-4 h-4" /></button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <input aria-label="Search Venue/Business accounts" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search their Venue/Business account…" className={inputCls} />
      {res.map((b) => (
        <button key={b.id} type="button" onClick={() => { onChange(b); setQ(''); }} className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-[#161B20] border border-white/10 text-left cursor-pointer hover:border-white/30">
          <Avatar src={b.avatar_url} name={b.display_name} size={28} square />
          <span className="text-[13px] font-bold text-white">{b.display_name}</span><span className="font-mono text-[10px] text-[#8E9AA7]">@{b.username}</span>
        </button>
      ))}
      {q.trim() && res.length === 0 && <p className="text-[11px] text-[#8E9AA7]">No Venue/Business account matches. They can sign up as “Venue/Business” first.</p>}
    </div>
  );
};

const SponsorForm: React.FC<{ initial: Sponsor | null; nextOrder: number; onDone: () => void }> = ({ initial, nextOrder, onDone }) => {
  const { user } = useAuth();
  const [f, setF] = useState({
    title: initial?.title ?? '', sponsor_name: initial?.sponsor_name ?? '', badge: initial?.badge ?? '', tagline: initial?.tagline ?? '',
    details: initial?.details ?? '', cta_text: initial?.cta_text ?? 'Learn More', promo_code: initial?.promo_code ?? '',
    link_url: initial?.link_url ?? '', contact: initial?.contact ?? '',
    starts_at: toLocal(initial?.starts_at ?? null), ends_at: toLocal(initial?.ends_at ?? null),
  });
  const [image, setImage] = useState<string | null>(initial?.image_url ?? null);
  const [biz, setBiz] = useState<Biz | null>(initial?.venue ? { ...initial.venue } as Biz : null);
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.title.trim() || !f.sponsor_name.trim()) return setErr('Please add a headline and the sponsor’s name.');
    if (f.link_url.trim() && !/^https?:\/\//i.test(f.link_url.trim())) return setErr('The link should start with https:// (copy it from the browser address bar).');
    if (f.starts_at && f.ends_at && new Date(f.ends_at) <= new Date(f.starts_at)) return setErr('The end date must be after the start date.');
    setBusy(true); setErr(null);
    const row = {
      title: f.title.trim(), sponsor_name: f.sponsor_name.trim(), badge: f.badge.trim() || null, tagline: f.tagline.trim() || null,
      details: f.details.trim() || null, cta_text: f.cta_text.trim() || 'Learn More', promo_code: f.promo_code.trim() || null,
      link_url: f.link_url.trim() || null, contact: f.contact.trim() || null, venue_id: biz?.id ?? null, image_url: image,
      is_active: active, starts_at: fromLocal(f.starts_at), ends_at: fromLocal(f.ends_at),
    };
    const { error } = initial
      ? await supabase.from('sponsors').update(row).eq('id', initial.id)
      : await supabase.from('sponsors').insert({ ...row, sort_order: nextOrder });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    if (initial?.image_url && initial.image_url !== image && initial.image_url.includes('/sponsors/')) await removeImageByUrl(initial.image_url);
    onDone();
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-lg text-white">{initial ? 'Edit sponsor' : 'New sponsor'}</h2>
        <button onClick={onDone} aria-label="Close without saving" className={btn.icon}><X className="w-4 h-4" /></button>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-bold text-white">Banner image</p>
        <FilePick accept="image/jpeg,image/png,image/webp" disabled={uploading} onPick={async (file) => {
          const bad = checkFile(file, 'image'); if (bad) return setErr(bad);
          setUploading(true); setErr(null);
          try {
            const url = await uploadImage('sponsors', user!.id, file);
            if (image && image !== initial?.image_url && image.includes('/sponsors/')) await removeImageByUrl(image); // an unsaved earlier pick
            setImage(url);
          } catch (e) { setErr(errorMessage(e)); }
          setUploading(false);
        }} className="block w-full h-40 rounded-2xl border-[1.5px] border-dashed border-white/15 bg-[#0F1417] overflow-hidden cursor-pointer">
          {image ? <img src={image} alt="Sponsor banner" className="w-full h-full object-cover" /> : (
            <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-[#8E9AA7] text-xs font-bold"><Camera className="w-5 h-5" />{uploading ? 'Uploading…' : 'Upload a wide image (JPG/PNG, max 5 MB)'}</span>
          )}
        </FilePick>
        {image && <p className="text-[10px] text-[#8E9AA7]">Tap the image to replace it. Wide (landscape) photos look best.</p>}
      </div>

      <Field label="Headline" htmlFor="s-title"><input id="s-title" maxLength={120} className={inputCls} value={f.title} onChange={set('title')} placeholder="e.g. Gear Sale: 30% off pedals" /></Field>
      <Field label="Sponsor / business name" htmlFor="s-name"><input id="s-name" maxLength={80} className={inputCls} value={f.sponsor_name} onChange={set('sponsor_name')} placeholder="e.g. MTS Music Hub" /></Field>
      <Field label="Short line under the headline" htmlFor="s-tag" hint="optional"><input id="s-tag" maxLength={200} className={inputCls} value={f.tagline} onChange={set('tagline')} /></Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Badge" htmlFor="s-badge" hint="optional"><input id="s-badge" maxLength={40} className={inputCls} value={f.badge} onChange={set('badge')} placeholder="WEEKEND PROMO" /></Field>
        <Field label="Promo code" htmlFor="s-code" hint="optional"><input id="s-code" maxLength={40} className={inputCls} value={f.promo_code} onChange={set('promo_code')} placeholder="MINAW20" /></Field>
      </div>
      <Field label="Full details (shown when tapped)" htmlFor="s-det" hint={`${f.details.length} / 1000`}><textarea id="s-det" rows={4} maxLength={1000} className={`${inputCls} py-3 resize-none`} value={f.details} onChange={set('details')} /></Field>
      <Field label="Button text" htmlFor="s-cta"><input id="s-cta" maxLength={30} className={inputCls} value={f.cta_text} onChange={set('cta_text')} /></Field>

      <div className="space-y-3 p-3 rounded-2xl bg-[#0F1417] border border-white/15">
        <p className="text-[13px] font-bold text-white">Where people can reach them</p>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#FFC34D]"><Building2 className="w-4 h-4" />Their MINAW DAVAO Venue/Business page</p>
          <BusinessPicker value={biz} onChange={setBiz} />
        </div>
        <Field label="Website / Facebook link" htmlFor="s-link" hint="optional"><input id="s-link" maxLength={500} className={inputCls} value={f.link_url} onChange={set('link_url')} placeholder="https://facebook.com/theirpage" /></Field>
        <Field label="Contact (phone or email)" htmlFor="s-contact" hint="optional"><input id="s-contact" maxLength={120} className={inputCls} value={f.contact} onChange={set('contact')} placeholder="+63 9XX XXX XXXX" /></Field>
      </div>

      <div className="space-y-2 p-3 rounded-2xl bg-[#0F1417] border border-white/15">
        <p className="text-[13px] font-bold text-white">Schedule <span className="font-normal text-[11px] text-[#8E9AA7]">(optional, leave empty to show right away with no end)</span></p>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Start" htmlFor="s-start"><input id="s-start" type="datetime-local" className={inputCls} value={f.starts_at} onChange={set('starts_at')} /></Field>
          <Field label="End" htmlFor="s-end"><input id="s-end" type="datetime-local" className={inputCls} value={f.ends_at} onChange={set('ends_at')} /></Field>
        </div>
        <label className="flex items-center gap-2.5 text-[13px] text-white cursor-pointer pt-1"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-[#53E6D4]" />Turned on</label>
      </div>

      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={onDone} className={`${btn.ghost} flex-1`}>Cancel</button>
        <button onClick={save} disabled={busy || uploading} className={`${btn.mint} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save sponsor'}</button>
      </div>
    </div>
  );
};
