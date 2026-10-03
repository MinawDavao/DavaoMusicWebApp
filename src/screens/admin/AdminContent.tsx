import React, { useEffect, useState } from 'react';
import { BadgeCheck, Download, Image as ImageIcon, Pause, Play, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  DEAL_LABELS, errorMessage, formatGigDate, peso, publicUrl, removeImageByUrl, timeAgo,
  type Band, type Gig, type Listing, type Post, type Track,
} from '../../lib/db';
import { usePlayer } from '../../context/PlayerContext';
import { useNav, type Route } from '../../nav';
import { ErrorNote, Modal, Spinner, btn } from '../../components/ui';
import {
  ActBtn, Chip, DeleteBtn, HideBtn, ListBody, OpenBtn, Owner, Row, SearchBar, Select, Thumb,
  confirmDelete, deleteRow, updateRow, usePaged,
} from './kit';

const PERSON = 'id, display_name, avatar_url, role';
const like = (s: string) => `%${s.replace(/[,()]/g, ' ').replace(/[%_\\]/g, (m) => '\\' + m)}%`;
const visibility: [string, string][] = [['all', 'All'], ['visible', 'Visible'], ['hidden', 'Hidden']];
const applyVis = (q: any, v: string) => (v === 'hidden' ? q.eq('is_hidden', true) : v === 'visible' ? q.eq('is_hidden', false) : q);

// ================================================================ POSTS
export const AdminPosts: React.FC = () => {
  const [search, setSearch] = useState('');
  const [vis, setVis] = useState('all');
  const list = usePaged<Post & { is_hidden: boolean }>(async (from, to) => {
    let q = supabase.from('posts').select(`*, profiles!posts_author_id_fkey(${PERSON})`).order('created_at', { ascending: false }).range(from, to);
    if (search) q = q.ilike('content', like(search));
    if (vis === 'images') q = q.not('image_url', 'is', null); else q = applyVis(q, vis);
    const r = await q; return { data: r.data as any, error: r.error };
  }, [search, vis]);
  const err = (m: string) => list.setErr(m);

  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Search post text">
        <Select label="Filter posts" value={vis} onChange={setVis} options={[...visibility, ['images', 'With photo']]} />
      </SearchBar>
      <ListBody loading={list.loading} err={list.err} empty="No posts found" count={list.rows.length} more={list.more} onMore={list.loadMore}>
        {list.rows.map((p) => (
          <Row key={p.id} dim={p.is_hidden}
            thumb={p.image_url ? <Thumb src={p.image_url} /> : undefined}
            title={<span className="font-normal text-[#EBEBED] whitespace-pre-line">{p.content.slice(0, 280)}{p.content.length > 280 ? '…' : ''}</span>}
            sub={<Owner p={p.profiles as any} at={p.created_at} />}
            chips={<>{p.is_hidden && <Chip tone="red">Hidden</Chip>}{p.edited_at && <Chip>Edited</Chip>}{(p as any).playlist_id && <Chip tone="purple">Playlist</Chip>}</>}
            actions={<>
              <OpenBtn to={{ name: 'post', id: p.id }} />
              <HideBtn hidden={p.is_hidden} onToggle={async () => { if (await updateRow('posts', p.id, { is_hidden: !p.is_hidden }, err)) list.setRows((r) => r.map((x) => x.id === p.id ? { ...x, is_hidden: !p.is_hidden } : x)); }} />
              <DeleteBtn onDelete={async () => { if (confirmDelete('this post') && await deleteRow('posts', p.id, err, [p.image_url])) list.setRows((r) => r.filter((x) => x.id !== p.id)); }} />
            </>}
          />
        ))}
      </ListBody>
    </div>
  );
};

