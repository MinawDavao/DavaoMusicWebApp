import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Ban, CalendarPlus, Check, Crown, EyeOff, ImageIcon, Images, Palette, RotateCcw, ScrollText, ShieldCheck, Trash2, UserPlus, Users, WifiOff, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, removeImageByUrl, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, ErrorNote, FilePick, OkNote, Spinner } from '../components/ui';
import { AccountPicker } from '../components/MembersEditor';
import { confirmDelete } from '../components/ConfirmDelete';
import { H, MEMBER_COLS, PERSON, THEMES, hbtn, hinput, personOf, useClub, type HoopMember, type HoopPerson } from './lib';
import { HoopFace } from './HoopFace';
import { ThemePicker } from './HoopClubs';
import { AddOfflinePlayer, shrinkPhoto } from './HoopPlayer';
import { ClubSubscription, OneOfOneDesign } from './ClubBilling';

const Section: React.FC<{ icon: React.ElementType; title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }> = ({ icon: Icon, title, sub, children, right }) => (
  <section className="rounded-2xl p-3.5 space-y-3 border border-white/10" style={{ background: H.surface }}>
    <div className="flex items-start gap-2">
      <Icon className="w-5 h-5 text-[var(--hp)] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-hoop italic font-black text-[19px] uppercase text-white leading-none">{title}</p>
        {sub && <p className="text-[11px] text-[#A8A29E] mt-1">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

/** Club admins: requests, players (suspend / remove / add without the app), the club page, colours, photos and admins. */
export const HoopManage: React.FC = () => {
  const go = useNav();
  const { user, isModerator } = useAuth();
  const { club: c, isOwner, reload } = useClub();
  const club = c!;
  const [members, setMembers] = useState<HoopMember[] | null>(null);
  const memberIds = useRef<Set<string>>(new Set());
  memberIds.current = new Set((members || []).map((x) => x.id));
  const [admins, setAdmins] = useState<{ profile_id: string; role: string; profiles: HoopPerson | null }[]>([]);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [filter, setFilter] = useState<'active' | 'suspended'>('active');
  const [q, setQ] = useState('');
  const [addOffline, setAddOffline] = useState(false);
  const [addAccount, setAddAccount] = useState(false);
  const [addAdmin, setAddAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // club page form
  const [f, setF] = useState({ name: club.name, tagline: club.tagline || '', location: club.location || '', description: club.description || '', rules: club.rules || '' });
  const [theme, setTheme] = useState({ primary: club.theme?.primary || THEMES[0].primary, accent: club.theme?.accent || THEMES[0].accent });
  const [logo, setLogo] = useState<string | null>(club.logo_url);
  const [cover, setCover] = useState<string | null>(club.cover_url);
  const [uploading, setUploading] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // a brand-new club has no schedules yet: show the "create your first schedule" step
  const [schedules, setSchedules] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    supabase.from('hoop_games').select('id', { count: 'exact', head: true }).eq('club_id', club.id).is('session_id', null)
      .then(({ count }) => { if (live) setSchedules(count ?? 0); });
    return () => { live = false; };
  }, [club.id]);
  const toGames = (create = false) => {
    if (create) { try { sessionStorage.setItem(`hoop-create-${club.id}`, '1'); } catch { /* ignore */ } }   // Games opens "Schedule a game"
    go({ name: 'hoopClub', club: club.id, tab: 'games' });
  };

  const load = useCallback(async () => {
    const [{ data: m }, { data: a }, { data: p }] = await Promise.all([
      supabase.from('hoop_members').select(MEMBER_COLS).eq('club_id', club.id).order('created_at').limit(1000),
      supabase.from('hoop_club_admins').select(`profile_id, role, profiles!hoop_club_admins_profile_id_fkey(${PERSON})`).eq('club_id', club.id).order('created_at'),
      supabase.from('hoop_club_photos').select('id, url').eq('club_id', club.id).order('created_at', { ascending: false }),
    ]);
    setMembers((m as any as HoopMember[]) || []);
    setAdmins((a as any[]) || []);
    setPhotos((p as any[]) || []);
  }, [club.id]);
  useEffect(() => {
    load();
    const ch = supabase.channel(`hoop-manage-${club.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoop_members', filter: `club_id=eq.${club.id}` }, () => load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hoop_members' }, (p: any) => { if (memberIds.current.has(p.old?.id)) load(); })   // deletes skip filters
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, club.id]);

  const run = async (fn: () => PromiseLike<{ error: any }>) => {
    setBusy(true); setErr(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setErr(errorMessage(error)); return false; }
    load();
    return true;
  };

  // ---------- members
  const setStatus = (m: HoopMember, status: HoopMember['status']) => run(() => supabase.from('hoop_members').update({ status }).eq('id', m.id));
  const suspend = async (m: HoopMember) => {
    if (await confirmDelete({ title: `Suspend ${personOf(m).display_name}?`, message: 'They can’t book games in this club until you unsuspend them. Their card and stats stay.', confirmLabel: 'Suspend' })) setStatus(m, 'suspended');
  };
  const remove = async (m: HoopMember) => {
    const pending = m.status === 'pending';
    if (!(await confirmDelete({
      title: pending ? `Decline ${personOf(m).display_name}’s request?` : `Remove ${personOf(m).display_name} from the club?`,
      message: pending ? undefined : 'Their club card and career stats are deleted. Past box scores keep their name as a guest.',
      typeToConfirm: !pending, confirmLabel: pending ? 'Decline' : 'Remove player',
    }))) return;
    run(() => supabase.from('hoop_members').delete().eq('id', m.id));
  };
  const addWithAccount = (id: string) => { setAddAccount(false); run(() => supabase.from('hoop_members').insert({ club_id: club.id, profile_id: id, status: 'active' })); };

  // ---------- club page
  const upload = async (file: File, which: 'logo' | 'cover' | 'photo') => {
    if (!file.type.startsWith('image/')) return setErr('Please pick a photo.');
    setUploading(which); setErr(null);
    try {
      const url = await uploadImage('banners', user!.id, await shrinkPhoto(file, which === 'logo' ? 800 : 1600));
      if (which === 'logo') setLogo(url);
      else if (which === 'cover') setCover(url);
      else await run(() => supabase.from('hoop_club_photos').insert({ club_id: club.id, url, created_by: user!.id }));
    } catch (e) { setErr(errorMessage(e)); }
    setUploading(null);
  };
  const saveClub = async () => {
    if (f.name.trim().length < 2) return setErr('Please give the club a name.');
    setSaved(null);
    const ok = await run(() => supabase.from('hoop_clubs').update({
      name: f.name.trim(), tagline: f.tagline.trim() || null, location: f.location.trim() || null, description: f.description.trim() || null,
      rules: f.rules.trim() || null, logo_url: logo, cover_url: cover, theme,
    }).eq('id', club.id));
    if (!ok) return;
    const keep = [logo, cover, ...photos.map((p) => p.url)];
    if (club.logo_url && club.logo_url !== logo && !club.logo_url.startsWith('/')) removeImageByUrl(club.logo_url, keep);
    if (club.cover_url && club.cover_url !== cover && !club.cover_url.startsWith('/') && club.cover_url !== club.logo_url) removeImageByUrl(club.cover_url, keep);
    setSaved('Saved! Your club page is updated.');
    reload();
  };
  const removePhoto = async (p: { id: string; url: string }) => {
    if (!(await confirmDelete({ title: 'Remove this photo?', confirmLabel: 'Remove' }))) return;
    if (await run(() => supabase.from('hoop_club_photos').delete().eq('id', p.id))) removeImageByUrl(p.url, [logo, cover]);
  };

  // ---------- admins
  const addAdminFn = (id: string) => { setAddAdmin(false); run(() => supabase.from('hoop_club_admins').insert({ club_id: club.id, profile_id: id, role: 'admin' })); };
  const removeAdmin = async (a: { profile_id: string; profiles: HoopPerson | null }) => {
    if (!(await confirmDelete({ title: `Remove ${a.profiles?.display_name || 'this member'} as club admin?`, message: 'They go back to a regular player.', confirmLabel: 'Remove' }))) return;
    run(() => supabase.from('hoop_club_admins').delete().eq('club_id', club.id).eq('profile_id', a.profile_id));
  };

  // ---------- club
  const toggleHidden = () => run(() => supabase.from('hoop_clubs').update({ is_hidden: !club.is_hidden }).eq('id', club.id)).then(reload);
  const deleteClub = async () => {
    if (!(await confirmDelete({
      title: `Delete ${club.name}?`,
      message: 'Everything in this club is deleted for good: games, bookings, player cards, stats, chat and photos.',
      typeToConfirm: true,
    }))) return;
    if (await run(() => supabase.from('hoop_clubs').delete().eq('id', club.id))) go({ name: 'hoop' });
  };

  if (members === null) return <Spinner label="Loading club…" />;
  const pending = members.filter((m) => m.status === 'pending');
  const term = q.trim().toLowerCase();
  const list = members.filter((m) => m.status === filter && (!term || personOf(m).display_name.toLowerCase().includes(term)))
    .sort((a, b) => personOf(a).display_name.localeCompare(personOf(b).display_name));
  const counts = { active: members.filter((m) => m.status === 'active').length, suspended: members.filter((m) => m.status === 'suspended').length };
  const lbl = 'block text-[12px] font-bold text-[#E7E5E4] mb-1';

  const row = (m: HoopMember, actions: React.ReactNode) => {
    const p = personOf(m);
    return (
      <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/10">
        <button onClick={() => go({ name: 'hoopPlayer', id: m.id })} className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer">
          <HoopFace avatar={p.avatar_url} name={p.display_name} cardPhoto={m.card_photo_url} cardCrop={m.card_photo_crop} size={36} />
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-white truncate">{p.display_name}</span>
            <span className="block text-[10px] text-[#A8A29E] truncate">{[m.jersey_number != null ? `#${m.jersey_number}` : '', m.position || '', !m.profile_id ? 'no app' : p.username ? `@${p.username}` : ''].filter(Boolean).join(' · ')}</span>
            {m.note && m.status === 'pending' && <span className="block text-[11px] text-[#D6D3D1] italic truncate">“{m.note}”</span>}
          </span>
        </button>
        <span className="flex items-center gap-1 flex-shrink-0">{actions}</span>
      </div>
    );
  };
  const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer border border-white/15 bg-white/[0.04] text-[#D6D3D1] hover:text-white disabled:opacity-40';

  return (
    <div className="px-3 py-4 space-y-4">
      <div>
        <h1 className="font-hoop italic font-black text-[30px] uppercase text-white leading-none">Manage club</h1>
        <p className="text-[12px] text-[#A8A29E] mt-1">Only club admins see this page.</p>
      </div>
      <ErrorNote text={err} />

      {/* NEW CLUB: the next step after setting up the club page */}
      {schedules === 0 && (
        <div className="p-4 rounded-2xl border-2 border-[var(--hp)] space-y-2.5" style={{ background: 'color-mix(in srgb, var(--hp) 12%, #141414)' }}>
          <p className="font-hoop italic font-black text-[22px] uppercase text-white leading-none">Your club is ready!</p>
          <p className="text-[12px] text-[#D6D3D1]">Add your logo, cover photo and info below (tap <strong className="text-white">Save club page</strong>), then create your first schedule so players can book a slot.</p>
          <button onClick={() => toGames(true)} className={`${hbtn.primary} w-full !py-3 !text-base`}><CalendarPlus className="w-5 h-5" />Create your first schedule<ArrowRight className="w-4 h-4" /></button>
        </div>
      )}

      {/* SUBSCRIPTION (₱400/month after the free month) + the club's own 1-of-1 card */}
      <ClubSubscription club={club} onChanged={reload} />
      <OneOfOneDesign club={club} onChanged={reload} />

      {/* ADMINS */}
      <Section icon={ShieldCheck} title="Club admins" sub="Assign a backup admin so games can still run when you’re not around. They can schedule games, pick teams, mark payments, run live scores, approve players and edit this page.">
        {addAdmin
          ? <AccountPicker autoFocus roles={['fan']} exclude={admins.map((a) => a.profile_id)} onPick={(p) => addAdminFn(p.id)} onCancel={() => setAddAdmin(false)} />
          : <button onClick={() => (isOwner ? setAddAdmin(true) : setErr('Only the club owner can assign admins. Message the owner if you need another admin.'))} disabled={busy} className={`${hbtn.primary} w-full !py-3 !text-base`}><ShieldCheck className="w-5 h-5" />Assign admin</button>}
        <p className="text-[10px] text-[#78716C]">Search their name — they need a MINAW DAVAO Fan account. Assigned admins can do everything you do here, except add/remove admins, delete played games or delete the club.</p>
        <div className="space-y-1.5">
          {admins.map((a) => (
            <div key={a.profile_id} className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/10">
              <Avatar src={a.profiles?.avatar_url} name={a.profiles?.display_name} size={34} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-white truncate">{a.profiles?.display_name || 'Member'}</span>
                <span className="block text-[11px] text-[#A8A29E] truncate">@{a.profiles?.username}</span>
              </span>
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black ${a.role === 'owner' ? 'bg-[var(--hp)] text-[#111]' : 'bg-[var(--hp)]/15 text-[var(--hp)] border border-[var(--hp)]/40'}`}>{a.role === 'owner' && <Crown className="w-3 h-3" />}{a.role.toUpperCase()}</span>
              {isOwner && a.role !== 'owner' && <button onClick={() => removeAdmin(a)} disabled={busy} aria-label={`Remove ${a.profiles?.display_name}`} className="w-8 h-8 rounded-lg text-[#A8A29E] hover:text-[#FF6B7A] flex items-center justify-center cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>

      </Section>

      {/* JOIN REQUESTS */}
      <Section icon={UserPlus} title={`Join requests${pending.length ? ` (${pending.length})` : ''}`} sub="New players send their card here. Approve to make their card and let them book games.">
        {pending.length === 0
          ? <p className="text-[12px] text-[#A8A29E]">No requests right now.</p>
          : <div className="space-y-1.5">{pending.map((m) => row(m, <>
              <button onClick={() => setStatus(m, 'active')} disabled={busy} className={`${hbtn.primary} !py-1.5 !px-2.5 !text-xs`}><Check className="w-3.5 h-3.5" />Approve</button>
              <button onClick={() => remove(m)} disabled={busy} aria-label="Decline" className={iconBtn}><X className="w-4 h-4" /></button>
            </>))}</div>}
      </Section>

      {/* PLAYERS */}
      <Section icon={Users} title="Players" sub="Tap a player to see their card. Suspended players can’t book games.">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setAddOffline(true)} className={`${hbtn.primary} !py-2 !text-xs`}><WifiOff className="w-3.5 h-3.5" />Player without the app</button>
          <button onClick={() => setAddAccount(!addAccount)} className={`${hbtn.ghost} !py-2 !text-xs`}><UserPlus className="w-3.5 h-3.5" />Player with an account</button>
        </div>
        {addAccount && <AccountPicker autoFocus roles={['fan']} exclude={members.map((m) => m.profile_id || '').filter(Boolean)} onPick={(p) => addWithAccount(p.id)} onCancel={() => setAddAccount(false)} />}
        <div className="flex gap-1.5">
          {(['active', 'suspended'] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={`h-8 px-3 rounded-full text-xs font-bold border cursor-pointer ${filter === k ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>
              {k === 'active' ? 'Active' : 'Suspended'} ({counts[k]})
            </button>
          ))}
        </div>
        <input type="text" inputMode="search" aria-label="Search players" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" className={hinput} />
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {list.length === 0 && <p className="text-[12px] text-[#A8A29E] py-2">No {filter} players.</p>}
          {list.map((m) => row(m, <>
            {m.status === 'active'
              ? <button onClick={() => suspend(m)} disabled={busy || m.profile_id === user?.id} aria-label={`Suspend ${personOf(m).display_name}`} title="Suspend" className={iconBtn}><Ban className="w-4 h-4" /></button>
              : <button onClick={() => setStatus(m, 'active')} disabled={busy} aria-label={`Unsuspend ${personOf(m).display_name}`} title="Unsuspend" className={iconBtn}><RotateCcw className="w-4 h-4" /></button>}
            <button onClick={() => remove(m)} disabled={busy} aria-label={`Remove ${personOf(m).display_name}`} title="Remove from club" className={`${iconBtn} hover:!text-[#FF6B7A]`}><Trash2 className="w-4 h-4" /></button>
          </>))}
        </div>
      </Section>

      {/* CLUB PAGE */}
      <Section icon={ScrollText} title="Club page" sub="What everyone sees on the club’s Games tab.">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1.5">
            <p className={lbl}>Logo</p>
            <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/15 flex items-center justify-center" style={{ background: H.cream }}>
              {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <span className="font-hoop italic font-black text-[40px] text-[#111]">{f.name[0]}</span>}
            </div>
            <FilePick accept="image/*" onPick={(x) => upload(x, 'logo')} disabled={!!uploading} className={`${hbtn.ghost} w-full !py-1.5 !text-xs`}><ImageIcon className="w-3.5 h-3.5" />{uploading === 'logo' ? 'Uploading…' : 'Change logo'}</FilePick>
          </div>
          <div className="space-y-1.5">
            <p className={lbl}>Cover picture</p>
            <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/15 flex items-center justify-center" style={{ background: H.cream }}>
              {cover ? <img src={cover} alt="" className="w-full h-full object-contain" /> : <span className="text-[11px] text-[#57534E]">No cover</span>}
            </div>
            <div className="flex gap-1">
              <FilePick accept="image/*" onPick={(x) => upload(x, 'cover')} disabled={!!uploading} className={`${hbtn.ghost} flex-1 !py-1.5 !text-xs`}><ImageIcon className="w-3.5 h-3.5" />{uploading === 'cover' ? 'Uploading…' : 'Change'}</FilePick>
              {cover && <button onClick={() => setCover(null)} aria-label="Remove cover" className={`${hbtn.ghost} !px-2 !py-1.5`}><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
        </div>
        <div><label className={lbl} htmlFor="mc-name">Club name</label><input id="mc-name" className={hinput} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} /></div>
        <div><label className={lbl} htmlFor="mc-tag">Short line</label><input id="mc-tag" className={hinput} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} maxLength={120} placeholder="e.g. Sunday pickup runs in Davao" /></div>
        <div><label className={lbl} htmlFor="mc-loc">Location</label><input id="mc-loc" className={hinput} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={120} /></div>
        <div><label className={lbl} htmlFor="mc-desc">About the club <span className="font-normal text-[#A8A29E]">(optional)</span></label><textarea id="mc-desc" rows={3} maxLength={1000} className={`${hinput} py-2.5 resize-none`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Who you are, when and where you play, fees…" /></div>
        <div>
          <label className={lbl} htmlFor="mc-rules">Club rules</label>
          <textarea id="mc-rules" rows={7} maxLength={4000} className={`${hinput} py-2.5 resize-y text-[13px]`} value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value })} />
          <p className="text-[10px] text-[#78716C] mt-1">One rule per line. Start with a short title and a dash to make it bold, e.g. “Pay ahead — Pay before the game.”</p>
        </div>
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#E7E5E4]"><Palette className="w-4 h-4 text-[var(--hp)]" />Colour theme</p>
          <ThemePicker value={theme} onChange={(t) => setTheme({ primary: t.primary, accent: t.accent })} />
          <p className="text-[10px] text-[#78716C]">The new colour shows after you save.</p>
        </div>
        <OkNote text={saved} />
        <button onClick={saveClub} disabled={busy || !!uploading} className={`${hbtn.primary} w-full`}><Check className="w-4 h-4" />Save club page</button>
        {saved && (
          <button onClick={() => toGames(schedules === 0)} className={`${hbtn.ghost} w-full !border-[var(--hp)]`}>
            <CalendarPlus className="w-4 h-4" />{schedules === 0 ? 'Next: create your first schedule' : 'Go to Games'}<ArrowRight className="w-4 h-4" />
          </button>
        )}
      </Section>

      {/* PHOTOS */}
      <Section icon={Images} title="Photos" sub="Show off your games. Photos appear on the club page.">
        <FilePick accept="image/*" onPick={(x) => upload(x, 'photo')} disabled={!!uploading} className={`${hbtn.primary} w-full !py-2 !text-xs`}><ImageIcon className="w-4 h-4" />{uploading === 'photo' ? 'Uploading…' : 'Add a photo'}</FilePick>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                <button onClick={() => removePhoto(p)} aria-label="Remove photo" className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* DANGER ZONE */}
      {(isOwner || isModerator) && (
        <section className="rounded-2xl p-3.5 space-y-2 border border-[#FF6B7A]/35 bg-[#FF6B7A]/[0.05]">
          <p className="text-[11px] font-black tracking-wider text-[#FF8A9C]">DANGER ZONE</p>
          {isModerator && (
            <button onClick={toggleHidden} disabled={busy} className={`${hbtn.ghost} w-full !py-2 !text-xs`}><EyeOff className="w-3.5 h-3.5" />{club.is_hidden ? 'Show this club in the list again' : 'Hide this club from the list (main admin)'}</button>
          )}
          {isOwner && <button onClick={deleteClub} disabled={busy} className={`${hbtn.danger} w-full !py-2 !text-xs`}><Trash2 className="w-3.5 h-3.5" />Delete this club</button>}
        </section>
      )}

      {addOffline && <AddOfflinePlayer clubId={club.id} onClose={() => setAddOffline(false)} onSaved={() => { setAddOffline(false); load(); }} />}
    </div>
  );
};
