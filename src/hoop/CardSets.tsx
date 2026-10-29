import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Download, FlaskConical, Gift, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { ErrorNote, FilePick, Spinner } from '../components/ui';
import { confirmDelete } from '../components/ConfirmDelete';
import { HOOP_LEAD_CLUB_ID, PERSON, gameDate, hbtn, hinput, ordinal, personOf, forgetUnlocks, type HoopMember } from './lib';
import { CARD_SET_TEMPLATE, SetCard, setNumber, type CardSetInfo } from './CardDesigns';
import type { TradingCardProps } from './TradingCard';

/**
 * SPECIAL CARD SETS (main admin only, in Hoop Method's Packs tab).
 * The main admin makes cards for one of Hoop Method's schedules (by its number): a title, how many exist (1 of 1,
 * 2 of 2 … 100 of 100) and a frame picture (see-through photo window, public/hoop-cards/card-set-template.png).
 * When that schedule's packs are opened, each card goes to a different random player who played it. Other clubs
 * get the same cards at their own schedule with the same number, after Hoop Method has opened its packs.
 */
export interface CardSetRow extends CardSetInfo { for_no: number; released_at: string | null; created_at: string }
const SET_COLS = 'id, for_no, title, total, image_url, show_title, released_at, created_at';
const GUIDE = '/hoop-cards/card-set-guide.png';

type CardLook = Omit<TradingCardProps, 'photoUrl' | 'crop' | 'onCropChange'>;