// ================================================================ COMMENTS
export const AdminComments: React.FC = () => {
  const [search, setSearch] = useState('');
  const [vis, setVis] = useState('all');
  const [kind, setKind] = useState('post');
  const table = kind === 'song' ? 'track_comments' : 'comments';
  const list = usePaged<any>(async (from, to) => {
    let q = supabase.from(table)
      .select(kind === 'song'
        ? `*, profiles!track_comments_author_id_fkey(${PERSON}), tracks(title, band_id)`
        : `*, profiles!comments_author_id_fkey(${PERSON})`)
      .order('created_at', { ascending: false }).range(from, to);
    if (search) q = q.ilike('content', like(search));
    q = applyVis(q, vis);
    const r = await q; return { data: r.data as any, error: r.error };
  }, [search, vis, kind]);
  const err = (m: string) => list.setErr(m);
  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Search comment text">
        <Select label="Comment type" value={kind} onChange={setKind} options={[['post', 'Post comments'], ['song', 'Song comments']]} />
        <Select label="Filter comments" value={vis} onChange={setVis} options={visibility} />
      </SearchBar>
      <ListBody loading={list.loading} err={list.err} empty="No comments found" count={list.rows.length} more={list.more} onMore={list.loadMore}>
        {list.rows.map((c) => (
          <Row key={c.id} dim={c.is_hidden}
            title={<span className="font-normal text-[#EBEBED]">{c.content}</span>}
            sub={<>
              {kind === 'song' && c.tracks && <p className="text-[11px] text-[#8E9AA7]">on the song “{c.tracks.title}”</p>}
              <Owner p={c.profiles} at={c.created_at} />
            </>}
            chips={c.is_hidden ? <Chip tone="red">Hidden</Chip> : undefined}
            actions={<>
              {kind === 'song'
                ? c.tracks && <OpenBtn to={{ name: 'band', id: c.tracks.band_id }} label="Open band page" />
                : <OpenBtn to={{ name: 'post', id: c.post_id }} label="Open post" />}
              <HideBtn hidden={c.is_hidden} onToggle={async () => { if (await updateRow(table, c.id, { is_hidden: !c.is_hidden }, err)) list.setRows((r) => r.map((x) => x.id === c.id ? { ...x, is_hidden: !c.is_hidden } : x)); }} />
              <DeleteBtn onDelete={async () => { if (confirmDelete('this comment') && await deleteRow(table, c.id, err)) list.setRows((r) => r.filter((x) => x.id !== c.id)); }} />
            </>}
          />
        ))}
      </ListBody>
    </div>
  );
};

// ================================================================ MUSIC
export const AdminMusic: React.FC = () => {
  const { current, playing, play } = usePlayer();
  const [search, setSearch] = useState('');
  const [vis, setVis] = useState('all');
  const [sort, setSort] = useState('new');
  const list = usePaged<Track & { is_hidden: boolean; bands: any }>(async (from, to) => {
    let q = supabase.from('tracks').select(`*, bands(id, name, handle, logo_url, owner:profiles!bands_owner_id_fkey(${PERSON}))`)
      .order(sort === 'plays' ? 'play_count' : 'created_at', { ascending: false }).range(from, to);
    if (search) q = q.ilike('title', like(search));
    q = applyVis(q, vis);
    const r = await q; return { data: r.data as any, error: r.error };
  }, [search, vis, sort]);
  const err = (m: string) => list.setErr(m);

  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Search song title">
        <Select label="Filter songs" value={vis} onChange={setVis} options={visibility} />
        <Select label="Sort songs" value={sort} onChange={setSort} options={[['new', 'Newest'], ['plays', 'Most played']]} />
      </SearchBar>
      <ListBody loading={list.loading} err={list.err} empty="No songs found" count={list.rows.length} more={list.more} onMore={list.loadMore}>
        {list.rows.map((t) => {
          const on = current?.id === t.id && playing;
          return (
            <Row key={t.id} dim={t.is_hidden}
              thumb={<button onClick={() => play(t)} aria-label={on ? `Pause ${t.title}` : `Play ${t.title}`} className="w-14 h-14 rounded-xl bg-[#6045F4] text-white flex items-center justify-center cursor-pointer">{on ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}</button>}
              title={t.title}
              sub={<>
                <p className="text-[11px] text-[#8E9AA7]">{t.bands?.name || 'Unknown band'} · {t.play_count.toLocaleString()} plays · {(t.format || 'mp3').toUpperCase()} · uploaded {timeAgo(t.created_at)}</p>
                <Owner p={t.bands?.owner} />
              </>}
              chips={<>{t.is_hidden && <Chip tone="red">Hidden</Chip>}{t.allow_download && <Chip tone="mint"><Download className="w-3 h-3" />Downloadable</Chip>}</>}
              actions={<>
                {t.bands && <OpenBtn to={{ name: 'band', id: t.bands.id }} label="Band page" />}
                <HideBtn hidden={t.is_hidden} onToggle={async () => { if (await updateRow('tracks', t.id, { is_hidden: !t.is_hidden }, err)) list.setRows((r) => r.map((x) => x.id === t.id ? { ...x, is_hidden: !t.is_hidden } : x)); }} />
                <DeleteBtn onDelete={async () => {
                  if (!confirmDelete(`the song “${t.title}”`)) return;
                  if (await deleteRow('tracks', t.id, err)) {
                    await supabase.storage.from('tracks').remove([t.audio_path]);
                    list.setRows((r) => r.filter((x) => x.id !== t.id));
                  }
                }} />
              </>}
            />
          );
        })}
      </ListBody>
    </div>
  );
};

