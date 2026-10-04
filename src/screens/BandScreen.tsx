import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, Calendar, Camera, Check, Disc3, Flag, Globe, Headphones, Mail, MapPin, Music, Pencil, Phone, Play,
  MessageCircle, Plus, ShieldCheck, Star, Trash2, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkFile, errorMessage, timeAgo, toHandle, uploadImage, type Band, type Gig, type Track, removeImageByUrl, roleMeta } from '../lib/db';
import { fetchMyRsvps, fetchRsvpCounts, fetchTracks, fetchUpcomingGigs, genreNames } from '../lib/queries';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { GigCard, TrackRow } from '../components/cards';
import { MEMBER_COLS, MembersEditor, type MemberRow } from '../components/MembersEditor';
import { NameHint, nameBlocked, useNameCheck } from '../components/NameCheck';
import { Testimonials } from '../components/Testimonials';
import { CoverField, CoverPhoto, DEFAULT_CROP, cropOf, type CardCrop } from '../components/CardBackground';
import { GenrePicker } from '../components/GenrePicker';
import { ZoomImg } from '../components/Zoom';
import { setBandGenres } from '../lib/genres';
import { PlaylistModal } from '../components/PlaylistModal';
import { ConnectFeed } from './ConnectScreen';
import { ReportModal } from '../components/ReportModal';
import { MAX_TRACKS, TrackUploadForm } from '../components/TrackUpload';
import { Avatar, EmptyState, ErrorNote, Field, FilePick, Modal, SectionHead, Spinner, btn, inputCls } from '../components/ui';

type Member = MemberRow;
interface Photo { id: string; image_url: string; title: string | null; tag: string | null }

