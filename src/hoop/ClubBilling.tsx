import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarClock, Crown, Lock, Receipt, Trash2, Upload, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ErrorNote, FilePick, OkNote } from '../components/ui';
import { MessageButton } from '../screens/MessagesScreen';
import { CLUB_PRICE, GCASH_NUMBER, GCASH_QR, H, HOOP_MAIN_ADMIN_ID, clubBilling, hbtn, hinput, longDate, ordinal, useClubUnlocks, type HoopClub } from './lib';
import { ONE_FRAME, OneOfOneCard } from './CardDesigns';

/**
 * CLUB SUBSCRIPTIONS — every new club gets a 1-month free trial, then ₱400/month.
 * Owners pay by GCash and send the screenshot to the main admin in Messages; the main admin confirms it here
 * (rpc hoop_club_add_months → +1 month). When the time runs out the database locks new games and bookings.
 * The main admin's own clubs are free (billing_free).
 */

const Box: React.FC<{ icon: React.ElementType; title: string; sub?: string; children: React.ReactNode; tone?: 'warn' | 'gold' }> = ({ icon: Icon, title, sub, children, tone }) => (
  <section className="rounded-2xl p-3.5 space-y-3 border" style={{
    background: tone === 'warn' ? 'rgba(255,107,122,0.06)' : tone === 'gold' ? 'rgba(246,201,76,0.05)' : H.surface,
    borderColor: tone === 'warn' ? 'rgba(255,107,122,0.4)' : tone === 'gold' ? 'rgba(246,201,76,0.35)' : 'rgba(255,255,255,0.1)',
  }}>
    <div className="flex items-start gap-2">
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${tone === 'warn' ? 'text-[#FF8A9C]' : tone === 'gold' ? 'text-[#F6C94C]' : 'text-[var(--hp)]'}`} />
      <div className="flex-1 min-w-0">
        <p className="font-hoop italic font-black text-[19px] uppercase text-white leading-none">{title}</p>
        {sub && <p className="text-[11px] text-[#A8A29E] mt-1">{sub}</p>}
      </div>
    </div>
    {children}
  </section>
);

/** "Free trial · 12 days left", "Paused", … */
export function billingLabel(club: HoopClub): { text: string; color: string } {
  const b = clubBilling(club);
  if (b.free) return { text: 'Free', color: '#53E6D4' };
  if (!b.active) return { text: b.trial ? 'Trial ended · locked' : 'Unpaid · locked', color: '#FF8A9C' };
  const left = `${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} left`;
  return { text: b.trial ? `Free trial · ${left}` : `Paid · ${left}`, color: b.daysLeft <= 7 ? '#F6C94C' : '#D6D3D1' };
}

/** How to pay: GCash number (+ QR once public/gcash-qr.png exists) and the "send my screenshot" button. */
const PayHow: React.FC<{ club: HoopClub }> = ({ club }) => {
  const [qr, setQr] = useState(true);
  return (
    <div className="space-y-2.5">
      <div className="flex gap-3 items-center p-3 rounded-xl bg-[#0A5BD8]/10 border border-[#3B82F6]/35">
        {qr && <img src={GCASH_QR} alt="GCash QR code" onError={() => setQr(false)} className="w-24 h-24 rounded-lg bg-white object-contain flex-shrink-0" />}
        <div className="min-w-0 space-y-0.5">
          <p className="text-[11px] font-black tracking-wider text-[#7FB2FF]">PAY WITH GCASH</p>
          <p className="font-hoop italic font-black text-[26px] text-white leading-none">₱{CLUB_PRICE} <span className="text-[13px] not-italic font-bold text-[#A8A29E]">/ month</span></p>
          <p className="text-[15px] font-bold text-white tracking-wide select-all">{GCASH_NUMBER}</p>
        </div>
      </div>
      <ol className="text-[12px] text-[#D6D3D1] space-y-1 list-decimal pl-5">
        <li>Send ₱{CLUB_PRICE} by GCash {qr ? '(scan the QR or use the number)' : `to ${GCASH_NUMBER}`}.</li>
        <li>Take a screenshot of the GCash receipt.</li>
        <li>Tap the button below and send the screenshot in the chat. Your club is unlocked for another month once the payment is confirmed.</li>
      </ol>
      <MessageButton to={HOOP_MAIN_ADMIN_ID} label="Send my GCash screenshot" className={`${hbtn.primary} w-full`}
        draft={`Hi! Here’s my ₱${CLUB_PRICE} GCash payment for “${club.name}”. Reference no.: `} />
    </div>
  );
};

/** On every club screen: a "locked" notice for everyone, and a "renew soon" reminder for the club's admins. */
export const ClubBillingBanner: React.FC<{ club: HoopClub; isAdmin: boolean }> = ({ club, isAdmin }) => {
  const go = useNav();
  const { user } = useAuth();
  const b = clubBilling(club);
  if (b.free || user?.id === HOOP_MAIN_ADMIN_ID && b.active) return null;
  if (b.active && (!isAdmin || b.daysLeft > 7)) return null;
  const toManage = isAdmin ? () => go({ name: 'hoopClub', club: club.id, tab: 'manage' }) : undefined;
  return (
    <div className="px-3 pt-3">
      <button onClick={toManage} disabled={!toManage} className={`w-full text-left flex items-start gap-2.5 p-3 rounded-2xl border ${toManage ? 'cursor-pointer' : 'cursor-default'}`}
        style={b.active ? { background: 'rgba(246,201,76,0.08)', borderColor: 'rgba(246,201,76,0.4)' } : { background: 'rgba(255,107,122,0.08)', borderColor: 'rgba(255,107,122,0.45)' }}>
        {b.active ? <CalendarClock className="w-5 h-5 text-[#F6C94C] flex-shrink-0 mt-0.5" /> : <Lock className="w-5 h-5 text-[#FF8A9C] flex-shrink-0 mt-0.5" />}
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-white">
            {b.active
              ? `${b.trial ? 'Free trial' : 'Subscription'} ends in ${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} (${longDate(b.until!)})`
              : 'This club is paused'}
          </span>
          <span className="block text-[11px] text-[#D6D3D1] mt-0.5">
            {isAdmin
              ? (b.active ? `Renew for ₱${CLUB_PRICE}/month by GCash to keep scheduling games. Tap to pay.` : `${b.trial ? 'The free month' : 'The subscription'} ended — new games and bookings are locked. Pay ₱${CLUB_PRICE} by GCash to unlock. Tap to pay.`)
              : 'New games and bookings are paused until the club renews. Your card, stats and history are safe.'}
          </span>
        </span>
      </button>
    </div>
  );
};

/** Manage tab: the club's subscription. Owners/admins see the status + how to pay; the main admin confirms payments. */
export const ClubSubscription: React.FC<{ club: HoopClub; onChanged: () => void }> = ({ club, onChanged }) => {
  const { user } = useAuth();
  const isMain = user?.id === HOOP_MAIN_ADMIN_ID;
  const b = clubBilling(club);
  const [pays, setPays] = useState<{ id: string; months: number; amount: number; reference: string | null; paid_until: string; created_at: string }[]>([]);
  const [ref, setRef] = useState('');
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('hoop_club_payments').select('id, months, amount, reference, paid_until, created_at').eq('club_id', club.id).order('created_at', { ascending: false }).limit(24);
    setPays((data as any[]) || []);
  }, [club.id]);
  useEffect(() => { load(); }, [load]);

  const confirm = async () => {
    if (busy) return;
    if (!window.confirm(`Confirm ₱${CLUB_PRICE * months} GCash payment for “${club.name}” and add ${months} month${months > 1 ? 's' : ''}?`)) return;
    setBusy(true); setErr(null); setOk(null);
    const { data, error } = await supabase.rpc('hoop_club_add_months', { p_club: club.id, p_months: months, p_amount: CLUB_PRICE * months, p_reference: ref.trim() || null });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setRef(''); setMonths(1);
    setOk(`Payment confirmed — active until ${longDate(new Date(data as string))}. The owner was notified.`);
    load(); onChanged();
  };
  const setFree = async (free: boolean) => {
    if (busy) return;
    setBusy(true); setErr(null); setOk(null);
    const { error } = await supabase.from('hoop_clubs').update(free ? { billing_free: true } : { billing_free: false, paid_until: club.paid_until || new Date(Date.now() + 30 * 864e5).toISOString() }).eq('id', club.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onChanged();
  };

  return (
    <Box icon={Wallet} title="Subscription" tone={b.free ? undefined : !b.active ? 'warn' : b.daysLeft <= 7 ? 'gold' : undefined}
      sub={b.free ? 'This club is free — no subscription needed.' : `1-month free trial, then ₱${CLUB_PRICE}/month by GCash.`}>
      {!b.free && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-black/25 border border-white/10">
          {b.active ? <BadgeCheck className="w-6 h-6 text-[#53E6D4] flex-shrink-0" /> : <AlertTriangle className="w-6 h-6 text-[#FF8A9C] flex-shrink-0" />}
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-white">{b.active ? (b.trial ? 'Free trial' : 'Active') : 'Locked'}</p>
            <p className="text-[12px] text-[#A8A29E]">
              {b.active
                ? `Until ${longDate(b.until!)} · ${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} left`
                : `Ended ${longDate(b.until!)} — new games and bookings are paused until it’s paid.`}
            </p>
          </div>
        </div>
      )}
      {!b.free && !isMain && <PayHow club={club} />}

      {isMain && (
        <div className="space-y-2.5 p-3 rounded-xl border border-dashed border-[#F6C94C]/50">
          <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[#F6C94C]"><Crown className="w-4 h-4" />ONLY YOU · CONFIRM A GCASH PAYMENT</p>
          {!b.free && <>
            <p className="text-[11px] text-[#A8A29E]">Check the owner’s screenshot against your GCash history first. Adds the months on top of the time left (or from today if it already ended).</p>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="GCash reference no. (optional)" className={hinput} maxLength={60} />
            <div className="flex gap-2">
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Months" className={`${hinput} !w-auto`}>
                {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} month{n > 1 ? 's' : ''} · ₱{CLUB_PRICE * n}</option>)}
              </select>
              <button onClick={confirm} disabled={busy} className={`${hbtn.primary} flex-1`}><Receipt className="w-4 h-4" />{busy ? 'Saving…' : 'Confirm payment'}</button>
            </div>
          </>}
          <button onClick={() => setFree(!b.free)} disabled={busy} className={`${hbtn.ghost} w-full !text-xs`}>
            {b.free ? 'Make this club pay (start billing)' : 'Make this club free (no subscription)'}
          </button>
        </div>
      )}
      <OkNote text={ok} />
      <ErrorNote text={err} />

      {pays.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-black tracking-wider text-[#A8A29E]">PAYMENTS</p>
          {pays.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-[12px] py-1.5 border-b border-white/[0.06] last:border-0">
              <span className="text-white">₱{p.amount} · {p.months} month{p.months > 1 ? 's' : ''}{p.reference ? <span className="text-[#78716C]"> · ref {p.reference}</span> : null}</span>
              <span className="text-[#A8A29E] whitespace-nowrap">{longDate(new Date(p.created_at))}</span>
            </div>
          ))}
        </div>
      )}
    </Box>
  );
};

/** Manage tab: the club's own 1-of-1 card. Hoop Method has its own; the main admin uploads every other club's design. */
export const OneOfOneDesign: React.FC<{ club: HoopClub; onChanged: () => void }> = ({ club, onChanged }) => {
  const { user, profile } = useAuth();
  const isMain = user?.id === HOOP_MAIN_ADMIN_ID;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const has = !!club.oneofone_url;
  const unlocks = useClubUnlocks(club);

  const save = async (url: string | null) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_clubs').update({ oneofone_url: url }).eq('id', club.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onChanged();
  };
  const upload = async (f: File) => {
    if (!/^image\/(png|webp)$/.test(f.type)) return setErr('Use a PNG or WebP picture with a see-through photo area (same layout as the Hoop Method 1-of-1).');
    if (f.size > 8 * 1024 * 1024) return setErr('That picture is too big (max 8 MB).');
    setBusy(true); setErr(null);
    try { await save(await uploadImage('avatars', user!.id, f)); } catch (e) { setErr(errorMessage(e)); setBusy(false); }
  };
  const person = { id: user?.id || 'x', display_name: profile?.display_name || 'Player Name', avatar_url: profile?.avatar_url ?? null } as any;

  const u = unlocks;
  const sub = !u ? 'Checking…'
    : u.lead ? (has ? 'On ✓ — card packs and the 1-of-1 are on for this club. The club owner picks each schedule’s winner in the Packs tab.' : 'Off for this club.')
    : u.packs_from == null ? 'Coming soon — card packs and the rare 1-of-1 unlock for every club once Hoop Method gives them out.'
    : u.played >= u.packs_from ? 'On ✓ — card packs and the 1-of-1 are on for this club. The club owner picks each schedule’s winner in the Packs tab.'
    : `Starts at your ${ordinal(u.packs_from)} schedule (${u.packs_from - u.played} more to go) — same as Hoop Method. The club owner picks the winner in the Packs tab.`;
  return (
    <Box icon={Crown} title="1-of-1 card" tone="gold" sub={sub}>
      <div className="w-[46%] mx-auto pointer-events-none">
        <OneOfOneCard person={person} card={{ jersey_number: null, position: null } as any} stats={null} club={{ name: club.name, logo_url: club.logo_url, oneofone_url: club.oneofone_url }} />
      </div>
      {!has && !u?.lead && <p className="text-[11px] text-[#A8A29E] text-center">Your club’s name and logo go on top of the card.</p>}
      {isMain && (
        <div className="space-y-2 p-3 rounded-xl border border-dashed border-[#F6C94C]/50">
          <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[#F6C94C]"><Crown className="w-4 h-4" />ONLY YOU · OWN DESIGN FOR THIS CLUB (OPTIONAL)</p>
          <p className="text-[11px] text-[#A8A29E]">PNG/WebP, 1000×1400, same layout as the Hoop Method 1-of-1 (see-through photo area, name plate at the bottom). Without one, the club uses the 1-of-1 frame with its own name and logo.</p>
          <div className="flex gap-2">
            <FilePick accept="image/png,image/webp" disabled={busy} onPick={upload} className={`${hbtn.primary} flex-1 cursor-pointer`}><Upload className="w-4 h-4" />{busy ? 'Uploading…' : has ? 'Replace design' : 'Upload design'}</FilePick>
            {!u?.lead && club.oneofone_url !== ONE_FRAME && <button onClick={() => save(ONE_FRAME)} disabled={busy} className={`${hbtn.ghost} !text-xs`}>Use Hoop Method’s</button>}
            {has && !u?.lead && <button onClick={() => { if (window.confirm('Remove this club’s own design? It goes back to the 1-of-1 frame with the club’s name and logo. Cards already won stay.')) save(null); }} disabled={busy} aria-label="Remove design" className={hbtn.ghost}><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>
      )}
      <ErrorNote text={err} />
    </Box>
  );
};

/** Clubs page, main admin only: every club's subscription at a glance (tap one to open its Manage tab). */
export const SubscriptionsOverview: React.FC<{ clubs: HoopClub[] }> = ({ clubs }) => {
  const go = useNav();
  const paying = clubs.filter((c) => !clubBilling(c).free)
    .sort((a, b) => (a.paid_until || '').localeCompare(b.paid_until || ''));
  return (
    <Box icon={Wallet} title="Subscriptions" sub={`Only you see this. ₱${CLUB_PRICE}/month after the 1-month free trial. Tap a club to confirm a payment.`}>
      {paying.length === 0 ? <p className="text-[12px] text-[#A8A29E]">No paying clubs yet. New clubs start a 1-month free trial when they’re created.</p> : (
        <div className="space-y-1.5">
          {paying.map((c) => {
            const l = billingLabel(c);
            return (
              <button key={c.id} onClick={() => go({ name: 'hoopClub', club: c.id, tab: 'manage' })}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-left cursor-pointer hover:border-white/30">
                <img src={c.logo_url || '/hoop-ball.png'} alt="" className="w-8 h-8 rounded-full object-cover bg-[#F6EFEC] flex-shrink-0" />
                <span className="flex-1 min-w-0 text-[13px] font-bold text-white truncate">{c.name}</span>
                <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: l.color }}>{l.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </Box>
  );
};