// ================================================================ BANDS
export const AdminBands: React.FC = () => {
  const [search, setSearch] = useState('');
  const [vis, setVis] = useState('all');
  const list = usePaged<Band & { owner: any; tracks: { count: number }[] }>(async (from, to) => {
    let q = supabase.from('bands').select(`*, owner:profiles!bands_owner_id_fkey(${PERSON}), tracks(count)`).order('created_at', { ascending: false }).range(from, to);
    if (search) q = q.or(`name.ilike.${like(search)},handle.ilike.${like(search)}`);
    q = applyVis(q, vis);
    const r = await q; return { data: r.data as any, error: r.error };
  }, [search, vis]);
  const err = (m: string) => list.setErr(m);
  const patch = async (b: Band, p: Partial<Band>) => { if (await updateRow('bands', b.id, p, err)) list.setRows((r) => r.map((x) => x.id === b.id ? { ...x, ...p } : x)); };

  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Search band name or @handle">
        <Select label="Filter bands" value={vis} onChange={setVis} options={visibility} />
      </SearchBar>
      <ListBody loading={list.loading} err={list.err} empty="No band pages found" count={list.rows.length} more={list.more} onMore={list.loadMore}>
        {list.rows.map((b) => (
          <Row key={b.id} dim={b.is_hidden}
            thumb={<Thumb src={b.logo_url} />}
            title={<>{b.name} <span className="font-mono text-[11px] font-normal text-[#8E9AA7]">@{b.handle}</span></>}
            sub={<>
              <p className="text-[11px] text-[#8E9AA7]">{b.home_base || 'No location'} · {b.tracks?.[0]?.count ?? 0} song(s) · created {timeAgo(b.created_at)}</p>
              <Owner p={b.owner} />
            </>}
            chips={<>{b.is_verified && <Chip tone="mint"><BadgeCheck className="w-3 h-3" />Verified</Chip>}{b.is_hidden && <Chip tone="red">Hidden</Chip>}</>}
            actions={<>
              <OpenBtn to={{ name: 'band', id: b.id }} />
              <ActBtn onClick={() => patch(b, { is_verified: !b.is_verified })}><BadgeCheck className="w-3.5 h-3.5 text-[#53E6D4]" />{b.is_verified ? 'Remove badge' : 'Verify'}</ActBtn>
              <HideBtn hidden={b.is_hidden} onToggle={() => patch(b, { is_hidden: !b.is_hidden })} />
              <DeleteBtn onDelete={async () => {
                if (!confirm(`Delete the band page “${b.name}”? Its songs, gigs and photos are deleted too. This can’t be undone.\n\nTip: “Hide” is safer if you might want it back.`)) return;
                // collect the band's files first (rows are deleted with the band)
                const [t, ph, g] = await Promise.all([
                  supabase.from('tracks').select('audio_path').eq('band_id', b.id),
                  supabase.from('band_photos').select('image_url').eq('band_id', b.id),
                  supabase.from('gigs').select('poster_url').eq('band_id', b.id),
                ]);
                if (!(await deleteRow('bands', b.id, err))) return;
                const audio = ((t.data as any[]) || []).map((x) => x.audio_path).filter(Boolean);
                if (audio.length) await supabase.storage.from('tracks').remove(audio);
                const keep = [b.owner?.avatar_url]; // the logo is often also the owner's profile photo
                for (const u of [b.logo_url, b.banner_url, ...((ph.data as any[]) || []).map((x) => x.image_url), ...((g.data as any[]) || []).map((x) => x.poster_url)]) {
                  await removeImageByUrl(u, keep);
                }
                list.setRows((r) => r.filter((x) => x.id !== b.id));
              }} />
            </>}
          />
        ))}
      </ListBody>
    </div>
  );
};

