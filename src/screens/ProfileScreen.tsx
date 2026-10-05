import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, AtSign, BadgeCheck, Building2, Calendar, Camera, Check, ExternalLink, Flag, Globe, ImageIcon, MapPin, MessageCircle, Music, Pencil, Phone, Tag, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkFile, errorMessage, removeImageByUrl, toHandle, uploadImage, type Band, type Gig, type Profile, roleMeta } from '../lib/db';
import { BAND_COLS, fetchMyRsvps, fetchRsvpCounts, genreNames } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ZoomImg } from '../components/Zoom';
import { ConnectFeed } from './ConnectScreen';
import { BandRow, GigCard } from '../components/cards';
import { MembersEditor } from '../components/MembersEditor';
import { Playlists } from '../components/Playlists';
import { GenrePicker } from '../components/GenrePicker';
import { fetchBandGenreNames, setBandGenres } from '../lib/genres';
import { ReportModal } from '../components/ReportModal';
import { MessageButton } from './MessagesScreen';
import { DeleteAccountSection } from '../components/DeleteAccount';
import { NameHint, nameBlocked, useNameCheck } from '../components/NameCheck';
import { Testimonials } from '../components/Testimonials';
import { BlockMenu, BlockedBanner, BlockedList, useMyBlock } from '../components/BlockMenu';
import { CardBackdrop, CardBackgroundAdjuster, DEFAULT_CROP, cropOf, type CardCrop } from '../components/CardBackground';
import { VenueFields, checkVenue, venueInfoFrom, venuePatch } from '../components/VenueFields';
import { Avatar, EmptyState, ErrorNote, Field, FilePick, OkNote, Panel, Spinner, btn, inputCls } from '../components/ui';

