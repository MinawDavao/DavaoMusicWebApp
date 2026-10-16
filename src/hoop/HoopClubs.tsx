import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight, Clock, ImageIcon, KeyRound, MapPin, Plus, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, ErrorNote, FilePick, Modal, Spinner } from '../components/ui';
import { AccountPicker } from '../components/MembersEditor';
import { MessageButton } from '../screens/MessagesScreen';
import { confirmDelete } from '../components/ConfirmDelete';
import { HOOP_MAIN_ADMIN_ID, PERSON, THEMES, hbtn, hinput, gameDate, themeVars, type HoopClub, type HoopPerson } from './lib';
import { shrinkPhoto } from './HoopPlayer';

type Row = HoopClub & { members: { count: number }[] };

/** HOOP METHOD home: every club, search, your clubs, and "Create a club" for people the main admin allowed. */
export const HoopClubs: React.FC = () => {
  const go = useNav();
  const { user, isModerator } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<Record<string, 'owner' | 'admin' | 'active' | 'pending' | 'suspended'>>({});
  const [canCreate, setCanCreate] = useState(false);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [creators, setCreators] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, { data: ad }, { data: mem }, { data: cr }] = await Promise.all([
      supabase.from('hoop_clubs').select('*, members:hoop_members(count)').eq('members.status', 'active').order('created_at'),
      user ? supabase.from('hoop_club_admins').select('club_id, role').eq('profile_id', user.id) : Promise.resolve({ data: [] }),
      user ? supabase.from('hoop_members').select('club_id, status').eq('profile_id', user.id) : Promise.resolve({ data: [] }),
      user ? supabase.from('hoop_club_creators').select('profile_id').eq('profile_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setRows((data as any as Row[]) || []);
    const m: Record<string, any> = {};
    ((mem as any[]) || []).forEach((x) => { m[x.club_id] = x.status; });
    ((ad as any[]) || []).forEach((x) => { m[x.club_id] = x.role; });
    setMine(m);
    setCanCreate(isModerator || !!cr);
  }, [user?.id, isModerator]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    const ch = supabase.channel(`hoop-clubs-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_clubs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_club_admins' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (rows === null) return <Spinner label="Loading clubs…" />;
  const term = q.trim().toLowerCase();
  const match = (c: Row) => !term || [c.name, c.tagline, c.location].some((x) => x?.toLowerCase().includes(term));
  const myClubs = rows.filter((c) => mine[c.id] && mine[c.id] !== 'suspended');
  const others = rows.filter((c) => match(c) && !(myClubs.includes(c) && !term));
  const mainAdminId = rows[0]?.owner_id ?? null;

  const card = (c: Row) => {
    const st = mine[c.id];
    const n = c.members?.[0]?.count ?? 0;
    return (
      <button key={c.id} onClick={() => go({ name: 'hoopClub', club: c.id })} style={themeVars(c.theme)}
        className="w-full flex items-stretch rounded-2xl overflow-hidden border border-white/10 text-left cursor-pointer hover:border-[var(--hp)]/60 transition-colors bg-[#1A1A1A]">
        <span className="w-[6px] flex-shrink-0" style={{ background: 'linear-gradient(180deg, var(--hp), var(--ha))' }} />
        <span className="flex-1 min-w-0 flex items-center gap-3 p-3">
          {c.logo_url
            ? <img src={c.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 bg-[#F6EFEC] border border-white/10" />
            : <span className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-hoop italic font-black text-[26px] text-[#111] bg-[var(--hp)]">{c.name[0]}</span>}
          <span className="flex-1 min-w-0 space-y-0.5">
            <span className="block font-hoop italic font-black text-[18px] leading-tight uppercase text-white">{c.name}</span>
            {c.tagline && <span className="block text-[11px] text-[#D6D3D1] truncate">{c.tagline}</span>}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#A8A29E]">
              <span className="flex items-center gap-1"><Users className="w-3 h-3 text-[var(--hp)]" />{n} {n === 1 ? 'player' : 'players'}</span>
              {c.location && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 text-[var(--hp)]" />{c.location}</span>}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1 flex-shrink-0">
            {st === 'owner' && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[var(--hp)] text-[#111]">OWNER</span>}
            {st === 'admin' && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[var(--hp)] text-[#111]">ADMIN</span>}
            {st === 'active' && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[var(--hp)]/15 text-[var(--hp)] border border-[var(--hp)]/40">MEMBER</span>}
            {st === 'pending' && <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-white/10 text-[#D6D3D1]"><Clock className="w-2.5 h-2.5" />PENDING</span>}
            {c.is_hidden && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#FF6B7A]/15 text-[#FF8A9C]">HIDDEN</span>}
            <ChevronRight className="w-4 h-4 text-[#A8A29E]" />
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="px-3 py-4 space-y-5">
      <div className="rounded-3xl p-4 border border-[var(--hp)]/35 space-y-1" style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--hp) 18%, transparent), rgba(17,17,17,0.6))' }}>
        <p className="font-hoop italic font-black text-[28px] uppercase text-white leading-none">Find your run</p>
        <p className="text-[12px] text-[#D6D3D1]">Basketball clubs in Davao. Join a club to book games, get your player card and track your stats.</p>
      </div>

      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" />
        <input type="text" inputMode="search" aria-label="Search clubs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clubs by name or place" className={`${hinput} !pl-9`} />
      </label>

      <div className="flex gap-2">
        {canCreate
          ? <button onClick={() => setCreating(true)} className={`${hbtn.primary} flex-1`}><Plus className="w-4 h-4" />Create a club</button>
          : mainAdminId && <MessageButton to={mainAdminId} label="Want to start a club? Message the admin" draft="Hi! I’d like to start a basketball club on Hoop Method. " className={`${hbtn.ghost} flex-1 !text-xs`} />}
        {isModerator && <button onClick={() => setCreators(true)} className={hbtn.ghost} title="Who can create clubs"><KeyRound className="w-4 h-4 text-[var(--hp)]" />Club creators</button>}
      </div>

      {user?.id === HOOP_MAIN_ADMIN_ID && <button onClick={() => go({ name: 'hoopDesigns' })} className="w-full flex items-center gap-3 p-3 rounded-2xl border border-[var(--hp)]/35 text-left cursor-pointer" style={{ background: 'linear-gradient(110deg, color-mix(in srgb, var(--hp) 16%, #141414), #141414 70%)' }}>
        <span className="flex -space-x-3">{['#F7A51C', '#C98A4B', '#FF2E93', '#B3C7FF', '#E8C25A'].map((c) => <span key={c} className="w-6 h-8 rounded-md border border-black/50" style={{ background: c }} />)}</span>
        <span className="flex-1 min-w-0"><span className="block font-hoop italic font-black text-[17px] uppercase text-white leading-tight">Card series</span><span className="block text-[11px] text-[#A8A29E]">Only you can see this · the player card designs</span></span>
        <ChevronRight className="w-4 h-4 text-[#A8A29E]" />
      </button>}

      {myClubs.length > 0 && !term && (
        <section className="space-y-2.5">
          <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">My clubs</h2>
          {myClubs.map(card)}
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">{term ? 'Results' : myClubs.length ? 'More clubs' : 'All clubs'}</h2>
        {others.length === 0
          ? <p className="px-4 py-8 rounded-2xl border border-dashed border-white/15 text-center text-[13px] text-[#A8A29E]">{term ? 'No club matches your search.' : 'No other clubs yet.'}</p>
          : others.map(card)}
      </section>

      {creating && <CreateClub onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); go({ name: 'hoopClub', club: id, tab: 'manage' }); }} />}
      {creators && <CreatorsModal onClose={() => setCreators(false)} />}
    </div>
  );
};

// ===================================================================== CREATE A CLUB
const CreateClub: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const { user } = useAuth();
  const [f, setF] = useState({ name: '', tagline: '', location: 'Davao City' });
  const [theme, setTheme] = useState(THEMES[4]);
  const [logo, setLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (file: File) => {
    if (!file.type.startsWith('image/')) return setErr('Please pick a photo.');
    setUploading(true); setErr(null);
    try { setLogo(await uploadImage('banners', user!.id, await shrinkPhoto(file, 800))); } catch (e) { setErr(errorMessage(e)); }
    setUploading(false);
  };
  const save = async () => {
    if (f.name.trim().length < 2) return setErr('Please give the club a name.');
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from('hoop_clubs').insert({
      name: f.name.trim(), tagline: f.tagline.trim() || null, location: f.location.trim() || null, logo_url: logo, cover_url: logo,
      theme: { primary: theme.primary, accent: theme.accent }, owner_id: user!.id,
      rules: 'Book ahead — Slots are limited, so book your slot before game day.\nPay ahead — Pay before the schedule so your slot is confirmed.\nPlay at your own risk — This is a friendly game. Take care of yourself and each other.',
    }).select('id').single();
    setBusy(false);
    if (error) return setErr(/duplicate|unique/i.test(error.message) ? 'There’s already a club with that name.' : errorMessage(error));
    onSaved((data as any).id);
  };
  const lbl = 'block text-[12px] font-bold text-[#E7E5E4] mb-1';
  return (
    <Modal title="Create a club" onClose={onClose} footer={<>
      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={onClose} className={`${hbtn.ghost} flex-1`}><X className="w-4 h-4" />Cancel</button>
        <button onClick={save} disabled={busy || uploading} className={`${hbtn.primary} flex-1`}><Check className="w-4 h-4" />{busy ? 'Creating…' : 'Create club'}</button>
      </div>
    </>}>
      <div style={themeVars(theme)} className="space-y-3">
        <div className="flex items-center gap-3">
          {logo
            ? <img src={logo} alt="" className="w-16 h-16 rounded-2xl object-cover border border-white/15" />
            : <span className="w-16 h-16 rounded-2xl flex items-center justify-center font-hoop italic font-black text-[30px] text-[#111] bg-[var(--hp)]">{f.name.trim()[0]?.toUpperCase() || 'H'}</span>}
          <FilePick accept="image/*" onPick={pick} disabled={uploading} className={`${hbtn.ghost} !py-2 !text-xs`}><ImageIcon className="w-4 h-4" />{uploading ? 'Uploading…' : logo ? 'Change logo' : 'Add club logo'}</FilePick>
        </div>
        <div><label className={lbl} htmlFor="hc-name">Club name</label><input id="hc-name" className={hinput} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} placeholder="e.g. NORTHCREST Basketball Club" /></div>
        <div><label className={lbl} htmlFor="hc-tag">Short line <span className="font-normal text-[#A8A29E]">(optional)</span></label><input id="hc-tag" className={hinput} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} maxLength={120} placeholder="e.g. Saturday morning runs" /></div>
        <div><label className={lbl} htmlFor="hc-loc">Location</label><input id="hc-loc" className={hinput} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={120} /></div>
        <ThemePicker value={theme} onChange={setTheme} />
        <p className="text-[11px] text-[#A8A29E]">You’ll be the club owner. You can add admins, photos, rules and players after.</p>
      </div>
    </Modal>
  );
};

export const ThemePicker: React.FC<{ value: { primary: string; accent: string }; onChange: (t: { name: string; primary: string; accent: string }) => void }> = ({ value, onChange }) => (
  <div>
    <p className="block text-[12px] font-bold text-[#E7E5E4] mb-1.5">Club colour</p>
    <div className="flex flex-wrap gap-2">
      {THEMES.map((t) => {
        const on = t.primary.toLowerCase() === value.primary.toLowerCase();
        return (
          <button key={t.name} type="button" onClick={() => onChange(t)} aria-label={t.name} aria-pressed={on} title={t.name}
            className={`w-10 h-10 rounded-full cursor-pointer flex items-center justify-center border-2 ${on ? 'border-white' : 'border-transparent'}`}
            style={{ background: `linear-gradient(135deg, ${t.primary} 50%, ${t.accent} 50%)` }}>
            {on && <Check className="w-4 h-4 text-[#111]" />}
          </button>
        );
      })}
      <label className="w-10 h-10 rounded-full cursor-pointer flex items-center justify-center border-2 border-dashed border-white/30 text-[10px] font-bold text-[#D6D3D1] relative overflow-hidden" title="Pick any colour">
        Own
        <input type="color" value={value.primary} onChange={(e) => onChange({ name: 'Custom', primary: e.target.value, accent: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Pick any club colour" />
      </label>
    </div>
  </div>
);

// ===================================================================== CLUB CREATORS (main admin only)
const CreatorsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [list, setList] = useState<{ profile_id: string; created_at: string; profiles: HoopPerson | null }[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('hoop_club_creators').select(`profile_id, created_at, profiles!hoop_club_creators_profile_id_fkey(${PERSON})`).order('created_at');
    setList((data as any[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const add = async (id: string) => {
    setAdding(false); setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_club_creators').insert({ profile_id: id });
    setBusy(false);
    if (error) return setErr(/duplicate/i.test(error.message) ? 'They can already create clubs.' : errorMessage(error));
    load();
  };
  const remove = async (a: { profile_id: string; profiles: HoopPerson | null }) => {
    if (!(await confirmDelete({ title: `Stop ${a.profiles?.display_name || 'this member'} from creating clubs?`, message: 'Clubs they already made stay.', confirmLabel: 'Remove' }))) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_club_creators').delete().eq('profile_id', a.profile_id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    load();
  };
  return (
    <Modal title="Club creators" onClose={onClose} footer={<><ErrorNote text={err} /><button onClick={onClose} className={`${hbtn.ghost} w-full`}>Done</button></>}>
      <p className="text-[12px] text-[#A8A29E] leading-relaxed">
        People on this list can <strong className="text-white">create their own basketball club</strong> and run it: games, players, cards, photos and colours. They become that club’s owner — they can’t touch other clubs or the MINAW DAVAO Admin Panel.
      </p>
      {list === null ? <Spinner label="Loading…" /> : list.length === 0
        ? <p className="py-3 text-center text-[12px] text-[#A8A29E]">No one yet. Only you can create clubs right now.</p>
        : (
          <div className="space-y-1.5">
            {list.map((a) => (
              <div key={a.profile_id} className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/10">
                <Avatar src={a.profiles?.avatar_url} name={a.profiles?.display_name} size={34} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-white truncate">{a.profiles?.display_name || 'Member'}</span>
                  <span className="block text-[11px] text-[#A8A29E] truncate">@{a.profiles?.username} · since {gameDate(a.created_at)}</span>
                </span>
                <ShieldCheck className="w-4 h-4 text-[var(--hp)]" />
                <button onClick={() => remove(a)} disabled={busy} aria-label={`Remove ${a.profiles?.display_name}`} className="w-8 h-8 rounded-lg text-[#A8A29E] hover:text-[#FF6B7A] flex items-center justify-center cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      {adding
        ? <AccountPicker autoFocus roles={['fan']} exclude={(list || []).map((a) => a.profile_id)} onPick={(p) => add(p.id)} onCancel={() => setAdding(false)} />
        : <button onClick={() => setAdding(true)} disabled={busy} className={`${hbtn.primary} w-full`}><UserPlus className="w-4 h-4" />Allow someone to create a club</button>}
    </Modal>
  );
};
