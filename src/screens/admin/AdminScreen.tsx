import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3, CalendarDays, Disc3, Flag, Image as ImageIcon, Megaphone, MessageCircle, MessagesSquare, Music, ShieldCheck, Tag, Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNav } from '../../nav';
import { EmptyState, ErrorNote, Field, btn, inputCls } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { Check, ChevronDown, Lock, LogIn, Mail } from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { AdminReports, AdminUsers } from './AdminPeople';
import { AdminBands, AdminComments, AdminDeals, AdminGigs, AdminImages, AdminMusic, AdminPosts } from './AdminContent';
import { AdminSponsors } from './AdminSponsors';

const TABS: { key: string; label: string; Icon: React.ElementType; El: React.FC<any> }[] = [
  { key: 'dashboard', label: 'Dashboard', Icon: BarChart3, El: AdminDashboard },
  { key: 'reports', label: 'Reports', Icon: Flag, El: AdminReports },
  { key: 'users', label: 'Users', Icon: Users, El: AdminUsers },
  { key: 'posts', label: 'Posts', Icon: MessageCircle, El: AdminPosts },
  { key: 'images', label: 'Images', Icon: ImageIcon, El: AdminImages },
  { key: 'music', label: 'Music', Icon: Disc3, El: AdminMusic },
  { key: 'bands', label: 'Bands', Icon: Music, El: AdminBands },
  { key: 'gigs', label: 'Gigs', Icon: CalendarDays, El: AdminGigs },
  { key: 'deals', label: 'Deals', Icon: Tag, El: AdminDeals },
  { key: 'comments', label: 'Comments', Icon: MessagesSquare, El: AdminComments },
  { key: 'sponsors', label: 'Sponsors', Icon: Megaphone, El: AdminSponsors },
];

const TAB_KEY = 'minaw-admin-tab';

/** Admin Panel (#/home/admin). Only accounts in the moderators list can open it; the database enforces this too. */
export const AdminScreen: React.FC = () => {
  const go = useNav();
  const { user, isModerator } = useAuth();
  const [tab, setTab] = useState<string>(() => { try { return sessionStorage.getItem(TAB_KEY) || 'dashboard'; } catch { return 'dashboard'; } });
  useEffect(() => { try { sessionStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);

  if (!user) return <AdminLogin />;
  if (!isModerator) {
    return <div className="px-3 py-6"><EmptyState icon={ShieldCheck} title="Admins only" text="This account doesn’t have access to the Admin Panel." action={<button onClick={() => go({ name: 'home' })} className={btn.ghost}>Back to Home</button>} /></div>;
  }

  const current = TABS.find((t) => t.key === tab) || TABS[0];
  const El = current.El;

  return (
    <div className="px-3 py-4 space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="w-10 h-10 rounded-xl bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#B7A8FF] flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></span>
        <div>
          <h1 className="font-heading font-bold text-xl text-white leading-tight">Admin Panel</h1>
          <p className="text-[11px] text-[#8E9AA7]">Manage users, content, music and sponsors</p>
        </div>
      </div>

      <SectionMenu tab={tab} onPick={setTab} />

      <El key={current.key} openTab={setTab} />
    </div>
  );
};

/** Admin login form, shown right on minawdavao.com/admin. */
const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(/Invalid login/i.test(error.message) ? 'Wrong email or password.' : error.message);
    // on success the Admin Panel appears automatically
  };
  return (
    <div className="px-3 py-8">
      <form onSubmit={submit} className="max-w-sm mx-auto rounded-3xl bg-[#1D232A] border border-white/[0.08] p-5 space-y-4">
        <div className="text-center space-y-2">
          <span className="inline-flex w-12 h-12 rounded-2xl bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#B7A8FF] items-center justify-center"><ShieldCheck className="w-6 h-6" /></span>
          <h1 className="font-heading font-bold text-xl text-white">Admin Login</h1>
          <p className="text-xs text-[#8E9AA7]">MINAW DAVAO Admin Panel</p>
        </div>
        <Field label="Email" icon={Mail} htmlFor="adm-email"><input id="adm-email" type="email" required autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" icon={Lock} htmlFor="adm-pw"><input id="adm-pw" type="password" required autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorNote text={err} />
        <button type="submit" disabled={busy} className={`${btn.primary} w-full h-11`}><LogIn className="w-4 h-4" />{busy ? 'Logging in…' : 'Log In'}</button>
      </form>
    </div>
  );
};

const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Overview', keys: ['dashboard', 'reports'] },
  { title: 'People', keys: ['users'] },
  { title: 'Content', keys: ['posts', 'images', 'music', 'bands', 'gigs', 'deals', 'comments'] },
  { title: 'Business', keys: ['sponsors'] },
];

/** Dropdown to switch between admin sections. */
const SectionMenu: React.FC<{ tab: string; onPick: (k: string) => void }> = ({ tab, onPick }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = TABS.find((t) => t.key === tab) || TABS[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Admin section: ${cur.label}`}
        className="w-full flex items-center gap-2.5 px-3.5 h-12 rounded-2xl bg-[#6045F4] text-white font-bold text-sm cursor-pointer"
      >
        <cur.Icon className="w-5 h-5" />
        <span className="flex-1 text-left">{cur.label}</span>
        <ChevronDown className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full mt-1.5 z-30 p-1.5 rounded-2xl bg-[#161B20] border border-white/15 shadow-2xl max-h-[70vh] overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.title} className="py-1">
              <p className="px-2.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8E9AA7]">{g.title}</p>
              {g.keys.map((k) => {
                const t = TABS.find((x) => x.key === k)!;
                const on = k === tab;
                return (
                  <button key={k} role="menuitemradio" aria-checked={on} onClick={() => { onPick(k); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 h-11 px-2.5 rounded-xl text-[13px] font-semibold text-left cursor-pointer ${on ? 'bg-[#6045F4]/20 text-white' : 'text-[#EBEBED] hover:bg-white/5'}`}>
                    <t.Icon className={`w-4 h-4 ${on ? 'text-[#B7A8FF]' : 'text-[#8E9AA7]'}`} />
                    <span className="flex-1">{t.label}</span>
                    {on && <Check className="w-4 h-4 text-[#53E6D4]" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