// ================================================================ GIGS
export const AdminGigs: React.FC = () => {
  const [search, setSearch] = useState('');
  const [when, setWhen] = useState('upcoming');
  const list = usePaged<Gig & { bands: any }>(async (from, to) => {
    let q = supabase.from('gigs').select(`*, bands(id, name, logo_url, owner:profiles!bands_owner_id_fkey(${PERSON}))`)
      .order('starts_at', { ascending: when === 'upcoming' }).range(from, to);
    const now = new Date().toISOString();
    q = when === 'upcoming' ? q.gte('starts_at', now) : when === 'past' ? q.lt('starts_at', now) : q;
    if (search) q = q.or(`title.ilike.${like(search)},venue.ilike.${like(search)}`);
    const r = await q; return { data: r.data as any, error: r.error };
  }, [search, when]);
  const err = (m: string) => list.setErr(m);
  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Search gig title or venue">
        <Select label="When" value={when} onChange={setWhen} options={[['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']]} />
      </SearchBar>
      <ListBody loading={list.loading} err={list.err} empty="No gigs found" count={list.rows.length} more={list.more} onMore={list.loadMore}>
        {list.rows.map((g) => (
          <Row key={g.id}
            thumb={<Thumb src={g.poster_url} />}
            title={g.title}
            sub={<>
              <p className="text-[11px] text-[#8E9AA7]">{formatGigDate(g.starts_at)} · {g.venue}{g.district ? `, ${g.district}` : ''}</p>
              <p className="text-[11px] text-[#8E9AA7]">by {g.bands?.name || 'Unknown band'}</p>
              <Owner p={g.bands?.owner} at={(g as any).created_at} />
            </>}
            chips={g.status === 'cancelled' ? <Chip tone="red">Cancelled</Chip> : undefined}
            actions={<>
              {g.bands && <OpenBtn to={{ name: 'band', id: g.bands.id }} label="Band page" />}
              <DeleteBtn onDelete={async () => { if (confirmDelete(`the gig “${g.title}”`) && await deleteRow('gigs', g.id, err, [g.poster_url])) list.setRows((r) => r.filter((x) => x.id !== g.id)); }} />
            </>}
          />
        ))}
      </ListBody>
    </div>
  );
};