export const BandScreen: React.FC<{ id: string; song?: string }> = ({ id, song }) => {
  const go = useNav();
  const { user, refresh: refreshAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [band, setBand] = useState<Band | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addGig, setAddGig] = useState(false);
  const [report, setReport] = useState<{ type: 'band' | 'track' | 'review'; id: string; label: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [followerList, setFollowerList] = useState<{ id: string; display_name: string; avatar_url: string | null; role: string }[]>([]);
  const [playlistFor, setPlaylistFor] = useState<Track | null>(null);

  const isOwner = !!user && band?.owner_id === user.id;
  const myAdminRow = user ? members.find((m) => m.profile_id === user.id && m.is_admin) : undefined;
  const canManage = isOwner || !!myAdminRow;   // owner, or a member the owner made admin

  const load = useCallback(async () => {
    const { data: b } = await supabase.from('bands').select('*, band_genres(genre_id, genres(name))').eq('id', id).maybeSingle();
    setBand((b as unknown as Band) || null);
    if (!b) { setLoading(false); return; }
    const [m, t, p, g, c, my, f, amF, fl] = await Promise.all([
      supabase.from('band_members').select(MEMBER_COLS).eq('band_id', id).order('sort_order').order('created_at'),
      fetchTracks(id),
      supabase.from('band_photos').select('id, image_url, title, tag').eq('band_id', id).order('created_at', { ascending: false }),
      fetchUpcomingGigs(20, id),
      fetchRsvpCounts(),
      user ? fetchMyRsvps(user.id) : Promise.resolve(new Set<string>()),
      supabase.from('follows').select('band_id', { count: 'exact', head: true }).eq('band_id', id),
      user ? supabase.from('follows').select('band_id').eq('band_id', id).eq('follower_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('follows').select('follower_id, profiles!follows_follower_id_fkey(id, display_name, avatar_url, role)').eq('band_id', id).order('created_at', { ascending: false }).limit(40),
    ]);
    setMembers((m.data as any as Member[]) || []);
    setTracks(t);
    setPhotos((p.data as Photo[]) || []);
    setGigs(g); setCounts(c); setMine(my);
    setFollowers(f.count || 0);
    setFollowing(!!(amF as any).data);
    setFollowerList((((fl as any).data as any[]) || []).map((x) => x.profiles).filter(Boolean));
    setLoading(false);
  }, [id, user?.id]); // id only: a token refresh shouldn't close open editors

  useEffect(() => { setLoading(true); load(); }, [load]);

  // opened from a shared song link (#/band/<id>/song/<trackId>): scroll to that song and highlight it
  const [flashSong, setFlashSong] = useState<string | null>(null);
  useEffect(() => {
    if (loading || !song || !tracks.some((t) => t.id === song)) return;
    setFlashSong(song);
    setTimeout(() => document.getElementById(`track-${song}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    const t = setTimeout(() => setFlashSong(null), 4000);
    return () => clearTimeout(t);
  }, [loading, song, tracks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner label="Loading band page…" />;
  if (!band) {
    return (
      <div className="px-3 py-4 space-y-4">
        <button onClick={() => go({ name: 'audio' })} className={`${btn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" /> Back to Audio &amp; Bands</button>
        <EmptyState icon={Music} title="This band page isn’t available" text="It may have been removed or hidden by moderators." />
      </div>
    );
  }

  const toggleFollow = async () => {
    if (!user) return go({ name: 'auth' });
    const { error } = following
      ? await supabase.from('follows').delete().eq('band_id', id).eq('follower_id', user.id)
      : await supabase.from('follows').insert({ band_id: id, follower_id: user.id });
    if (error) return setErr(errorMessage(error));
    load();
  };

  const addPhoto = async (f: File) => {
    const bad = checkFile(f, 'image'); if (bad) return setErr(bad);
    setErr(null);
    try {
      const url = await uploadImage('band-photos', user!.id, f);
      const title = prompt('Photo caption (optional)') || null;
      const { error } = await supabase.from('band_photos').insert({ band_id: id, image_url: url, title });
      if (error) throw error;
      load();
    } catch (e) { setErr(errorMessage(e)); }
  };
  const deletePhoto = async (p: Photo) => {
    if (!confirm('Remove this photo?')) return;
    const { error } = await supabase.from('band_photos').delete().eq('id', p.id);
    if (error) return setErr(errorMessage(error));
    await removeImageByUrl(p.image_url);
    load();
  };
  const deleteGig = async (g: Gig) => {
    if (!confirm(`Delete “${g.title}”?`)) return;
    const { error } = await supabase.from('gigs').delete().eq('id', g.id);
    if (error) return setErr(errorMessage(error));
    await removeImageByUrl(g.poster_url);
    load();
  };

  const genres = genreNames(band);
  const totalPlays = tracks.reduce((s, t) => s + t.play_count, 0);

  return (
    <div className="px-3 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => go({ name: 'audio' })} className={`${btn.ghost} !py-2 !text-xs`}><ArrowLeft className="w-4 h-4" /> Audio &amp; Bands</button>
        <span className="font-mono text-[10px] text-[#8E9AA7]">{isOwner ? 'My Band Page' : canManage ? 'Band Page · Admin' : 'Band Profile'}</span>
      </div>

      {/* HERO */}
      <div className="rounded-3xl bg-[#1D232A] border border-white/[0.08] overflow-hidden">
        <CoverPhoto url={band.banner_url} crop={band.banner_crop} alt={`${band.name} cover photo`} />
        <div className="px-4 pb-4 space-y-3">
          <div className="relative z-10 flex items-end justify-between gap-3 -mt-10">
            {band.logo_url ? <span className="relative z-10 w-20"><ZoomImg src={band.logo_url} alt={`${band.name} logo`} className="w-20 h-20 rounded-xl object-cover ring-2 ring-[#53E6D4] bg-[#252D37]" /></span> : <Avatar src={null} name={band.name} size={80} square ring />}
            {canManage ? (
              <button onClick={() => setEditing(true)} className={`${btn.ghost} !py-2 !text-xs`}><Pencil className="w-3.5 h-3.5" /> Edit Profile</button>
            ) : (
              <div className="flex gap-1.5">
                <button onClick={toggleFollow} className={`${following ? btn.ghost : btn.primary} !py-2 !text-xs`}>{following ? <><UserMinus className="w-3.5 h-3.5" />Following</> : <><UserPlus className="w-3.5 h-3.5" />Follow</>}</button>
                <button onClick={() => setReport({ type: 'band', id: band.id, label: 'this band page' })} aria-label="Report band page" className={btn.icon}><Flag className="w-4 h-4" /></button>
              </div>
            )}
          </div>
          <div>
            <h1 className="flex items-center gap-2 font-heading font-bold text-2xl text-white">{band.name}{band.is_verified && <BadgeCheck className="w-5 h-5 text-[#53E6D4]" />}</h1>
            <p className="font-mono text-[11px] text-[#8E9AA7]">@{band.handle}</p>
          </div>
          {genres.length > 0 && <div className="flex flex-wrap gap-1.5">{genres.map((g) => <span key={g} className="px-2 py-0.5 rounded-full bg-[#6045F4] text-white text-[10px] font-bold">{g}</span>)}</div>}
          {band.home_base && <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#53E6D4]"><MapPin className="w-3.5 h-3.5" />{band.home_base}</p>}
          {band.bio && <p className="text-[13px] text-[#8E9AA7] leading-relaxed whitespace-pre-line">{band.bio}</p>}
          {band.influences && <p className="text-xs text-[#8E9AA7]"><strong className="text-white">Influences:</strong> {band.influences}</p>}
          {band.open_for_bookings && (band.booking_email || band.mobile || band.facebook || band.instagram || band.streaming_url) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {band.booking_email && <a href={`mailto:${band.booking_email}`} className="flex items-center gap-1.5 text-[#EBEBED]"><Mail className="w-3.5 h-3.5 text-[#53E6D4]" />{band.booking_email}</a>}
              {band.mobile && <a href={`tel:${band.mobile}`} className="flex items-center gap-1.5 text-[#EBEBED]"><Phone className="w-3.5 h-3.5 text-[#53E6D4]" />{band.mobile}</a>}
              {band.facebook && <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#53E6D4]" />{band.facebook}</span>}
              {band.instagram && <span className="flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />{band.instagram}</span>}
              {band.streaming_url && <a href={band.streaming_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[#53E6D4] underline"><Play className="w-3.5 h-3.5" />Listen elsewhere</a>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/[0.08]">
            {[['FOLLOWERS', followers], ['TOTAL PLAYS', totalPlays], ['TRACKS', tracks.length]].map(([l, v]) => (
              <div key={l as string} className="p-2.5 rounded-xl bg-[#161B20] border border-white/[0.08] text-center">
                <p className="font-heading font-bold text-lg text-[#53E6D4]">{Number(v).toLocaleString()}</p>
                <p className="text-[9px] tracking-wider text-[#8E9AA7]">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ErrorNote text={err} />
      {myAdminRow && !isOwner && (
        <p className="flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-[#53E6D4]/[0.08] border border-[#53E6D4]/35 text-[12px] text-[#EBEBED] leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-[#53E6D4] flex-shrink-0 mt-0.5" />
          <span>You’re an <strong className="text-white">admin</strong> of this band page. You can edit the profile, songs, gigs, photos and members from your own account. Posts on the band page are made from the band’s own account.</span>
        </p>
      )}

      {/* MUSIC */}
      <section className="space-y-2.5">
        <SectionHead icon={Disc3} title="Music" right={<span className="font-mono text-[11px] text-[#53E6D4]">{tracks.length} / {MAX_TRACKS}</span>} />
        {tracks.length === 0 && !canManage && <EmptyState icon={Disc3} title="No songs uploaded yet" text="Check back soon for this band’s music." />}
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            highlight={flashSong === t.id}
            track={t}
            canManage={canManage}
            onChanged={load}
            onAddToPlaylist={user ? () => setPlaylistFor(t) : undefined}
            onReport={!canManage ? () => setReport({ type: 'track', id: t.id, label: 'this song' }) : undefined}
            queue={tracks.map((x) => ({ ...x, bands: x.bands || { id: band.id, name: band.name, handle: band.handle, logo_url: band.logo_url } }))}
          />
        ))}
        {canManage && <TrackUploadForm userId={user!.id} bandId={band.id} used={tracks.length} onUploaded={load} />}
      </section>

      {/* GIGS */}
      <section className="space-y-2.5">
        <SectionHead icon={Calendar} title="Upcoming Gigs" right={canManage ? <button onClick={() => setAddGig(true)} className={`${btn.mint} !py-1.5 !px-3 !text-xs`}><Plus className="w-3.5 h-3.5" />Add Gig</button> : undefined} />
        {gigs.length === 0
          ? <EmptyState icon={Calendar} title="No upcoming gigs yet" text={canManage ? 'Add your next show so fans can RSVP.' : 'This band hasn’t posted any shows yet.'} />
          : gigs.map((g) => <GigCard key={g.id} gig={g} count={counts[g.id] || 0} going={mine.has(g.id)} onChange={load} onDelete={canManage ? () => deleteGig(g) : undefined} />)}
      </section>

      {/* POSTS */}
      <section className="space-y-2.5">
        <SectionHead icon={MessageCircle} title={isOwner ? 'Our Posts' : 'Posts'} sub={isOwner ? 'Posts you share here also appear on the Connect feed for everyone.' : undefined} />
        <ConnectFeed authorId={band.owner_id} showComposer={isOwner} />
      </section>

      {/* GALLERY */}
      <section className="space-y-2.5">
        <SectionHead icon={Camera} title="Gallery & Stage Photos" right={canManage ? (
          <FilePick accept="image/jpeg,image/png,image/webp" onPick={addPhoto} className={`${btn.mint} !py-1.5 !px-3 !text-xs`}><Plus className="w-3.5 h-3.5" />Add Photo</FilePick>
        ) : undefined} />
        {photos.length === 0
          ? <EmptyState icon={Camera} title="No photos yet" text={canManage ? 'Add live shots, rehearsals and posters.' : 'This band hasn’t added photos yet.'} />
          : (
            <div className="grid grid-cols-2 gap-2">
              {photos.map((p) => (
                <div key={p.id} className="relative rounded-2xl overflow-hidden bg-[#252D37] aspect-square">
                  <ZoomImg src={p.image_url} alt={p.title || 'Band photo'} className="w-full aspect-square object-cover" gallery={photos.map((x) => x.image_url)} index={photos.indexOf(p)} />
                  {p.title && <span className="pointer-events-none absolute left-2 bottom-2 right-2 text-[11px] font-bold text-white drop-shadow">{p.title}</span>}
                  {canManage && <button onClick={() => deletePhoto(p)} aria-label="Remove photo" className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/70 text-white flex items-center justify-center cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
            </div>
          )}
      </section>

      {/* MEMBERS */}
      {canManage ? (
        <section className="space-y-2.5">
          <SectionHead icon={Users} title="Band Members" />
          <div className="rounded-2xl bg-[#1D232A] border border-white/[0.08] p-3.5"><MembersEditor bandId={band.id} ownerId={band.owner_id} onChange={load} /></div>
        </section>
      ) : (
        <MembersSection members={members} />
      )}

      {/* FOLLOWERS */}
      <section className="space-y-2.5">
        <SectionHead icon={Users} title={`Followers (${followers})`} />
        {followerList.length === 0 ? (
          <EmptyState icon={Users} title="No followers yet" text={canManage ? 'Share your band page so fans can follow you.' : 'Be the first to follow this band.'} />
        ) : (
          <div className="grid grid-cols-4 gap-2.5">
            {followerList.map((f) => (
              <button key={f.id} onClick={() => go({ name: 'profile', id: f.id })} className="flex flex-col items-center gap-1.5 min-w-0 cursor-pointer" aria-label={`View ${f.display_name}’s profile`}>
                <Avatar src={f.avatar_url} name={f.display_name} size={52} square={roleMeta(f.role).square} />
                <span className="text-[11px] font-bold text-white max-w-full truncate">{f.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* TESTIMONIALS (need the owner's approval) */}
      <Testimonials kind="band" targetId={band.id} isOwner={canManage} onReport={(rid) => setReport({ type: 'review', id: rid, label: 'this testimonial' })} />

      {editing && <EditBandModal band={band} onClose={() => { setEditing(false); load(); }} onSaved={() => { setEditing(false); load(); refreshAuth(); }} />}
      {addGig && <AddGigModal bandId={band.id} onClose={() => setAddGig(false)} onSaved={() => { setAddGig(false); load(); }} />}
      {playlistFor && <PlaylistModal track={{ ...playlistFor, bands: { id: band.id, name: band.name, handle: band.handle, logo_url: band.logo_url } }} onClose={() => setPlaylistFor(null)} />}
      {report && <ReportModal targetType={report.type} targetId={report.id} label={report.label} onClose={() => setReport(null)} onLogin={() => go({ name: 'auth' })} />}
    </div>
  );
};

// ---------------------------------------------------------------- members
const MembersSection: React.FC<{ members: Member[] }> = ({ members }) => {
  const go = useNav();
  if (members.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <SectionHead icon={Users} title="Band Members" />
      {members.map((m) => {
        const p = m.profiles;
        const inner = (
          <>
            <Avatar src={p?.avatar_url} name={m.name} size={34} square={p ? roleMeta(p.role).square : false} />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-bold text-white truncate">{m.name}</p>
              <p className="text-[11px] text-[#8E9AA7] truncate">{[m.role, p && `@${p.username}`].filter(Boolean).join(' · ')}</p>
            </div>
          </>
        );
        return p
          ? <button key={m.id} onClick={() => go({ name: 'profile', id: p.id })} aria-label={`View ${m.name}’s profile`} className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-[#1D232A] border border-white/[0.08] cursor-pointer hover:bg-white/[0.03]">{inner}</button>
          : <div key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#1D232A] border border-white/[0.08]">{inner}</div>;
      })}
    </section>
  );
};

// ---------------------------------------------------------------- edit band
const EditBandModal: React.FC<{ band: Band; onClose: () => void; onSaved: () => void }> = ({ band, onClose, onSaved }) => {
  const { user } = useAuth();
  const [f, setF] = useState({
    name: band.name, handle: band.handle, home_base: band.home_base || '', year_formed: band.year_formed ? String(band.year_formed) : '',
    bio: band.bio || '', influences: band.influences || '', booking_email: band.booking_email || '', mobile: band.mobile || '',
    facebook: band.facebook || '', instagram: band.instagram || '', streaming_url: band.streaming_url || '',
  });
  const [logo, setLogo] = useState(band.logo_url);
  const [banner, setBanner] = useState(band.banner_url);
  const [bannerCrop, setBannerCrop] = useState<CardCrop>(cropOf(band.banner_crop));
  const [uploadingCover, setUploadingCover] = useState(false);
  const [open, setOpen] = useState(band.open_for_bookings);
  const [genres, setGenres] = useState<string[]>(genreNames(band));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const nameCheck = useNameCheck('name', f.name, { bandId: band.id, current: band.name });
  const handleCheck = useNameCheck('handle', f.handle, { bandId: band.id, current: band.handle });

  const img = (bucket: 'avatars' | 'banners', setter: (u: string) => void) => async (file: File) => {
    const bad = checkFile(file, 'image'); if (bad) return setErr(bad);
    try { setter(await uploadImage(bucket, user!.id, file)); } catch (e) { setErr(errorMessage(e)); }
  };

  const save = async () => {
    if (!f.name.trim()) return setErr('Please enter the band or artist name.');
    if (nameBlocked('name', 'artist', nameCheck.result)) return setErr('A band page with this name already exists — please choose a different name.');
    if (nameBlocked('handle', 'artist', handleCheck.result)) return setErr('That band username is already taken — please choose a different one.');
    if (f.year_formed && (Number(f.year_formed) < 1950 || Number(f.year_formed) > 2100)) return setErr('Year formed should be between 1950 and 2100.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('bands').update({
      name: f.name.trim(), handle: toHandle(f.handle), home_base: f.home_base.trim() || null, year_formed: f.year_formed ? Number(f.year_formed) : null,
      bio: f.bio.trim() || null, influences: f.influences.trim() || null, booking_email: f.booking_email.trim() || null, mobile: f.mobile.trim() || null,
      facebook: f.facebook.trim() || null, instagram: f.instagram.trim() || null, streaming_url: f.streaming_url.trim() || null,
      open_for_bookings: open, logo_url: logo, banner_url: banner, banner_crop: banner ? bannerCrop : null,
    }).eq('id', band.id);
    if (error) { setBusy(false); return setErr(errorMessage(error)); }
    try { await setBandGenres(band.id, genres); } catch (e) { setBusy(false); return setErr(errorMessage(e)); }
    // (the owner's artist profile name + picture follow automatically, also when an admin makes the change)
    // free the replaced images
    if (band.logo_url !== logo) await removeImageByUrl(band.logo_url, [logo, banner]);
    if (band.banner_url !== banner) await removeImageByUrl(band.banner_url, [logo, banner]);
    setBusy(false);
    onSaved();
  };

  return (
    <Modal
      title="Edit Band Profile"
      onClose={onClose}
      footer={<>
        <ErrorNote text={err} />
        <div className="flex gap-2">
          <button onClick={onClose} className={`${btn.ghost} flex-1`}>Cancel</button>
          <button onClick={save} disabled={busy || uploadingCover} className={`${btn.mint} flex-1`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </>}
    >
      <CoverField
        url={banner} crop={bannerCrop} onCrop={setBannerCrop} uploading={uploadingCover} logo={logo} name={f.name}
        onRemove={() => setBanner(null)}
        onPick={async (file) => {
          const bad = checkFile(file, 'image'); if (bad) return setErr(bad);
          setUploadingCover(true); setErr(null);
          try {
            const url = await uploadImage('banners', user!.id, file);
            if (banner && banner !== band.banner_url) await removeImageByUrl(banner); // an unsaved earlier pick
            setBanner(url); setBannerCrop(DEFAULT_CROP);
          } catch (e) { setErr(errorMessage(e)); }
          setUploadingCover(false);
        }}
      />
      <div className="flex items-center gap-3">
        <Avatar src={logo} name={f.name} size={64} square ring />
        <FilePick accept="image/jpeg,image/png,image/webp" onPick={img('avatars', setLogo)} className={`${btn.ghost} !py-1.5 !text-xs`}><Camera className="w-3.5 h-3.5 text-[#53E6D4]" />Change image</FilePick>
      </div>
      <Field label="Band / Artist Name" icon={Music} htmlFor="e-name"><input id="e-name" className={inputCls} value={f.name} onChange={set('name')} /></Field>
      <NameHint kind="name" role="artist" value={f.name} {...nameCheck} onPick={(x) => setF({ ...f, name: x })} />
      <Field label="Band Username" icon={Headphones} htmlFor="e-handle"><input id="e-handle" className={inputCls} value={f.handle} onChange={(e) => setF({ ...f, handle: toHandle(e.target.value) })} /></Field>
      <NameHint kind="handle" role="artist" value={f.handle} {...handleCheck} onPick={(x) => setF({ ...f, handle: toHandle(x) })} />
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Home Base" icon={MapPin} htmlFor="e-base"><input id="e-base" className={inputCls} value={f.home_base} onChange={set('home_base')} /></Field>
        <Field label="Year Formed" icon={Calendar} htmlFor="e-year"><input id="e-year" inputMode="numeric" className={inputCls} value={f.year_formed} onChange={(e) => setF({ ...f, year_formed: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></Field>
      </div>
      <Field label="About the Band" icon={Pencil} htmlFor="e-bio" hint={`${f.bio.length} / 500`}><textarea id="e-bio" rows={4} maxLength={500} className={`${inputCls} py-3 resize-none`} value={f.bio} onChange={set('bio')} /></Field>
      <Field label="Influences" htmlFor="e-infl"><input id="e-infl" className={inputCls} value={f.influences} onChange={set('influences')} /></Field>
      <Field label="Booking Email" icon={Mail} htmlFor="e-email"><input id="e-email" className={inputCls} value={f.booking_email} onChange={set('booking_email')} /></Field>
      <Field label="Mobile" icon={Phone} htmlFor="e-mobile"><input id="e-mobile" className={inputCls} value={f.mobile} onChange={set('mobile')} /></Field>
      <Field label="Facebook Page" icon={Globe} htmlFor="e-fb"><input id="e-fb" className={inputCls} value={f.facebook} onChange={set('facebook')} /></Field>
      <Field label="Instagram" icon={Camera} htmlFor="e-ig"><input id="e-ig" className={inputCls} value={f.instagram} onChange={set('instagram')} /></Field>
      <Field label="Spotify / YouTube" icon={Play} htmlFor="e-stream"><input id="e-stream" className={inputCls} value={f.streaming_url} onChange={set('streaming_url')} /></Field>
      <label className="flex items-center gap-2.5 text-[13px] text-white cursor-pointer"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="w-4 h-4 accent-[#53E6D4]" />Open for bookings (show contacts)</label>
      <div className="p-3 rounded-2xl bg-[#0F1417] border border-white/15"><GenrePicker value={genres} onChange={setGenres} /></div>
      <div className="p-3 rounded-2xl bg-[#0F1417] border border-white/15"><MembersEditor bandId={band.id} ownerId={band.owner_id} /></div>
    </Modal>
  );
};

// ---------------------------------------------------------------- add gig
const AddGigModal: React.FC<{ bandId: string; onClose: () => void; onSaved: () => void }> = ({ bandId, onClose, onSaved }) => {
  const { user } = useAuth();
  const [f, setF] = useState({ title: '', venue: '', address: '', district: '', start: '', end: '', door: '', acts: '' });
  const [poster, setPoster] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.title.trim() || !f.venue.trim() || !f.start) return setErr('Title, venue and start date/time are required.');
    if (f.end && new Date(f.end) <= new Date(f.start)) return setErr('The end time must be after the start time.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('gigs').insert({
      band_id: bandId, title: f.title.trim(), venue: f.venue.trim(), address: f.address.trim() || null, district: f.district.trim() || null,
      starts_at: new Date(f.start).toISOString(), ends_at: f.end ? new Date(f.end).toISOString() : null, door_charge: f.door.trim() || null,
      supporting_acts: f.acts.split(',').map((s) => s.trim()).filter(Boolean), poster_url: poster,
    });
    setBusy(false);
    if (error) setErr(errorMessage(error)); else onSaved();
  };

  return (
    <Modal title="Add a Gig" onClose={onClose}>
      <Field label="Gig Title" htmlFor="g-title"><input id="g-title" className={inputCls} value={f.title} onChange={set('title')} placeholder="e.g. Friday Night Live at MTS" /></Field>
      <Field label="Venue" icon={MapPin} htmlFor="g-venue"><input id="g-venue" className={inputCls} value={f.venue} onChange={set('venue')} /></Field>
      <Field label="Address" htmlFor="g-addr"><input id="g-addr" className={inputCls} value={f.address} onChange={set('address')} /></Field>
      <Field label="District" htmlFor="g-dist"><input id="g-dist" className={inputCls} value={f.district} onChange={set('district')} placeholder="e.g. Matina" /></Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Starts" icon={Calendar} htmlFor="g-start"><input id="g-start" type="datetime-local" className={inputCls} value={f.start} onChange={set('start')} /></Field>
        <Field label="Ends (optional)" htmlFor="g-end"><input id="g-end" type="datetime-local" className={inputCls} value={f.end} onChange={set('end')} /></Field>
      </div>
      <Field label="Door Charge" htmlFor="g-door"><input id="g-door" className={inputCls} value={f.door} onChange={set('door')} placeholder="e.g. ₱200 or Free" /></Field>
      <Field label="Supporting Acts" htmlFor="g-acts" hint="comma separated"><input id="g-acts" className={inputCls} value={f.acts} onChange={set('acts')} /></Field>
      <FilePick accept="image/jpeg,image/png,image/webp" onPick={async (file) => {
        const bad = checkFile(file, 'image'); if (bad) return setErr(bad);
        try { setPoster(await uploadImage('band-photos', user!.id, file)); } catch (e) { setErr(errorMessage(e)); }
      }} className={`${btn.ghost} w-full`}>
        <Camera className="w-4 h-4 text-[#53E6D4]" />{poster ? 'Poster added ✓ (tap to change)' : 'Add gig poster (optional)'}
      </FilePick>
      <ErrorNote text={err} />
      <button onClick={save} disabled={busy} className={`${btn.mint} w-full`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Add Gig'}</button>
    </Modal>
  );
};