export const CardSetManager: React.FC<{ played: number; look: CardLook; onTest: (set: CardSetInfo) => void; onChanged?: () => void }> = ({ played, look, onTest, onChanged }) => {
  const { user } = useAuth();
  const [sets, setSets] = useState<CardSetRow[] | null>(null);
  const [opened, setOpened] = useState<number[]>([]);   // Hoop Method schedule numbers whose packs are open
  const [names, setNames] = useState<Record<number, string>>({});   // schedule number → title of that Hoop Method schedule
  const [no, setNo] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // the new card form
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState(1);
  const [showTitle, setShowTitle] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const load = useCallback(async () => {
    const [{ data: s, error: e1 }, { data: d }, { data: g }] = await Promise.all([
      supabase.from('hoop_card_sets').select(SET_COLS).order('for_no').order('total').order('created_at'),
      supabase.from('hoop_pack_draws').select('step').eq('club_id', HOOP_LEAD_CLUB_ID),
      supabase.from('hoop_games').select('id, title, starts_at, closed_at').eq('club_id', HOOP_LEAD_CLUB_ID).is('session_id', null).order('starts_at', { ascending: false }).limit(12),
    ]);
    if (e1) { setErr(errorMessage(e1)); setSets([]); return; }
    setSets((s as any[]) || []);
    const steps = ((d as any[]) || []).map((x) => x.step as number).filter((x) => x != null);
    setOpened(steps);
    // which Hoop Method schedule is which number (only the ones still waiting for their packs)
    const waiting = ((g as any[]) || []);
    const rows = await Promise.all(waiting.map((w) => supabase.rpc('hoop_schedule_unlocks', { p_schedule: w.id }).then(({ data }) => ({ w, no: (data as any)?.no as number | undefined }))));
    const n: Record<number, string> = {};
    rows.forEach(({ w, no: k }) => { if (k && !steps.includes(k) && !n[k]) n[k] = `${w.title || 'Schedule'} · ${gameDate(w.starts_at)}${w.closed_at ? ' · closed' : ''}`; });
    setNames(n);
  }, []);
  useEffect(() => { load(); }, [load]);

  const choices = useMemo(() => {
    const last = Math.max(0, ...opened);
    const from = last + 1, to = Math.max(played + 2, from + 1);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [opened, played]);
  useEffect(() => { if (no == null && choices.length) setNo(choices.includes(played + 1) ? played + 1 : choices[0]); }, [choices, no, played]);

  if (sets === null) return <Spinner label="Loading special cards…" />;
  const forNo = sets.filter((s) => s.for_no === no && !s.released_at);
  const given = sets.filter((s) => s.released_at).sort((a, b) => b.for_no - a.for_no);
  const winners = forNo.reduce((n, s) => n + s.total, 0);

  const pickFile = (f: File) => {
    setErr(null);
    if (!/^image\/(png|webp)$/.test(f.type)) return setErr('Use a PNG or WebP picture with a see-through photo area (start from the template).');
    if (f.size > 8 * 1024 * 1024) return setErr('That picture is too big (max 8 MB).');
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f));
  };
  const reset = () => { setTitle(''); setTotal(1); setShowTitle(true); setFile(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); };
  const add = async () => {
    if (!user || no == null || busy) return;
    const t = title.trim();
    if (!t) return setErr('Give the card a title.');
    if (!file) return setErr('Upload the card picture.');
    const n = Math.round(total);
    if (!(n >= 1 && n <= 100)) return setErr('How many: 1 to 100.');
    setBusy(true); setErr(null);
    try {
      const url = await uploadImage('avatars', user.id, file);
      const { error } = await supabase.from('hoop_card_sets').insert({ for_no: no, title: t, total: n, image_url: url, show_title: showTitle });
      if (error) throw error;
      reset(); forgetUnlocks(HOOP_LEAD_CLUB_ID); await load(); onChanged?.();
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };
  const remove = async (s: CardSetRow) => {
    if (!(await confirmDelete({ title: `Remove “${s.title}”?`, message: `It won’t be given out at schedule #${s.for_no}.`, confirmLabel: 'Remove' }))) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('hoop_card_sets').delete().eq('id', s.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    await load(); onChanged?.();
  };
  const draft: CardSetInfo | null = preview ? { id: 'draft', title: title.trim() || 'Card title', image_url: preview, show_title: showTitle, total: Math.max(1, Math.min(100, Math.round(total) || 1)) } : null;

  return (
    <section className="rounded-2xl p-3 space-y-3 border border-[#F6C94C]/45" style={{ background: 'linear-gradient(160deg, rgba(246,201,76,0.10), rgba(20,20,20,0.6) 60%)' }}>
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[#F6C94C]"><Crown className="w-4 h-4" />SPECIAL CARDS · ONLY YOU SEE THIS</p>
        <p className="text-[12px] text-[#D6D3D1] leading-snug">Make the cards for a schedule: 1 of 1, 2 of 2, 10 of 10… When its packs are opened, each card goes to a <strong className="text-white">different random player</strong> who played. Other clubs get the same cards at their own schedule with the same number, after Hoop Method’s packs are opened.</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-black tracking-wider text-[#A8A29E]">FOR HOOP METHOD’S…</p>
        <div className="flex gap-1.5 flex-wrap">
          {choices.map((k) => (
            <button key={k} onClick={() => setNo(k)} aria-pressed={no === k}
              className={`h-8 px-3 rounded-full text-[12px] font-bold border cursor-pointer ${no === k ? 'bg-[#F6C94C] border-[#F6C94C] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>
              {ordinal(k)} schedule{k === played + 1 ? ' (next)' : ''}
            </button>
          ))}
        </div>
        {no != null && names[no] && <p className="text-[11px] text-[#A8A29E]">That’s {names[no]}.</p>}
      </div>

      {no != null && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold text-white">{forNo.length === 0 ? `No special cards for the ${ordinal(no)} schedule yet — players just get normal packs.` : `${forNo.length} card${forNo.length === 1 ? '' : 's'} for the ${ordinal(no)} schedule · up to ${winners} winner${winners === 1 ? '' : 's'}`}</p>
          {forNo.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-2 rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="w-16 flex-shrink-0 pointer-events-none"><SetCard {...look} set={s} serial={1} glow={false} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white truncate">{s.title}</p>
                <p className="text-[11px] text-[#A8A29E]">{s.total === 1 ? '1 of 1 · 1 winner' : `${s.total} of ${s.total} · ${s.total} winners`}</p>
              </div>
              <button onClick={() => onTest(s)} className={`${hbtn.ghost} !py-1.5 !px-2.5 !text-xs`}><FlaskConical className="w-4 h-4" />Test</button>
              <button onClick={() => remove(s)} disabled={busy} aria-label={`Remove ${s.title}`} className={`${hbtn.ghost} !py-1.5 !px-2`}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}

          {/* add a card */}
          <div className="p-3 rounded-xl border border-dashed border-[#F6C94C]/50 space-y-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[#F6C94C]"><Plus className="w-4 h-4" />ADD A CARD FOR THE {ordinal(no).toUpperCase()} SCHEDULE</p>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-[#D6D3D1]">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 40))} placeholder="e.g. MVP Gold" className={hinput} maxLength={40} />
            </label>
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-[#D6D3D1]">How many exist (= how many players win it)</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[1, 2, 3, 5, 10].map((k) => (
                  <button key={k} onClick={() => setTotal(k)} aria-pressed={total === k}
                    className={`h-8 px-3 rounded-full text-[12px] font-bold border cursor-pointer ${total === k ? 'bg-[var(--hp)] border-[var(--hp)] text-[#111]' : 'bg-[#151515] border-white/15 text-[#E7E5E4]'}`}>{k}-{k}</button>
                ))}
                <input type="number" min={1} max={100} value={total} onChange={(e) => setTotal(Number(e.target.value))} aria-label="How many" className={`${hinput} !w-20 !py-1.5`} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-[#D6D3D1] cursor-pointer">
              <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} className="w-4 h-4 accent-[#F6C94C]" />
              Write the title on the top plate for me <span className="text-[#78716C]">(untick if your picture already has it)</span>
            </label>
            <div className="flex gap-2 flex-wrap text-[11px]">
              <a href={CARD_SET_TEMPLATE} download="card-template.png" className="inline-flex items-center gap-1 font-bold text-[#F6C94C] underline underline-offset-2"><Download className="w-3.5 h-3.5" />Blank template</a>
              <a href={GUIDE} download="card-template-guide.png" className="inline-flex items-center gap-1 font-bold text-[#F6C94C] underline underline-offset-2"><Download className="w-3.5 h-3.5" />Where everything goes</a>
            </div>
            <p className="text-[11px] text-[#A8A29E]">PNG or WebP, 1100×1540 (5:7), same layout as the template. Keep the photo window see-through — the winner’s photo shows there.</p>
            <FilePick accept="image/png,image/webp" disabled={busy} onPick={pickFile} className={`${hbtn.ghost} w-full cursor-pointer`}><Upload className="w-4 h-4" />{file ? 'Change picture' : 'Upload card picture'}</FilePick>
            {draft && (
              <div className="flex gap-3 items-start">
                <div className="w-[42%] flex-shrink-0 pointer-events-none"><SetCard {...look} set={draft} serial={1} /></div>
                <div className="flex-1 space-y-2">
                  <p className="text-[11px] text-[#A8A29E]">Preview with your own photo. Check the photo fits the window and the title, number and name sit on the plates.</p>
                  <button onClick={() => onTest(draft)} className={`${hbtn.ghost} w-full !text-xs`}><FlaskConical className="w-4 h-4" />Test in a pack</button>
                </div>
              </div>
            )}
            <button onClick={add} disabled={busy || !file || !title.trim()} className={`${hbtn.primary} w-full`}>
              <Sparkles className="w-4 h-4" />{busy ? 'Saving…' : `Save card for the ${ordinal(no)} schedule`}
            </button>
          </div>
        </div>
      )}

      {given.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-1">
          <p className="text-[10px] font-black tracking-wider text-[#A8A29E]">ALREADY GIVEN OUT</p>
          {given.slice(0, 8).map((s) => (
            <p key={s.id} className="flex items-center justify-between gap-2 text-[12px] text-[#D6D3D1]">
              <span className="truncate">{ordinal(s.for_no)} schedule · {s.title}</span>
              <span className="font-bold text-white whitespace-nowrap">{s.total === 1 ? '1 of 1' : `${s.total} of ${s.total}`}</span>
            </p>
          ))}
        </div>
      )}
      <ErrorNote text={err} />
    </section>
  );
};

// ===================================================================== club owner: open a closed schedule's packs (random)
interface AdminPack { id: string; status: string; schedule_id: string; member_id: string; game?: { title: string; starts_at: string; closed_at?: string | null } | null }
interface Draw { schedule_id: string; winner_member_id: string | null; drawn_at: string; step: number | null }
interface Gives { no: number; packs: boolean; chosen: boolean; one: boolean; lead: boolean; lead_done: boolean; sets: { title: string; total: number }[] }
interface Won { schedule_id: string; serial: number; total: number; series: string; member?: (HoopMember & { profiles?: any }) | null; set?: { title: string } | null }
const GAME = 'game:hoop_games!hoop_packs_schedule_id_fkey(title, starts_at, closed_at)';

export const PackDraw: React.FC<{ clubId: string; onDone: () => void; refreshKey?: number }> = ({ clubId, onDone, refreshKey = 0 }) => {
  const [packs, setPacks] = useState<AdminPack[] | null>(null);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [won, setWon] = useState<Won[]>([]);
  const [gives, setGives] = useState<Record<string, Gives>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: d }] = await Promise.all([
      supabase.from('hoop_packs').select(`id, status, schedule_id, member_id, ${GAME}`).eq('club_id', clubId),
      supabase.from('hoop_pack_draws').select('schedule_id, winner_member_id, drawn_at, step').eq('club_id', clubId).order('drawn_at', { ascending: false }),
    ]);
    setPacks((p as any[]) || []);
    const ds = (d as any[]) || [];
    setDraws(ds);
    // who won what in the last few (the main admin sees them all; a club owner sees cards once they're found)
    const ids = ds.slice(0, 5).map((x) => x.schedule_id);
    if (ids.length) {
      const { data: w } = await supabase.from('hoop_numbered_cards').select(`schedule_id, serial, total, series, member:hoop_members!hoop_numbered_cards_member_id_fkey(id, name, photo_url, profiles!hoop_members_profile_id_fkey(${PERSON})), set:hoop_card_sets(title)`).in('schedule_id', ids);
      setWon((w as any[]) || []);
    } else setWon([]);
  }, [clubId]);
  useEffect(() => { load(); }, [load]);

  const schedules = useMemo(() => {
    const by = new Map<string, AdminPack[]>();
    (packs || []).forEach((p) => by.set(p.schedule_id, [...(by.get(p.schedule_id) || []), p]));
    return [...by.entries()].map(([id, list]) => ({ id, list, game: list[0]?.game, draw: draws.find((d) => d.schedule_id === id) || null }))
      .sort((a, b) => (b.game?.starts_at || '').localeCompare(a.game?.starts_at || ''));
  }, [packs, draws]);
  const open = schedules.filter((s) => !s.draw && !!s.game?.closed_at);   // reopened schedules wait until they're closed again
  const openKey = open.map((s) => s.id).join(',');
  useEffect(() => {
    if (!openKey) return;
    let live = true;
    Promise.all(openKey.split(',').map((id) => supabase.rpc('hoop_schedule_unlocks', { p_schedule: id }).then(({ data }) => [id, data] as const)))
      .then((rows) => { if (live) setGives(Object.fromEntries(rows.filter(([, d]) => d).map(([id, d]) => [id, d as any]))); });
    return () => { live = false; };
  }, [openKey, refreshKey]);
  if (packs === null) return null;
  const done = schedules.filter((s) => s.draw).slice(0, 5);

  const list = (g?: Gives) => !g ? [] : [
    ...(g.one ? ['the 1-of-1 (1 player)'] : []),
    ...(g.chosen ? ['Chosen cards (up to 10 players)'] : []),
    ...g.sets.map((x) => `${x.title} — ${x.total === 1 ? '1 of 1' : `${x.total} of ${x.total}`}`),
  ];
  const draw = async (id: string, title: string) => {
    const g = gives[id];
    const items = list(g);
    const wait = g && !g.lead && !g.lead_done;
    const msg = items.length
      ? `Every pack for “${title}” opens now. Random players get: ${items.join('; ')}. One special card per player. This can’t be changed.`
      : `Every pack for “${title}” opens now. ${wait ? 'Hoop Method hasn’t opened its packs for this schedule number yet, so its new special cards won’t be in these packs.' : 'There are no special cards for this schedule — just normal cards.'} This can’t be changed.`;
    if (!(await confirmDelete({ title: 'Open the packs?', message: msg, confirmLabel: 'Open packs' }))) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('hoop_draw_pack_winner', { p_schedule: id, p_member: null });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    forgetUnlocks(clubId);
    await load(); onDone();
  };

  return (
    <section className="rounded-2xl p-3 space-y-3 border border-[#F6C94C]/45" style={{ background: 'linear-gradient(160deg, rgba(246,201,76,0.10), rgba(20,20,20,0.6) 60%)' }}>
      <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[#F6C94C]"><Gift className="w-4 h-4" />OPEN PACKS · ONLY THE CLUB OWNER SEES THIS</p>
      {open.length === 0 ? (
        <p className="text-[12px] text-[#A8A29E]">No sealed packs right now. When a schedule is closed, open its packs here — special cards go to random players.</p>
      ) : open.map((s) => {
        const g = gives[s.id];
        const items = list(g);
        const wait = g && !g.lead && !g.lead_done;
        return (
          <div key={s.id} className="space-y-2">
            <p className="text-[13px] font-bold text-white">{s.game?.title || 'Schedule'} <span className="font-normal text-[#A8A29E]">· {s.game ? gameDate(s.game.starts_at) : ''} · {g ? `${ordinal(g.no)} schedule · ` : ''}{s.list.length} packs sealed</span></p>
            <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-1">
              <p className="text-[10px] font-black tracking-wider text-[#A8A29E]">SPECIAL CARDS IN THESE PACKS</p>
              {!g ? <p className="text-[12px] text-[#A8A29E]">Checking…</p>
                : items.length ? items.map((t, i) => <p key={i} className="flex items-center gap-1.5 text-[12px] text-white"><Crown className="w-3.5 h-3.5 text-[#F6C94C] flex-shrink-0" />{t}</p>)
                : <p className="text-[12px] text-[#A8A29E]">None — just normal cards.</p>}
              {wait && <p className="text-[11px] text-[#FBBF24] leading-snug">Hoop Method hasn’t opened its packs for its {ordinal(g!.no)} schedule yet. Wait for it to get its new special cards in these packs, or open now without them.</p>}
            </div>
            <button onClick={() => draw(s.id, s.game?.title || 'this schedule')} disabled={busy} className={`${hbtn.primary} w-full !py-2.5`}>
              <Sparkles className="w-4 h-4" />{busy ? 'Opening packs…' : items.length ? 'Open packs · random winners' : 'Open packs'}
            </button>
          </div>
        );
      })}
      {done.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-1.5">
          <p className="text-[10px] font-black tracking-wider text-[#A8A29E]">OPENED</p>
          {done.map((s) => {
            const w = won.filter((x) => x.schedule_id === s.id).sort((a, b) => (a.set?.title || '').localeCompare(b.set?.title || '') || a.serial - b.serial);
            return (
              <div key={s.id} className="space-y-0.5">
                <p className="text-[12px] text-[#D6D3D1] truncate">{s.game?.title || 'Schedule'} · {s.game ? gameDate(s.game.starts_at) : ''}</p>
                {w.length === 0 && !s.draw!.winner_member_id && <p className="text-[11px] text-[#78716C] pl-2">No special cards found yet.</p>}
                {s.draw!.winner_member_id && <p className="text-[11px] text-white pl-2 flex items-center gap-1"><Crown className="w-3 h-3 text-[#F6C94C]" />1-of-1</p>}
                {w.map((x, i) => (
                  <p key={i} className="text-[11px] text-white pl-2 flex items-center gap-1 min-w-0">
                    <Crown className="w-3 h-3 text-[#F6C94C] flex-shrink-0" />
                    <span className="truncate">{x.set?.title || 'Chosen'} {x.set ? setNumber(x.serial, x.total) : `${x.serial}/10`} · <strong>{x.member ? personOf(x.member as any).display_name : 'Player'}</strong></span>
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <ErrorNote text={err} />
    </section>
  );
};