// ================================================================ DEALS
export const AdminDeals: React.FC = () => {
  const [search, setSearch] = useState('');
  const [vis, setVis] = useState('all');
  const list = usePaged<Listing & { is_hidden: boolean; profiles: any; listing_photos: { image_path: string; position: number }[] }>(async (from, to) => {
    let q = supabase.from('listings').select(`*, profiles!listings_seller_id_fkey(${PERSON}), listing_photos(image_path, position)`).order('created_at', { ascending: false }).range(from, to);
    if (search) q = q.ilike('title', like(search));
    q = applyVis(q, vis);
    const r = await q; return { data: r.data as any, error: r.error };
  }, [search, vis]);
  const err = (m: string) => list.setErr(m);
  return (
    <div className="space-y-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Search deal title">
        <Select label="Filter deals" value={vis} onChange={setVis} options={visibility} />
      </SearchBar>
      <ListBody loading={list.loading} err={list.err} empty="No deals found" count={list.rows.length} more={list.more} onMore={list.loadMore}>
        {list.rows.map((d) => {
          const photos = [...(d.listing_photos || [])].sort((a, b) => a.position - b.position);
          return (
            <Row key={d.id} dim={d.is_hidden}
              thumb={<Thumb src={publicUrl('gear-photos', photos[0]?.image_path)} />}
              title={d.title}
              sub={<>
                <p className="text-[11px] text-[#8E9AA7]">{DEAL_LABELS[d.deal_type]} · {d.price != null ? peso(d.price) : 'No price'} · {photos.length} photo{photos.length === 1 ? '' : 's'}</p>
                {d.description && <p className="text-[11px] text-[#C9D1D9] line-clamp-2">{d.description}</p>}
                <Owner p={d.profiles} at={d.created_at} />
              </>}
              chips={<>{d.status !== 'active' && <Chip>{d.status}</Chip>}{d.is_hidden && <Chip tone="red">Hidden</Chip>}</>}
              actions={<>
                <OpenBtn to={{ name: 'profile', id: d.seller_id }} label="Seller" />
                <OpenBtn to={{ name: 'deals' }} label="Deals page" />
                <HideBtn hidden={d.is_hidden} onToggle={async () => { if (await updateRow('listings', d.id, { is_hidden: !d.is_hidden }, err)) list.setRows((r) => r.map((x) => x.id === d.id ? { ...x, is_hidden: !d.is_hidden } : x)); }} />
                <DeleteBtn onDelete={async () => {
                  if (!confirmDelete(`the deal “${d.title}”`)) return;
                  if (await deleteRow('listings', d.id, err)) {
                    if (photos.length) await supabase.storage.from('gear-photos').remove(photos.map((p) => p.image_path));
                    list.setRows((r) => r.filter((x) => x.id !== d.id));
                  }
                }} />
              </>}
            />
          );
        })}
      </ListBody>
    </div>
  );
};

// ================================================================ IMAGES (every uploaded photo in one grid)
type Img = {
  key: string; url: string; kind: 'Post photo' | 'Band photo' | 'Gig poster' | 'Deal photo'; at: string;
  owner: any; open: Route; remove: () => Promise<string | null>;
};

