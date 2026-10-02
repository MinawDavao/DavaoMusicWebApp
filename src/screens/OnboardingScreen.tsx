import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight, AtSign, Calendar, Camera, Check, Disc3, Eye, Globe, Headphones, Lock, Mail, MapPin, Music, Pencil, Phone,
  Play, Plus, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import { supabase, CURRENT_TERMS_VERSION } from '../lib/supabase';
import { checkFile, errorMessage, toHandle, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { TermsText } from '../components/TermsText';
import { MAX_TRACKS, uploadTrack } from '../components/TrackUpload';
import { Avatar, ErrorNote, Field, FilePick, btn, inputCls } from '../components/ui';

const Steps: React.FC<{ at: 'terms' | 'setup' }> = ({ at }) => {
  const item = (n: number, label: string, state: 'done' | 'now' | 'todo') => (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${state === 'done' ? 'bg-[#53E6D4] text-[#0F1417]' : state === 'now' ? 'bg-[#6045F4] text-white' : 'bg-[#252D37] text-[#8E9AA7]'}`}>
        {state === 'done' ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : n}
      </span>
      <span className={`text-[10px] font-bold ${state === 'todo' ? 'text-[#8E9AA7]' : 'text-[#EBEBED]'}`}>{label}</span>
    </div>
  );
  return (
    <div className="flex">
      {item(1, 'Account', 'done')}
      {item(2, 'Terms', at === 'terms' ? 'now' : 'done')}
      {item(3, 'Verify (skipped)', at === 'terms' ? 'todo' : 'done')}
      {item(4, 'Profile', at === 'setup' ? 'now' : 'todo')}
    </div>
  );
};

const Check2: React.FC<{ on: boolean; onToggle: () => void; children: React.ReactNode }> = ({ on, onToggle, children }) => (
  <button type="button" role="checkbox" aria-checked={on} onClick={onToggle} className="flex gap-2.5 items-start text-left cursor-pointer">
    <span className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center ${on ? 'bg-[#53E6D4] border-2 border-[#53E6D4]' : 'border-2 border-white/35'}`}>
      {on && <Check className="w-3.5 h-3.5 text-[#0F1417]" strokeWidth={3} />}
    </span>
    <span className="text-xs leading-relaxed text-[#EBEBED]">{children}</span>
  </button>
);

const Toggle: React.FC<{ on: boolean; onToggle: () => void; label: string; sub: string }> = ({ on, onToggle, label, sub }) => (
  <div className="flex items-center gap-3">
    <div className="flex-1">
      <p className="text-[13px] font-bold text-white">{label}</p>
      <p className="text-[11px] text-[#8E9AA7]">{sub}</p>
    </div>
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} className={`w-12 h-7 p-[3px] rounded-full flex cursor-pointer ${on ? 'bg-[#53E6D4] justify-end' : 'bg-[#252D37] justify-start'}`}>
      <span className="w-[22px] h-[22px] rounded-full bg-white" />
    </button>
  </div>
);

const Section: React.FC<{ title: string; sub: string; children: React.ReactNode }> = ({ title, sub, children }) => (
  <div className="space-y-3.5 p-3.5 rounded-2xl bg-[#161B20] border border-white/[0.08]">
    <div>
      <h2 className="font-heading font-bold text-[13px] uppercase tracking-wider text-[#53E6D4]">{title}</h2>
      <p className="text-[11px] text-[#8E9AA7]">{sub}</p>
    </div>
    {children}
  </div>
);