export const ProfileScreen: React.FC<{ id?: string }> = ({ id }) => {
  const go = useNav();
  const { user, profile: me, band: myBand, refresh } = useAuth();
  const targetId = id || user?.id;
  const isMe = !!user && targetId === user.id;
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState<Profile | null>(null);
  const [theirBand, setTheirBand] = useState<Band | null>(null);
  const [followed, setFollowed] = useState<Band[]>([]);
  const [rsvps, setRsvps] = useState<Gig[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [postCount, setPostCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [report, setReport] = useState(false);
  const { block, reload: reloadBlock } = useMyBlock(targetId && targetId !== user?.id ? targetId : undefined);
  type Person = { id: string; display_name: string; avatar_url: string | null; role: string };
  const [fans, setFans] = useState<Person[]>([]);       // people who follow this profile
  const [followingPeople, setFollowingPeople] = useState<Person[]>([]);
  const [iFollow, setIFollow] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [venueGigs, setVenueGigs] = useState<Gig[]>([]);

  const load = useCallback(async () => {
    if (!targetId) { setLoading(false); return; }
    const [{ data: prof }, { data: f }, { data: r }, { data: b }, c, my, pc, { data: fr }, { data: fg }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', targetId).maybeSingle(),
      supabase.from('follows').select(`band_id, bands(${BAND_COLS})`).eq('follower_id', targetId),
      supabase.from('gig_rsvps').select('gig_id, gigs(*, bands(id, name, logo_url))').eq('user_id', targetId),
      supabase.from('bands').select(BAND_COLS).eq('owner_id', targetId).maybeSingle(),
      fetchRsvpCounts(),
      user ? fetchMyRsvps(user.id) : Promise.resolve(new Set<string>()),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', targetId),
      supabase.from('user_follows').select('follower_id, profiles!user_follows_follower_id_fkey(id, display_name, avatar_url, role)').eq('followee_id', targetId).order('created_at', { ascending: false }),
      supabase.from('user_follows').select('followee_id, profiles!user_follows_followee_id_fkey(id, display_name, avatar_url, role)').eq('follower_id', targetId).order('created_at', { ascending: false }),
    ]);
    const fansList = (((fr as any[]) || []).map((x) => x.profiles).filter(Boolean)) as Person[];
    setFans(fansList);
    setFollowingPeople((((fg as any[]) || []).map((x) => x.profiles).filter(Boolean)) as Person[]);
    setIFollow(!!user && fansList.some((x) => x.id === user.id));
    setP((prof as Profile) || null);
    setFollowed(((f as any[]) || []).map((x) => x.bands).filter(Boolean));
    setRsvps(((r as any[]) || []).map((x) => x.gigs).filter((g) => g && new Date(g.starts_at).getTime() > Date.now() - 6 * 3600e3)
      .sort((a: Gig, b: Gig) => a.starts_at.localeCompare(b.starts_at)));
    setCounts(c); setMine(my); setPostCount(pc.count || 0);
    setTheirBand((b as unknown as Band) || null);
    // Venues: upcoming gigs whose venue name matches this place
    const pr = prof as Profile | null;
    if (pr?.role === 'venue' && pr.display_name.trim().length >= 3) {
      const name = pr.display_name.trim().replace(/[%_\\]/g, (m) => '\\' + m);
      const { data: vg } = await supabase.from('gigs').select('*, bands(id, name, logo_url)').ilike('venue', `%${name}%`)
        .gte('starts_at', new Date(Date.now() - 6 * 3600e3).toISOString()).order('starts_at').limit(20);
      setVenueGigs((vg as Gig[]) || []);
    } else setVenueGigs([]);
    setLoading(false);
  }, [targetId, user?.id]); // id only: a token refresh shouldn't reload the page or close the editor

  useEffect(() => { setLoading(true); setEditing(false); load(); }, [load]);
  // opened from the menu's "Edit Profile" / "Delete Account"
  useEffect(() => {
    if (loading || !isMe) return;
    const check = () => {
    let want: string | null = null;
    try { want = sessionStorage.getItem('minaw-open-edit'); sessionStorage.removeItem('minaw-open-edit'); } catch { /* ignore */ }
    if (!want) return;
    setSaved(false); setEditing(true);
    if (want === 'delete') setTimeout(() => document.getElementById('account-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    };
    check();
    window.addEventListener('minaw-open-edit', check);
    return () => window.removeEventListener('minaw-open-edit', check);
  }, [loading, isMe]);

  const toggleFollow = async () => {
    if (!user) return go({ name: 'auth' });
    if (!targetId) return;
    setFollowBusy(true);
    const { error } = iFollow
      ? await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('followee_id', targetId)
      : await supabase.from('user_follows').insert({ follower_id: user.id, followee_id: targetId });
    setFollowBusy(false);
    if (error) alert(errorMessage(error));
    load();
  };

  const personGrid = (list: Person[]) => (
    <div className="grid grid-cols-4 gap-2.5">
      {list.map((x) => (
        <button key={x.id} onClick={() => go({ name: 'profile', id: x.id })} aria-label={`View ${x.display_name}’s profile`} className="flex flex-col items-center gap-1.5 min-w-0 cursor-pointer">
          <Avatar src={x.avatar_url} name={x.display_name} size={52} square={roleMeta(x.role).square} />
          <span className="text-[11px] font-bold text-white max-w-full truncate">{x.display_name}</span>
        </button>
      ))}
    </div>
  );

  if (!user && !id) {
    return (
      <div className="px-3 py-4">
        <EmptyState icon={Users} title="You’re not logged in" text="Log in to see your profile." action={<button onClick={() => go({ name: 'auth' })} className={btn.primary}>Log In</button>} />
      </div>
    );
  }
  if (loading) return <Spinner label="Loading profile…" />;
  // Artists with a band page don't have a separate profile — their band page is their profile.
  if (p?.role === 'artist' && theirBand) return <ArtistRedirect bandId={theirBand.id} />;
  if (!p) return <div className="px-3 py-4"><EmptyState icon={Users} title="This profile isn’t available" /></div>;

  return (
    <div className="px-3 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => go({ name: 'connect' })} className={`${btn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" /> Back to Feed</button>
        <span className="px-2 py-0.5 rounded-full bg-[#53E6D4]/10 border border-[#53E6D4]/35 text-[#53E6D4] font-mono text-[10px] font-bold">{p.role === 'artist' ? 'Artist Account' : p.role === 'venue' ? 'Venue/Business' : 'Davao Fan Profile'}</span>
      </div>

      {block && !isMe && <BlockedBanner block={block} name={p.display_name} onChange={() => { reloadBlock(); load(); }} />}

      <div className="relative overflow-hidden rounded-3xl bg-[#1D232A] border border-white/[0.08] p-4 space-y-3">
        {p.card_bg_url && !(editing && isMe) && <CardBackdrop url={p.card_bg_url} crop={p.card_bg_crop} />}
        {editing && isMe ? (
          <EditProfile profile={p} bandId={theirBand?.id} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); setSaved(true); await refresh(); load(); }} />
        ) : (
          <div className="relative space-y-3">
            <div className="flex items-center justify-between">
              {p.avatar_url ? <span className="w-20"><ZoomImg src={p.avatar_url} alt={`${p.display_name}’s photo`} className={`w-20 h-20 ${roleMeta(p.role).square ? 'rounded-2xl' : 'rounded-full'} object-cover ring-2 ring-[#53E6D4] bg-[#252D37]`} /></span> : <Avatar src={null} name={p.display_name} size={80} square={roleMeta(p.role).square} ring />}
              {isMe
                ? <button onClick={() => { setSaved(false); setEditing(true); }} className={`${btn.ghost} !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" />Edit Profile</button>
                : (
                  <div className="flex gap-1.5">
                    <button onClick={toggleFollow} disabled={followBusy || !!block} className={`${iFollow ? btn.ghost : btn.primary} !py-2 !text-xs`}>
                      {iFollow ? <><UserMinus className="w-3.5 h-3.5" />Following</> : <><UserPlus className="w-3.5 h-3.5" />Follow</>}
                    </button>
                    {!block && <MessageButton to={p.id} label="" className={btn.icon} />}
                    {user && <button onClick={() => setReport(true)} aria-label="Report profile" className={btn.icon}><Flag className="w-4 h-4" /></button>}
                    {user && <BlockMenu targetId={p.id} name={p.display_name} onChange={() => { reloadBlock(); load(); }} />}
                  </div>
                )}
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="font-heading font-bold text-[22px] text-white">{p.display_name}</h1>
              {p.is_verified && <BadgeCheck className="w-4 h-4 text-[#53E6D4]" />}
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/15 font-mono text-[10px] font-bold">@{p.username}</span>
            </div>
            {p.role === 'artist' && theirBand && genreNames(theirBand).length > 0 && (
              <div className="flex flex-wrap gap-1.5">{genreNames(theirBand).map((g) => <span key={g} className="px-2.5 py-0.5 rounded-full bg-[#6045F4] text-white text-[10px] font-bold">{g}</span>)}</div>
            )}
            {p.role === 'venue' && p.venue_type && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFB800]/15 text-[#FFC34D] text-[10px] font-bold"><Building2 className="w-3 h-3" />{p.venue_type}</span>}
            {p.district && <p className="flex items-center gap-1.5 font-mono text-xs"><MapPin className="w-3.5 h-3.5 text-[#53E6D4]" />{p.district}</p>}
            {p.bio ? <p className="text-[13px] text-[#8E9AA7] leading-relaxed whitespace-pre-line">{p.bio}</p> : isMe && <p className="text-[13px] text-[#8E9AA7] italic">Add a short bio so the scene knows who you are.</p>}
            {(p.instagram || p.facebook) && (
              <div className="flex flex-wrap gap-4 text-xs">
                {p.instagram && <span className="flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />{p.instagram}</span>}
                {p.facebook && <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#53E6D4]" />{p.facebook}</span>}
              </div>
            )}
            {p.role === 'venue' && (p.venue_address || p.venue_capacity || p.venue_contact || p.venue_map_url) && (
              <div className="space-y-1.5 p-3 rounded-2xl bg-[#161B20]/85 border border-white/[0.08] text-xs">
                {p.venue_address && <p className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 text-[#FFC34D] mt-0.5 flex-shrink-0" />{p.venue_address}</p>}
                {p.venue_capacity && <p className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-[#FFC34D]" />Fits about {p.venue_capacity.toLocaleString()} people</p>}
                {p.venue_contact && <a href={`tel:${p.venue_contact.replace(/[^+\d]/g, '')}`} className="flex items-center gap-2 hover:underline"><Phone className="w-3.5 h-3.5 text-[#FFC34D]" />{p.venue_contact}</a>}
                {p.venue_map_url && /^https?:\/\//i.test(p.venue_map_url) && <a href={p.venue_map_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#53E6D4] font-bold hover:underline"><ExternalLink className="w-3.5 h-3.5" />Open in Google Maps</a>}
              </div>
            )}
            <OkNote text={saved ? 'Profile updated' : null} />
            <div className="grid grid-cols-3 gap-2">
              <div className="py-3 rounded-2xl bg-[#161B20] border border-white/[0.08] text-center"><p className="font-heading font-bold text-xl text-white">{fans.length}</p><p className="font-mono text-[9px] tracking-widest text-[#8E9AA7]">FOLLOWERS</p></div>
              <div className="py-3 rounded-2xl bg-[#161B20] border border-white/[0.08] text-center"><p className="font-heading font-bold text-xl text-white">{followed.length + followingPeople.length}</p><p className="font-mono text-[9px] tracking-widest text-[#8E9AA7]">FOLLOWING</p></div>
              {p.role !== 'fan'
                ? <div className="py-3 rounded-2xl bg-[#161B20] border border-white/[0.08] text-center"><p className="font-heading font-bold text-xl text-white">{postCount}</p><p className="font-mono text-[9px] tracking-widest text-[#8E9AA7]">POSTS</p></div>
                : <div className="py-3 rounded-2xl bg-[#161B20] border border-white/[0.08] text-center"><p className="font-heading font-bold text-xl text-white">{rsvps.length}</p><p className="font-mono text-[9px] tracking-widest text-[#8E9AA7]">GOING TO</p></div>}
            </div>
          </div>
        )}
      </div>

      {p.role === 'artist' && (
        <Panel tone="band" icon={Music} title={isMe ? 'My Band Page' : 'Band Page'}>
          {theirBand ? <BandRow band={theirBand} /> : isMe ? (
            <EmptyState icon={Music} title="You haven’t created your band page yet" text="Set it up to upload music, add gigs and get discovered." action={<button onClick={() => go({ name: 'onboarding' })} className={btn.primary}>Create Band Page</button>} />
          ) : <EmptyState icon={Music} title="No band page yet" />}
        </Panel>
      )}

      <Panel tone="bands" icon={Users} title={`Bands Followed (${followed.length})`}>
        {followed.length === 0
          ? <EmptyState icon={Users} title="Not following any bands yet" text={isMe ? 'Visit a band page and tap Follow.' : undefined} action={isMe ? <button onClick={() => go({ name: 'audio' })} className={btn.ghost}>Discover bands</button> : undefined} />
          : followed.map((b) => <BandRow key={b.id} band={b} />)}
      </Panel>

      <Panel tone="followers" icon={Users} title={`Followers (${fans.length})`}>
        {fans.length === 0 ? <EmptyState icon={Users} title="No followers yet" text={isMe ? 'Fans and artists who follow you will show up here.' : 'Be the first to follow.'} /> : personGrid(fans)}
      </Panel>

      {followingPeople.length > 0 && (
        <Panel tone="following" icon={Users} title={`Following People (${followingPeople.length})`}>
          {personGrid(followingPeople)}
        </Panel>
      )}

      {p.role === 'venue' && (
        <Panel tone="gigs" icon={Calendar} title={`Upcoming Gigs Here (${venueGigs.length})`} sub="Gigs whose venue matches this place’s name">
          {venueGigs.length === 0
            ? <EmptyState icon={Calendar} title="No upcoming gigs listed here yet" text={isMe ? 'When bands add a gig with your venue’s name, it shows up here.' : undefined} />
            : venueGigs.map((g) => <GigCard key={g.id} gig={g} count={counts[g.id] || 0} going={mine.has(g.id)} onChange={load} />)}
        </Panel>
      )}

      {p.role === 'venue' && (
        <Testimonials kind="venue" targetId={p.id} isOwner={isMe} />
      )}

      {p.role === 'fan' && (isMe || p.show_rsvps) && (
        <Panel tone="gigs" icon={Calendar} title={`Going To (${rsvps.length})`} sub={isMe && !p.show_rsvps ? 'Only you can see this — turn on “Show my gig RSVPs” in Edit Profile to share it.' : undefined}>
          {rsvps.length === 0
            ? <EmptyState icon={Calendar} title="No upcoming RSVPs" text={isMe ? 'RSVP to a gig from Home or a band page.' : 'No upcoming gigs yet.'} />
            : rsvps.map((g) => <GigCard key={g.id} gig={g} count={counts[g.id] || 0} going={mine.has(g.id)} onChange={load} />)}
        </Panel>
      )}

      <Playlists ownerId={p.id} isMe={isMe} />

      {isMe && <BlockedList />}

      {p.role === 'venue' && (
        <Panel tone="tagged" icon={Tag} title="Tagged Posts" sub="Posts where people tagged this venue">
          <ConnectFeed taggedVenue={{ id: p.id, username: p.username }} showComposer={false} />
        </Panel>
      )}

      <Panel tone="posts" icon={MessageCircle} title={isMe ? 'My Posts' : 'Posts'} sub={isMe ? 'Everything you post here or on Connect shows up for all fans and artists.' : undefined}>
        <ConnectFeed authorId={p.id} showComposer={isMe} />
      </Panel>

      {report && <ReportModal targetType="profile" targetId={p.id} label="this profile" onClose={() => setReport(false)} onLogin={() => go({ name: 'auth' })} />}
    </div>
  );
};

/** Replaces the address (so Back doesn't bounce here again) and opens the band page. */
const ArtistRedirect: React.FC<{ bandId: string }> = ({ bandId }) => {
  useEffect(() => { window.location.replace(`#/band/${bandId}`); }, [bandId]);
  return <Spinner label="Opening band page…" />;
};

const EditProfile: React.FC<{ profile: Profile; bandId?: string; onCancel: () => void; onSaved: () => void }> = ({ profile, bandId, onCancel, onSaved }) => {
  const { user, band: authBand } = useAuth();
  const [f, setF] = useState({
    display_name: profile.display_name, username: profile.username, district: profile.district || '', bio: profile.bio || '',
    instagram: profile.instagram || '', facebook: profile.facebook || '',
  });
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [cardBg, setCardBg] = useState(profile.card_bg_url);
  const [crop, setCrop] = useState<CardCrop>(cropOf(profile.card_bg_crop));
  const [bgBusy, setBgBusy] = useState(false);
  const [vinfo, setVinfo] = useState(venueInfoFrom(profile));
  const isVenue = profile.role === 'venue';
  const [rsvps, setRsvps] = useState(profile.show_rsvps);
  const [genres, setGenres] = useState<string[]>([]);
  const [genresLoaded, setGenresLoaded] = useState(false);
  useEffect(() => { if (bandId) fetchBandGenreNames(bandId).then((g) => { setGenres(g); setGenresLoaded(true); }); }, [bandId]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const nameCheck = useNameCheck('name', f.display_name, { bandId, current: profile.display_name });
  const userCheck = useNameCheck('username', f.username, { current: profile.username });

  const save = async () => {
    if (!f.display_name.trim()) return setErr('Display name can’t be empty.');
    if (nameBlocked('name', profile.role, nameCheck.result) || nameBlocked('username', profile.role, userCheck.result)) return setErr('That name or username is already taken — please choose a different one.');
    if (isVenue) { const bad = checkVenue(vinfo); if (bad) return setErr(bad); }
    setBusy(true); setErr(null);
    const { error } = await supabase.from('profiles').update({
      display_name: f.display_name.trim(), username: toHandle(f.username), district: f.district.trim() || null, bio: f.bio.trim() || null,
      instagram: f.instagram.trim() || null, facebook: f.facebook.trim() || null, avatar_url: avatar, show_rsvps: rsvps,
      card_bg_url: cardBg, card_bg_crop: cardBg ? crop : null, ...(isVenue ? venuePatch(vinfo) : {}),
    }).eq('id', user!.id);
    if (!error && bandId) {
      try { if (genresLoaded) await setBandGenres(bandId, genres); } catch (e) { setBusy(false); return setErr(errorMessage(e)); }
    }
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    if (profile.avatar_url !== avatar) await removeImageByUrl(profile.avatar_url, [avatar, authBand?.logo_url]); // keep it if it's also the band logo
    if (profile.card_bg_url !== cardBg) await removeImageByUrl(profile.card_bg_url, [cardBg]);
    onSaved();
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-lg text-white">Edit Profile</h2>
        <button onClick={onCancel} aria-label="Close without saving" className={btn.icon}><X className="w-4 h-4" /></button>
      </div>
      <div className="flex items-center gap-3.5">
        <Avatar src={avatar} name={f.display_name} size={80} square={roleMeta(profile.role).square} ring />
        <div className="space-y-1.5">
          <p className="text-[13px] font-bold text-white">{isVenue ? 'Venue photo / logo' : 'Profile photo'}</p>
          <p className="text-[11px] text-[#8E9AA7]">JPG or PNG, square, max 5 MB</p>
          <FilePick accept="image/jpeg,image/png,image/webp" onPick={async (file) => {
            const bad = checkFile(file, 'image'); if (bad) return setErr(bad);
            try { setAvatar(await uploadImage('avatars', user!.id, file)); } catch (e) { setErr(errorMessage(e)); }
          }} className={`${btn.ghost} !py-1.5 !text-xs`}><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />Change photo</FilePick>
        </div>
      </div>
      <div className="space-y-2 p-3 rounded-2xl bg-[#0F1417] border border-white/15">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><ImageIcon className="w-4 h-4 text-[#53E6D4]" />Card background</p>
        <p className="text-[11px] text-[#8E9AA7]">A photo that softly fades in behind the right side of your profile card. {cardBg ? 'Drag the photo to choose which part shows, and zoom with the slider.' : 'Landscape photos look best.'}</p>
        {cardBg
          ? <CardBackgroundAdjuster url={cardBg} crop={crop} onChange={setCrop} avatar={avatar} name={f.display_name} square={roleMeta(profile.role).square} />
          : <div className="h-16 rounded-xl bg-[#1D232A] border border-dashed border-white/15 flex items-center justify-center text-[11px] text-[#8E9AA7]">No background yet</div>}
        <div className="flex gap-2">
          <FilePick accept="image/jpeg,image/png,image/webp" disabled={bgBusy} onPick={async (file) => {
            const bad = checkFile(file, 'image'); if (bad) return setErr(bad);
            setBgBusy(true); setErr(null);
            try {
              const url = await uploadImage('banners', user!.id, file);
              if (cardBg && cardBg !== profile.card_bg_url) await removeImageByUrl(cardBg); // an unsaved earlier pick
              setCardBg(url); setCrop(DEFAULT_CROP);
            } catch (e) { setErr(errorMessage(e)); }
            setBgBusy(false);
          }} className={`${btn.ghost} !py-1.5 !text-xs`}><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />{bgBusy ? 'Uploading…' : cardBg ? 'Change image' : 'Upload image'}</FilePick>
          {cardBg && <button type="button" onClick={() => setCardBg(null)} className={`${btn.ghost} !py-1.5 !text-xs`}><Trash2 className="w-3.5 h-3.5" />Remove</button>}
        </div>
      </div>
      <Field label={isVenue ? 'Venue/Business Name' : 'Display Name'} icon={Pencil} htmlFor="p-name"><input id="p-name" className={inputCls} value={f.display_name} onChange={set('display_name')} /></Field>
      <NameHint kind="name" role={profile.role} value={f.display_name} {...nameCheck} onPick={(x) => setF({ ...f, display_name: x })} />
      <Field label="Username" icon={AtSign} htmlFor="p-user" hint="lowercase, numbers, _"><input id="p-user" className={inputCls} value={f.username} onChange={(e) => setF({ ...f, username: toHandle(e.target.value) })} /></Field>
      <NameHint kind="username" role={profile.role} value={f.username} {...userCheck} onPick={(x) => setF({ ...f, username: toHandle(x) })} />
      <Field label={isVenue ? 'District' : 'Home District'} icon={MapPin} htmlFor="p-dist"><input id="p-dist" className={inputCls} value={f.district} onChange={set('district')} /></Field>
      <Field label={isVenue ? 'Description' : 'About Me'} icon={Pencil} htmlFor="p-bio" hint={`${f.bio.length} / 280`}><textarea id="p-bio" rows={4} maxLength={280} className={`${inputCls} py-3 resize-none`} value={f.bio} onChange={set('bio')} /></Field>
      <Field label="Instagram" icon={Camera} htmlFor="p-ig"><input id="p-ig" className={inputCls} value={f.instagram} onChange={set('instagram')} /></Field>
      <Field label="Facebook" icon={Globe} htmlFor="p-fb"><input id="p-fb" className={inputCls} value={f.facebook} onChange={set('facebook')} /></Field>
      {isVenue && <div className="space-y-3.5 p-3 rounded-2xl bg-[#0F1417] border border-white/15"><VenueFields value={vinfo} onChange={setVinfo} /></div>}
      {profile.role === 'fan' && <label className="flex items-center gap-2.5 text-[13px] text-white cursor-pointer"><input type="checkbox" checked={rsvps} onChange={(e) => setRsvps(e.target.checked)} className="w-4 h-4 accent-[#53E6D4]" />Show my gig RSVPs on my profile</label>}
      {profile.role === 'artist' && bandId && <div className="p-3 rounded-2xl bg-[#0F1417] border border-white/15"><GenrePicker value={genres} onChange={setGenres} /></div>}
      {profile.role === 'artist' && bandId && <div className="p-3 rounded-2xl bg-[#0F1417] border border-white/15"><MembersEditor bandId={bandId} ownerId={profile.id} /></div>}
      <ErrorNote text={err} />
      <div className="flex gap-2">
        <button onClick={onCancel} className={`${btn.ghost} flex-1`}>Cancel</button>
        <button onClick={save} disabled={busy} className={`${btn.mint} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save Changes'}</button>
      </div>
      <DeleteAccountSection />
    </div>
  );
};