export const AdminImages: React.FC = () => {
  const [kind, setKind] = useState('all');
  const [items, setItems] = useState<Img[] | null>(null);
  const [sel, setSel] = useState<Img | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = useNav();

  const load = async () => {
    setItems(null);
    const lim = 60;
    const [p, bp, g, lp] = await Promise.all([
      supabase.from('posts').select(`id, image_url, created_at, profiles!posts_author_id_fkey(${PERSON})`).not('image_url', 'is', null).order('created_at', { ascending: false }).limit(lim),
      supabase.from('band_photos').select(`id, image_url, created_at, band_id, bands(name, owner:profiles!bands_owner_id_fkey(${PERSON}))`).order('created_at', { ascending: false }).limit(lim),
      supabase.from('gigs').select(`id, poster_url, created_at, band_id, bands(name, owner:profiles!bands_owner_id_fkey(${PERSON}))`).not('poster_url', 'is', null).order('created_at', { ascending: false }).limit(lim),
      supabase.from('listing_photos').select(`id, image_path, created_at, listings(id, seller_id, profiles!listings_seller_id_fkey(${PERSON}))`).order('created_at', { ascending: false }).limit(lim),
    ]);
    const firstErr = [p, bp, g, lp].find((r) => r.error)?.error;
    setErr(firstErr ? errorMessage(firstErr) : null);
    const all: Img[] = [
      ...((p.data as any[]) || []).map((x): Img => ({
        key: 'p' + x.id, url: x.image_url, kind: 'Post photo', at: x.created_at, owner: x.profiles, open: { name: 'post', id: x.id },
        remove: async () => { const { error } = await supabase.from('posts').update({ image_url: null }).eq('id', x.id); if (error) return errorMessage(error); await removeImageByUrl(x.image_url); return null; },
      })),
      ...((bp.data as any[]) || []).map((x): Img => ({
        key: 'b' + x.id, url: x.image_url, kind: 'Band photo', at: x.created_at, owner: x.bands?.owner, open: { name: 'band', id: x.band_id },
        remove: async () => { const { error } = await supabase.from('band_photos').delete().eq('id', x.id); if (error) return errorMessage(error); await removeImageByUrl(x.image_url); return null; },
      })),
      ...((g.data as any[]) || []).map((x): Img => ({
        key: 'g' + x.id, url: x.poster_url, kind: 'Gig poster', at: x.created_at, owner: x.bands?.owner, open: { name: 'band', id: x.band_id },
        remove: async () => { const { error } = await supabase.from('gigs').update({ poster_url: null }).eq('id', x.id); if (error) return errorMessage(error); await removeImageByUrl(x.poster_url); return null; },
      })),
      ...((lp.data as any[]) || []).map((x): Img => ({
        key: 'l' + x.id, url: publicUrl('gear-photos', x.image_path)!, kind: 'Deal photo', at: x.created_at, owner: x.listings?.profiles,
        open: x.listings ? { name: 'profile', id: x.listings.seller_id } : { name: 'deals' },
        remove: async () => { const { error } = await supabase.from('listing_photos').delete().eq('id', x.id); if (error) return errorMessage(error); await supabase.storage.from('gear-photos').remove([x.image_path]); return null; },
      })),
    ].filter((i) => i.url).sort((a, b) => b.at.localeCompare(a.at));
    setItems(all);
  };
  useEffect(() => { load(); }, []);

  const shown = (items || []).filter((i) => kind === 'all' || i.kind === kind);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[#8E9AA7]">Newest photos from posts, band pages, gig posters and deals. Tap one for details.</p>
        <Select label="Photo type" value={kind} onChange={setKind} options={[['all', 'All photos'], ['Post photo', 'Posts'], ['Band photo', 'Band photos'], ['Gig poster', 'Gig posters'], ['Deal photo', 'Deals']]} />
      </div>
      <ErrorNote text={err} />
      {items === null ? <Spinner /> : shown.length === 0 ? <p className="text-xs text-[#8E9AA7]">No photos yet.</p> : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {shown.map((i) => (
            <button key={i.key} onClick={() => setSel(i)} className="relative aspect-square rounded-lg overflow-hidden bg-[#252D37] cursor-pointer group" aria-label={`${i.kind} by ${i.owner?.display_name || 'unknown'}`}>
              <img src={i.url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:opacity-80" />
              <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[8px] font-bold text-white">{i.kind}</span>
            </button>
          ))}
        </div>
      )}
      {sel && (
        <Modal title={sel.kind} onClose={() => setSel(null)}>
          <div className="space-y-3">
            <img src={sel.url} alt="" className="w-full max-h-[55vh] object-contain rounded-xl bg-black" />
            <Owner p={sel.owner} at={sel.at} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setSel(null); go(sel.open); }} className={btn.ghost}><ImageIcon className="w-4 h-4" />Open where it’s posted</button>
              {sel.owner && <button onClick={() => { setSel(null); go({ name: 'profile', id: sel.owner.id }); }} className={btn.ghost}>Owner’s profile</button>}
              <button
                onClick={async () => {
                  if (!confirmDelete(`this ${sel.kind.toLowerCase()}`)) return;
                  const e = await sel.remove();
                  if (e) return setErr(e);
                  setItems((it) => (it || []).filter((x) => x.key !== sel.key)); setSel(null);
                }}
                className={`${btn.ghost} !text-[#FF8A9C] !border-[#FF4D6A]/35`}
              ><Trash2 className="w-4 h-4" />Delete photo</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