// ===================================================================== TERMS
const TermsStep: React.FC = () => {
  const { user, profile, refresh, signOut } = useAuth();
  const isArtist = profile?.role === 'artist';
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = c1 && c2 && (!isArtist || c3);

  const accept = async () => {
    if (!ok || !user) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('terms_acceptances').insert({
      user_id: user.id, version: CURRENT_TERMS_VERSION, accepted_guidelines: true, accepted_music_rights: isArtist ? c3 : false,
    });
    if (error && !/duplicate key/i.test(error.message)) { setErr(errorMessage(error)); setBusy(false); return; }
    await refresh();
    setBusy(false);
  };

  const hl = (Icon: React.ElementType, t: string, col: string) => (
    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#161B20] border border-white/[0.08] text-[11px] font-bold">
      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[#0F1417] flex-shrink-0" style={{ background: col }}><Icon className="w-3.5 h-3.5" /></span>{t}
    </div>
  );

  return (
    <div className="space-y-4">
      <Steps at="terms" />
      <div className="text-center space-y-1.5">
        <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#B7A8FF] text-[10px] font-bold">STEP 2 · BEFORE YOU JOIN</span>
        <h1 className="font-heading font-bold text-2xl text-white">Terms of Agreement</h1>
        <p className="text-xs text-[#8E9AA7]">Please read how MINAW DVO works before you start posting and uploading.</p>
        <p className="font-mono text-[10px] text-[#8E9AA7]">Last updated: October 2026</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {hl(Music, 'You own your music', '#53E6D4')}
        {hl(ArrowLeftRight, 'Downloads: artist’s choice', '#53E6D4')}
        {hl(Eye, 'No nudity or violence', '#FF8A7A')}
        {hl(X, 'No political posts', '#FF8A7A')}
        {hl(ShieldCheck, 'Reports are reviewed', '#FFB800')}
        {hl(Lock, 'Violations are removed', '#FFB800')}
      </div>
      <div tabIndex={0} role="region" aria-label="Full terms of agreement" className="h-[380px] overflow-y-auto p-3.5 rounded-2xl bg-[#0F1417] border border-white/15">
        <TermsText />
      </div>
      <div className="space-y-3 p-3.5 rounded-2xl bg-[#161B20] border border-white/[0.08]">
        <Check2 on={c1} onToggle={() => setC1(!c1)}>I have read and agree to the MINAW DVO Terms of Agreement and Privacy policy.</Check2>
        <Check2 on={c2} onToggle={() => setC2(!c2)}>I will follow the Community Guidelines: no nudity, violence or political posts. I understand reported content is reviewed and removed if it breaks the rules.</Check2>
        {isArtist && <Check2 on={c3} onToggle={() => setC3(!c3)}>I own or have permission to share every song I upload, and I’ll choose whether fans can download it.</Check2>}
      </div>
      <ErrorNote text={err} />
      <button onClick={accept} disabled={!ok || busy} className={`${btn.mint} w-full h-12`}><Check className="w-4 h-4" /> {busy ? 'Saving…' : 'Agree & Continue'}</button>
      <p className="-mt-2 text-center text-[11px] text-[#8E9AA7]">{ok ? 'Next: set up your profile.' : 'Tick every box above to continue.'}</p>
      <button onClick={signOut} className="w-full h-10 text-[13px] font-bold text-[#8E9AA7] cursor-pointer">Decline &amp; log out</button>
    </div>
  );
};

// ===================================================================== FAN SETUP
const FanSetup: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { user, profile, refresh } = useAuth();
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url ?? null);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [district, setDistrict] = useState(profile?.district ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [ig, setIg] = useState(profile?.instagram ?? '');
  const [fb, setFb] = useState(profile?.facebook ?? '');
  const [rsvps, setRsvps] = useState(profile?.show_rsvps ?? true);
  const [playlists, setPlaylists] = useState(profile?.show_playlists ?? true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickAvatar = async (f: File) => {
    const bad = checkFile(f, 'image'); if (bad) return setErr(bad);
    setUploading(true); setErr(null);
    try { setAvatar(await uploadImage('avatars', user!.id, f)); } catch (e) { setErr(errorMessage(e)); }
    setUploading(false);
  };

  const save = async (skip = false) => {
    setBusy(true); setErr(null);
    const patch: any = { onboarding_completed: true };
    if (!skip) Object.assign(patch, {
      avatar_url: avatar, display_name: name.trim() || profile?.display_name, username: toHandle(username) || profile?.username,
      district: district.trim() || null, bio: bio.trim() || null, instagram: ig.trim() || null, facebook: fb.trim() || null,
      show_rsvps: rsvps, show_playlists: playlists,
    });
    const { error } = await supabase.from('profiles').update(patch).eq('id', user!.id);
    if (error) { setErr(errorMessage(error)); setBusy(false); return; }
    await refresh();
    setBusy(false);
    onDone();
  };

  return (
    <div className="space-y-3.5">
      <Section title="Profile Photo" sub="Shown on your Fan Profile and next to your posts">
        <div className="flex items-center gap-3.5">
          <Avatar src={avatar} name={name} size={80} ring />
          <div className="space-y-1.5">
            <p className="text-[13px] font-bold text-white">Profile photo</p>
            <p className="text-[11px] text-[#8E9AA7]">JPG or PNG, square, max 5 MB</p>
            <FilePick accept="image/jpeg,image/png,image/webp" onPick={pickAvatar} className={`${btn.ghost} !py-1.5 !text-xs`} disabled={uploading}>
              <Camera className="w-3.5 h-3.5 text-[#53E6D4]" /> {uploading ? 'Uploading…' : 'Upload image'}
            </FilePick>
          </div>
        </div>
      </Section>
      <Section title="About You" sub="The basics fans and bands will see">
        <Field label="Display Name" icon={Pencil} htmlFor="f-name"><input id="f-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Username" icon={AtSign} htmlFor="f-user" hint="lowercase, numbers, _"><input id="f-user" className={inputCls} value={username} onChange={(e) => setUsername(toHandle(e.target.value))} /></Field>
        <Field label="Home District" icon={MapPin} htmlFor="f-dist"><input id="f-dist" className={inputCls} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Matina, Davao City" /></Field>
        <Field label="About Me" icon={Pencil} htmlFor="f-bio" hint={`${bio.length} / 280`}>
          <textarea id="f-bio" rows={4} maxLength={280} className={`${inputCls} py-3 resize-none`} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Gig regular? Collector? Tell people what the local scene means to you." />
        </Field>
      </Section>
      <Section title="Socials & Privacy" sub="Optional links and what shows on your profile">
        <Field label="Instagram" icon={Camera} htmlFor="f-ig"><input id="f-ig" className={inputCls} value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@yourhandle" /></Field>
        <Field label="Facebook" icon={Globe} htmlFor="f-fb"><input id="f-fb" className={inputCls} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="facebook.com/yourname" /></Field>
        <Toggle on={rsvps} onToggle={() => setRsvps(!rsvps)} label="Show my gig RSVPs" sub="Let others see which gigs you’re going to" />
        <Toggle on={playlists} onToggle={() => setPlaylists(!playlists)} label="Show my playlists" sub="Display your playlists on your profile" />
      </Section>
      <ErrorNote text={err} />
      <button onClick={() => save(false)} disabled={busy || uploading} className={`${btn.mint} w-full h-12`}><Check className="w-4 h-4" /> {busy ? 'Saving…' : 'Save & Finish'}</button>
      <button onClick={() => save(true)} disabled={busy} className="w-full h-10 text-[13px] font-bold text-[#8E9AA7] cursor-pointer">Skip for now — I’ll finish later</button>
    </div>
  );
};

// ===================================================================== ARTIST SETUP
interface PendingTrack { file: File; title: string; allow: boolean }
interface MemberRow { key: number; name: string; role: string }

const ArtistSetup: React.FC<{ onDone: (bandId?: string) => void }> = ({ onDone }) => {
  const { user, profile, band, refresh } = useAuth();
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [logo, setLogo] = useState<string | null>(band?.logo_url ?? profile?.avatar_url ?? null);
  const [banner, setBanner] = useState<string | null>(band?.banner_url ?? null);
  const [name, setName] = useState(band?.name ?? profile?.display_name ?? '');
  const [handle, setHandle] = useState(band?.handle ?? toHandle(profile?.display_name ?? ''));
  const [base, setBase] = useState(band?.home_base ?? '');
  const [year, setYear] = useState(band?.year_formed ? String(band.year_formed) : '');
  const [bio, setBio] = useState(band?.bio ?? '');
  const [picked, setPicked] = useState<number[]>(band?.band_genres?.map((g) => g.genre_id) ?? []);
  const [influences, setInfluences] = useState(band?.influences ?? '');
  const [members, setMembers] = useState<MemberRow[]>([{ key: 1, name: '', role: '' }]);
  const [email, setEmail] = useState(band?.booking_email ?? user?.email ?? '');
  const [mobile, setMobile] = useState(band?.mobile ?? '');
  const [fb, setFb] = useState(band?.facebook ?? '');
  const [ig, setIg] = useState(band?.instagram ?? '');
  const [stream, setStream] = useState(band?.streaming_url ?? '');
  const [bookings, setBookings] = useState(band?.open_for_bookings ?? true);
  const [tracks, setTracks] = useState<PendingTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('genres').select('id, name').order('name').then(({ data }) => setGenres((data as any) || []));
  }, []);

  const pickImage = (bucket: 'avatars' | 'banners', set: (u: string) => void) => async (f: File) => {
    const bad = checkFile(f, 'image'); if (bad) return setErr(bad);
    setUploading(true); setErr(null);
    try { set(await uploadImage(bucket, user!.id, f)); } catch (e) { setErr(errorMessage(e)); }
    setUploading(false);
  };

  const toggleGenre = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));

  const save = async () => {
    if (!user) return;
    if (!name.trim()) return setErr('Please enter your band or artist name.');
    if (toHandle(handle).length < 3) return setErr('Band username must be at least 3 characters (lowercase letters, numbers or _).');
    setBusy(true); setErr(null);
    try {
      setStatus('Saving band page…');
      const row = {
        owner_id: user.id, name: name.trim(), handle: toHandle(handle), logo_url: logo, banner_url: banner,
        home_base: base.trim() || null, year_formed: year ? Number(year) : null, bio: bio.trim() || null,
        influences: influences.trim() || null, booking_email: email.trim() || null, mobile: mobile.trim() || null,
        facebook: fb.trim() || null, instagram: ig.trim() || null, streaming_url: stream.trim() || null, open_for_bookings: bookings,
      };
      let bandId = band?.id;
      if (bandId) {
        const { error } = await supabase.from('bands').update(row).eq('id', bandId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('bands').insert(row).select('id').single();
        if (error) throw error;
        bandId = (data as any).id;
      }
      // genres
      await supabase.from('band_genres').delete().eq('band_id', bandId!);
      if (picked.length) {
        const { error } = await supabase.from('band_genres').insert(picked.map((g) => ({ band_id: bandId, genre_id: g })));
        if (error) throw error;
      }
      // members
      const realMembers = members.filter((m) => m.name.trim());
      if (realMembers.length) {
        const { error } = await supabase.from('band_members').insert(
          realMembers.map((m, i) => ({ band_id: bandId, name: m.name.trim(), role: m.role.trim() || null, sort_order: i })),
        );
        if (error) throw error;
      }
      // tracks
      for (let i = 0; i < tracks.length; i++) {
        setStatus(`Uploading song ${i + 1} of ${tracks.length}…`);
        await uploadTrack({ userId: user.id, bandId: bandId!, file: tracks[i].file, title: tracks[i].title, allowDownload: tracks[i].allow });
      }
      setStatus('Finishing…');
      const { error: pe } = await supabase.from('profiles').update({ onboarding_completed: true, avatar_url: logo, display_name: name.trim() }).eq('id', user.id);
      if (pe) throw pe;
      await refresh();
      onDone(bandId);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false); setStatus(null);
    }
  };

  const skip = async () => {
    setBusy(true);
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user!.id);
    await refresh();
    setBusy(false);
    onDone();
  };

  return (
    <div className="space-y-3.5">
      <Section title="Band Image" sub="Your logo or band photo, plus a banner for your page">
        <FilePick accept="image/jpeg,image/png,image/webp" onPick={pickImage('banners', setBanner)} className="block w-full h-28 rounded-2xl border-[1.5px] border-dashed border-white/15 bg-[#0F1417] overflow-hidden cursor-pointer">
          {banner ? <img src={banner} alt="Banner" className="w-full h-full object-cover" /> : (
            <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-[#8E9AA7] text-xs font-bold"><Camera className="w-5 h-5" />Add cover banner</span>
          )}
        </FilePick>
        <div className="flex items-center gap-3.5">
          <Avatar src={logo} name={name} size={80} square ring />
          <div className="space-y-1.5">
            <p className="text-[13px] font-bold text-white">Band logo / photo</p>
            <p className="text-[11px] text-[#8E9AA7]">JPG or PNG, square, max 5 MB</p>
            <FilePick accept="image/jpeg,image/png,image/webp" onPick={pickImage('avatars', setLogo)} className={`${btn.ghost} !py-1.5 !text-xs`} disabled={uploading}>
              <Plus className="w-3.5 h-3.5 text-[#53E6D4]" /> {uploading ? 'Uploading…' : 'Upload image'}
            </FilePick>
          </div>
        </div>
      </Section>

      <Section title="About the Band" sub="How fans will discover and recognise you">
        <Field label="Band / Artist Name" icon={Music} htmlFor="a-name"><input id="a-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Band Username" icon={AtSign} htmlFor="a-handle" hint="lowercase, numbers, _"><input id="a-handle" className={inputCls} value={handle} onChange={(e) => setHandle(toHandle(e.target.value))} placeholder="yourband" /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Home Base" icon={MapPin} htmlFor="a-base"><input id="a-base" className={inputCls} value={base} onChange={(e) => setBase(e.target.value)} placeholder="e.g. Matina" /></Field>
          <Field label="Year Formed" icon={Calendar} htmlFor="a-year"><input id="a-year" inputMode="numeric" className={inputCls} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2019" /></Field>
        </div>
        <Field label="About the Band" icon={Pencil} htmlFor="a-bio" hint={`${bio.length} / 500`}>
          <textarea id="a-bio" rows={4} maxLength={500} className={`${inputCls} py-3 resize-none`} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Your story, your sound, where you play." />
        </Field>
      </Section>

      <Section title="Sound" sub="Helps fans and the Audio tab find you">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><Headphones className="w-3.5 h-3.5 text-[#53E6D4]" />Genre <span className="ml-auto text-[10px] font-medium text-[#8E9AA7]">{picked.length} / 3 max</span></p>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => {
              const on = picked.includes(g.id);
              return (
                <button key={g.id} type="button" aria-pressed={on} onClick={() => toggleGenre(g.id)} className={`h-8 px-3 rounded-full text-xs font-bold cursor-pointer border ${on ? 'bg-[#6045F4] border-[#6045F4] text-white' : 'bg-[#0F1417] border-white/15 text-[#EBEBED]'}`}>
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Influences" icon={Sparkles} htmlFor="a-infl"><input id="a-infl" className={inputCls} value={influences} onChange={(e) => setInfluences(e.target.value)} placeholder="e.g. Urbandub, Kulintang masters" /></Field>
      </Section>

      <Section title="Members" sub="Who’s in the band (optional)">
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={m.key} className="flex gap-2">
              <input aria-label="Member name" className={`${inputCls} flex-1 min-w-0`} value={m.name} onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" />
              <input aria-label="Member role" className={`${inputCls} flex-1 min-w-0`} value={m.role} onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role / instrument" />
              <button type="button" aria-label="Remove member" onClick={() => setMembers(members.filter((_, j) => j !== i))} className={btn.icon}><X className="w-4 h-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setMembers([...members, { key: Date.now(), name: '', role: '' }])} className="w-full h-10 rounded-xl border-[1.5px] border-dashed border-white/15 text-[#53E6D4] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
            <Users className="w-4 h-4" /> Add member
          </button>
        </div>
      </Section>

      <Section title="Booking & Contacts" sub="How venues and fans reach you">
        <Field label="Booking Email" icon={Mail} htmlFor="a-email"><input id="a-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Mobile Number" icon={Phone} htmlFor="a-mobile"><input id="a-mobile" type="tel" className={inputCls} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+63 9XX XXX XXXX" /></Field>
        <Field label="Facebook Page" icon={Globe} htmlFor="a-fb"><input id="a-fb" className={inputCls} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="facebook.com/yourband" /></Field>
        <Field label="Instagram" icon={Camera} htmlFor="a-ig"><input id="a-ig" className={inputCls} value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@yourband" /></Field>
        <Field label="Spotify / YouTube" icon={Play} htmlFor="a-stream"><input id="a-stream" className={inputCls} value={stream} onChange={(e) => setStream(e.target.value)} placeholder="Link to your music" /></Field>
        <Toggle on={bookings} onToggle={() => setBookings(!bookings)} label="Open for bookings" sub="Show your booking contacts on your band page" />
      </Section>

      <Section title="Upload Your Music" sub={`Add up to ${MAX_TRACKS} songs or demos for now`}>
        <div className="space-y-2">
          {tracks.map((t, i) => (
            <div key={i} className="p-2.5 rounded-xl bg-[#1D232A] border border-white/[0.08] space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-[#6045F4] text-white flex items-center justify-center flex-shrink-0"><Music className="w-4 h-4" /></span>
                <input aria-label="Song title" className={`${inputCls} !min-h-[38px] flex-1 min-w-0`} value={t.title} onChange={(e) => setTracks(tracks.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <button type="button" aria-label="Remove song" onClick={() => setTracks(tracks.filter((_, j) => j !== i))} className={btn.icon}><X className="w-4 h-4" /></button>
              </div>
              <p className="font-mono text-[10px] text-[#8E9AA7] truncate">{t.file.name} · {(t.file.size / 1048576).toFixed(1)} MB</p>
              <label className="flex items-center gap-2 text-[11px] text-[#EBEBED] cursor-pointer">
                <input type="checkbox" checked={t.allow} onChange={(e) => setTracks(tracks.map((x, j) => j === i ? { ...x, allow: e.target.checked } : x))} className="w-4 h-4 accent-[#53E6D4]" />
                Allow fans to download this song
              </label>
            </div>
          ))}
          {tracks.length < MAX_TRACKS ? (
            <FilePick
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border-[1.5px] border-dashed border-white/15 bg-[#0F1417] cursor-pointer"
              onPick={(f) => {
                const bad = checkFile(f, 'audio'); if (bad) return setErr(bad);
                setErr(null);
                setTracks([...tracks, { file: f, title: f.name.replace(/\.[^.]+$/, ''), allow: false }]);
              }}
            >
              <span className="w-9 h-9 rounded-lg bg-[#53E6D4]/10 text-[#53E6D4] flex items-center justify-center"><Plus className="w-4 h-4" /></span>
              <span><span className="block text-[13px] font-bold text-[#53E6D4]">Upload track {tracks.length + 1}</span><span className="block font-mono text-[10px] text-[#8E9AA7]">MP3 or WAV · max 50 MB</span></span>
            </FilePick>
          ) : (
            <p className="text-[11px] text-[#EBEBED] bg-[#FFB800]/10 border border-[#FFB800]/40 rounded-xl px-3 py-2 flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-[#FFB800]" />Upload limit reached — 3 tracks max for now.</p>
          )}
          <p className="flex items-center justify-between text-[11px] text-[#8E9AA7]"><span className="flex items-center gap-1"><Disc3 className="w-3.5 h-3.5" />Songs appear on your band page.</span><span className="font-mono text-[#53E6D4]">{tracks.length} / {MAX_TRACKS}</span></p>
        </div>
      </Section>

      <ErrorNote text={err} />
      {status && <p className="text-xs text-[#53E6D4] text-center">{status}</p>}
      <button onClick={save} disabled={busy || uploading} className={`${btn.mint} w-full h-12`}><Check className="w-4 h-4" /> {busy ? 'Saving…' : 'Save & Finish'}</button>
      <button onClick={skip} disabled={busy} className="w-full h-10 text-[13px] font-bold text-[#8E9AA7] cursor-pointer">Skip for now — I’ll finish later</button>
    </div>
  );
};

// ===================================================================== WRAPPER
export const OnboardingScreen: React.FC = () => {
  const go = useNav();
  const { user, profile, band, termsAccepted, refresh } = useAuth();
  const isArtist = profile?.role === 'artist';
  const [switching, setSwitching] = useState(false);

  const setRole = async (role: 'fan' | 'artist') => {
    if (!user || profile?.role === role || band) return;
    setSwitching(true);
    await supabase.from('profiles').update({ role }).eq('id', user.id);
    await refresh();
    setSwitching(false);
  };
  const roleBtn = (r: 'fan' | 'artist', label: string, Icon: React.ElementType) => (
    <button
      type="button"
      aria-pressed={profile?.role === r}
      disabled={switching || (!!band && profile?.role !== r)}
      onClick={() => setRole(r)}
      className={`flex-1 h-10 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed ${profile?.role === r ? 'bg-[#53E6D4] text-[#0F1417]' : 'text-[#8E9AA7]'}`}
    >
      <Icon className="w-4 h-4" />{label}
    </button>
  );

  if (!profile) return null;

  return (
    <div className="px-3 py-4">
      <div className="rounded-3xl bg-[#1D232A] border border-white/[0.08] p-4 space-y-4">
        {!termsAccepted ? (
          <TermsStep />
        ) : (
          <>
            <Steps at="setup" />
            <div className="text-center space-y-1.5">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#6045F4]/20 border border-[#6045F4]/40 text-[#B7A8FF] text-[10px] font-bold">STEP 4 OF 4</span>
              <h1 className="font-heading font-bold text-2xl text-white">{band ? 'Edit Your Band Page' : 'Complete Your Profile'}</h1>
              <p className="text-xs text-[#8E9AA7]">
                {isArtist ? 'Set up your band page so fans can find, follow and stream you.' : 'Tell the Davao scene who you are.'}
              </p>
            </div>
            <div role="group" aria-label="Account type" className="flex gap-1 p-1 rounded-2xl bg-[#161B20] border border-white/[0.08]">
              {roleBtn('fan', 'I’m a Fan', Headphones)}
              {roleBtn('artist', 'I’m an Artist', Music)}
            </div>
            {isArtist
              ? <ArtistSetup key="artist" onDone={(id) => go(id ? { name: 'band', id } : { name: 'profile' })} />
              : <FanSetup key="fan" onDone={() => go({ name: 'profile' })} />}
          </>
        )}
      </div>
    </div>
  );
};
