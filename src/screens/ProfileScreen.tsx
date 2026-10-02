import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, AtSign, BadgeCheck, Calendar, Camera, Check, Flag, Globe, MapPin, MessageCircle, Music, Pencil, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkFile, errorMessage, formatGigDate, toHandle, uploadImage, type Band, type Profile } from '../lib/db';
import { BAND_COLS } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ConnectFeed } from './ConnectScreen';
import { BandRow } from '../components/cards';
import { ReportModal } from '../components/ReportModal';
import { Avatar, EmptyState, ErrorNote, Field, FilePick, OkNote, SectionHead, Spinner, btn, inputCls } from '../components/ui';

export const ProfileScreen: React.FC<{ id?: string }> = ({ id }) => {
  const go = useNav();
  const { user, profile: me, band: myBand, refresh } = useAuth();
  const targetId = id || user?.id;
  const isMe = !!user && targetId === user.id;
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState<Profile | null>(null);
  const [theirBand, setTheirBand] = useState<Band | null>(null);
  const [followed, setFollowed] = useState<Band[]>([]);
  const [rsvps, setRsvps] = useState<{ gig_id: string; gigs: { id: string; title: string; venue: string; starts_at: string } | null }[]>([]);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [report, setReport] = useState(false);

  const load = useCallback(async () => {
    if (!targetId) { setLoading(false); return; }
    const [{ data: prof }, { data: f }, { data: r }, { data: b }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', targetId).maybeSingle(),
      supabase.from('follows').select(`band_id, bands(${BAND_COLS})`).eq('follower_id', targetId),
      supabase.from('gig_rsvps').select('gig_id, gigs(id, title, venue, starts_at)').eq('user_id', targetId),
      supabase.from('bands').select(BAND_COLS).eq('owner_id', targetId).maybeSingle(),
    ]);
    setP((prof as Profile) || null);
    setFollowed(((f as any[]) || []).map((x) => x.bands).filter(Boolean));
    setRsvps(((r as any[]) || []).filter((x) => x.gigs && new Date(x.gigs.starts_at).getTime() > Date.now() - 6 * 3600e3));
    setTheirBand((b as unknown as Band) || null);
    setLoading(false);
  }, [targetId]);

  useEffect(() => { setLoading(true); setEditing(false); load(); }, [load]);

  if (!user && !id) {
    return (
      <div className="px-3 py-4">
        <EmptyState icon={Users} title="You’re not logged in" text="Log in to see your profile." action={<button onClick={() => go({ name: 'auth' })} className={btn.primary}>Log In</button>} />
      </div>
    );
  }
  if (loading) return <Spinner label="Loading profile…" />;
  if (!p) return <div className="px-3 py-4"><EmptyState icon={Users} title="This profile isn’t available" /></div>;

  return (
    <div className="px-3 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => go({ name: 'connect' })} className={`${btn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" /> Back to Feed</button>
        <span className="px-2 py-0.5 rounded-full bg-[#53E6D4]/10 border border-[#53E6D4]/35 text-[#53E6D4] font-mono text-[10px] font-bold">{p.role === 'artist' ? 'Artist Account' : 'Davao Fan Profile'}</span>
      </div>

      <div className="rounded-3xl bg-[#1D232A] border border-white/[0.08] p-4 space-y-3">
        {editing && isMe ? (
          <EditProfile profile={p} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); setSaved(true); await refresh(); load(); }} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Avatar src={p.avatar_url} name={p.display_name} size={80} ring />
              {isMe
                ? <button onClick={() => { setSaved(false); setEditing(true); }} className={`${btn.ghost} !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />Edit Profile</button>
                : user && <button onClick={() => setReport(true)} className={`${btn.ghost} !py-2 !text-xs`}><Flag className="w-3.5 h-3.5" />Report</button>}
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="font-heading font-bold text-[22px] text-white">{p.display_name}</h1>
              {p.is_verified && <BadgeCheck className="w-4 h-4 text-[#53E6D4]" />}
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/15 font-mono text-[10px] font-bold">@{p.username}</span>
            </div>
            {p.district && <p className="flex items-center gap-1.5 font-mono text-xs"><MapPin className="w-3.5 h-3.5 text-[#53E6D4]" />{p.district}</p>}
            {p.bio ? <p className="text-[13px] text-[#8E9AA7] leading-relaxed whitespace-pre-line">{p.bio}</p> : isMe && <p className="text-[13px] text-[#8E9AA7] italic">Add a short bio so the scene knows who you are.</p>}
            {(p.instagram || p.facebook) && (
              <div className="flex flex-wrap gap-4 text-xs">
                {p.instagram && <span className="flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />{p.instagram}</span>}
                {p.facebook && <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#53E6D4]" />{p.facebook}</span>}
              </div>
            )}
            <OkNote text={saved ? 'Profile updated' : null} />
            <div className="grid grid-cols-2 gap-2">
              <div className="py-3 rounded-2xl bg-[#161B20] border border-white/[0.08] text-center"><p className="font-heading font-bold text-xl text-white">{followed.length}</p><p className="font-mono text-[9px] tracking-widest text-[#8E9AA7]">FOLLOWING</p></div>
              <div className="py-3 rounded-2xl bg-[#161B20] border border-white/[0.08] text-center"><p className="font-heading font-bold text-xl text-white">{rsvps.length}</p><p className="font-mono text-[9px] tracking-widest text-[#8E9AA7]">UPCOMING RSVPS</p></div>
            </div>
          </>
        )}
      </div>

      {p.role === 'artist' && (
        <section className="space-y-2.5">
          <SectionHead icon={Music} title={isMe ? 'My Band Page' : 'Band Page'} />
          {theirBand ? <BandRow band={theirBand} /> : isMe ? (
            <EmptyState icon={Music} title="You haven’t created your band page yet" text="Set it up to upload music, add gigs and get discovered." action={<button onClick={() => go({ name: 'onboarding' })} className={btn.primary}>Create Band Page</button>} />
          ) : <EmptyState icon={Music} title="No band page yet" />}
        </section>
      )}

      <section className="space-y-2.5">
        <SectionHead icon={Users} title={`Bands Followed (${followed.length})`} />
        {followed.length === 0
          ? <EmptyState icon={Users} title="Not following any bands yet" text={isMe ? 'Visit a band page and tap Follow.' : undefined} action={isMe ? <button onClick={() => go({ name: 'audio' })} className={btn.ghost}>Discover bands</button> : undefined} />
          : followed.map((b) => <BandRow key={b.id} band={b} />)}
      </section>

      {(isMe || p.show_rsvps) && (
        <section className="space-y-2.5">
          <SectionHead icon={Calendar} title="Going To" />
          {rsvps.length === 0
            ? <EmptyState icon={Calendar} title="No upcoming RSVPs" text={isMe ? 'RSVP to a gig from Home or a band page.' : undefined} />
            : rsvps.map((r) => (
              <div key={r.gig_id} className="p-3 rounded-2xl bg-[#1D232A] border border-white/[0.08]">
                <p className="text-[13px] font-bold text-white">{r.gigs!.title}</p>
                <p className="text-[11px] text-[#8E9AA7]">{formatGigDate(r.gigs!.starts_at)} • {r.gigs!.venue}</p>
              </div>
            ))}
        </section>
      )}

      <section className="space-y-2.5">
        <SectionHead icon={MessageCircle} title={isMe ? 'My Posts' : 'Posts'} />
        <ConnectFeed authorId={p.id} showComposer={false} />
      </section>

      {report && <ReportModal targetType="profile" targetId={p.id} label="this profile" onClose={() => setReport(false)} onLogin={() => go({ name: 'auth' })} />}
    </div>
  );
};

const EditProfile: React.FC<{ profile: Profile; onCancel: () => void; onSaved: () => void }> = ({ profile, onCancel, onSaved }) => {
  const { user } = useAuth();
  const [f, setF] = useState({
    display_name: profile.display_name, username: profile.username, district: profile.district || '', bio: profile.bio || '',
    instagram: profile.instagram || '', facebook: profile.facebook || '',
  });
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [rsvps, setRsvps] = useState(profile.show_rsvps);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.display_name.trim()) return setErr('Display name can’t be empty.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('profiles').update({
      display_name: f.display_name.trim(), username: toHandle(f.username), district: f.district.trim() || null, bio: f.bio.trim() || null,
      instagram: f.instagram.trim() || null, facebook: f.facebook.trim() || null, avatar_url: avatar, show_rsvps: rsvps,
    }).eq('id', user!.id);
    setBusy(false);
    if (error) setErr(errorMessage(error)); else onSaved();
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-lg text-white">Edit Profile</h2>
        <button onClick={onCancel} aria-label="Close without saving" className={btn.icon}><X className="w-4 h-4" /></button>
      </div>
      <div className="flex items-center gap-3.5">
        <Avatar src={avatar} name={f.display_name} size={80} ring />
        <div className="space-y-1.5">
          <p className="text-[13px] font-bold text-white">Profile photo</p>
          <p className="text-[11px] text-[#8E9AA7]">JPG or PNG, square, max 5 MB</p>
          <FilePick accept="image/jpeg,image/png,image/webp" onPick={async (file) => {
            const bad = checkFile(file, 'image'); if (bad) return setErr(bad);
            try { setAvatar(await uploadImage('avatars', user!.id, file)); } catch (e) { setErr(errorMessage(e)); }
          }} className={`${btn.ghost} !py-1.5 !text-xs`}><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />Change photo</FilePick>
        </div>
      </div>
      <Field label="Display Name" icon={Pencil} htmlFor="p-name"><input id="p-name" className={inputCls} value={f.display_name} onChange={set('display_name')} /></Field>
      <Field label="Username" icon={AtSign} htmlFor="p-user" hint="lowercase, numbers, _"><input id="p-user" className={inputCls} value={f.username} onChange={(e) => setF({ ...f, username: toHandle(e.target.value) })} /></Field>
      <Field label="Home District" icon={MapPin} htmlFor="p-dist"><input id="p-dist" className={inputCls} value={f.district} onChange={set('district')} /></Field>
      <Field label="About Me" icon={Pencil} htmlFor="p-bio" hint={`${f.bio.length} / 280`}><textarea id="p-bio" rows={4} maxLength={280} className={`${inputCls} py-3 resize-none`} value={f.bio} onChange={set('bio')} /></Field>
      <Field label="Instagram" icon={Camera} htmlFor="p-ig"><input id="p-ig" className={inputCls} value={f.instagram} onChange={set('instagram')} /></Field>
      <Field label="Facebook" icon={Globe} htmlFor="p-fb"><input id="p-fb" className={inputCls} value={f.facebook} onChange={set('facebook')} /></Field>
      <label className="flex items-center gap-2.5 text-[13px] text-white cursor-pointer"><input type="checkbox" checked={rsvps} onChange={(e) => setRsvps(e.target.checked)} className="w-4 h-4 accent-[#53E6D4]" />Show my gig RSVPs on my profile</label>
      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={onCancel} className={`${btn.ghost} flex-1`}>Cancel</button>
        <button onClick={save} disabled={busy} className={`${btn.mint} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </div>
  );
};
