import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown, Gift, Hourglass, PenLine, Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { Avatar, ErrorNote, Spinner } from '../components/ui';
import { confirmDelete } from '../components/ConfirmDelete';
import { H, HOOP_MAIN_ADMIN_ID, MEMBER_COLS, PERSON, fetchStats, gameDate, hbtn, ordinal, personOf, unlockedNow, useClub, useClubUnlocks, type HoopMember, type HoopStats } from './lib';
import { DESIGNS, announceSigned, levelFor, useMemberSchedules } from './ClubCard';
import { OneOfOneCard, SelectedCard } from './CardDesigns';
import { SignCard } from './SignCard';
import { CardBack, TiltCard } from './CardDesigns';

/**
 * CARD PACKS (the club's 3rd tab).
 * After a schedule is closed, everyone who played gets a pack of 5 face-down cards. Packs stay sealed until the
 * MAIN ADMIN picks that schedule's 1-of-1 winner (only they see the picker). Then every pack opens: 5 random card
 * designs with the player's own face, and the winner finds the rare 1-of-1 hidden at a random spot.
 */
interface Pack { id: string; status: 'waiting' | 'ready' | 'opened'; schedule_id: string; member_id: string; created_at: string; game?: { title: string; starts_at: string } | null }
const GAME = 'game:hoop_games!hoop_packs_schedule_id_fkey(title, starts_at, closed_at)';

export const HoopPacks: React.FC = () => {
  const { user } = useAuth();
  const { club, me, isOwner } = useClub();
  const unlocks = useClubUnlocks(club);
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [stats, setStats] = useState<HoopStats | null>(null);
  const [opening, setOpening] = useState<Pack | null>(null);
  const [testing, setTesting] = useState(false);   // TEST pack (main admin only) — remove after testing
  const isMain = user?.id === HOOP_MAIN_ADMIN_ID;

  const load = useCallback(async () => {
    if (!me) { setPacks([]); return; }
    const [{ data }, st] = await Promise.all([
      supabase.from('hoop_packs').select(`id, status, schedule_id, member_id, created_at, ${GAME}`).eq('member_id', me.id).order('created_at', { ascending: false }),
      fetchStats([me.id]),
    ]);
    setPacks((data as any[]) || []);
    setStats(st[me.id] || null);
  }, [me?.id]);
  useEffect(() => { load(); }, [load]);

  if (!club) return null;
  if (!unlocks) return <Spinner label="Loading packs…" />;
  if (unlocks.packs_from == null) return (   // card packs start once Hoop Method has given them out
    <div className="px-3 py-6">
      <div className="p-5 rounded-2xl border border-white/10 text-center space-y-2" style={{ background: H.surface }}>
        <Gift className="w-8 h-8 mx-auto text-[var(--hp)]" />
        <p className="font-hoop italic font-black text-[20px] uppercase text-white">Card packs coming soon</p>
        <p className="text-[12px] text-[#A8A29E]">Card packs and the rare 1-of-1 card are on their way to {club.name}.</p>
      </div>
    </div>
  );
  const packsLeft = unlocks.lead ? 0 : Math.max(0, unlocks.packs_from - unlocks.played);
  const chosenLeft = unlocks.lead || unlocks.chosen_from == null ? null : Math.max(0, unlocks.chosen_from - unlocks.played);
  return (
    <div className="px-3 py-4 space-y-5">
      <div className="space-y-1">
        <h1 className="font-hoop italic font-black text-[30px] uppercase text-white leading-none flex items-center gap-2"><Gift className="w-7 h-7 text-[var(--hp)]" />Card packs</h1>
        <p className="text-[12px] text-[#A8A29E]">Play a schedule, get a pack of 5 cards. Flip them one by one — one lucky player each schedule finds the rare <strong className="text-[#F6C94C]">1-of-1</strong> card.</p>
      </div>

      {/* clubs follow Hoop Method: what's coming, by schedule number */}
      {!unlocks.lead && (packsLeft > 0 || (chosenLeft != null && chosenLeft > 0)) && (
        <div className="p-3 rounded-2xl border border-[#F6C94C]/35 space-y-1" style={{ background: H.surface }}>
          <p className="text-[11px] font-black tracking-wider text-[#F6C94C]">COMING TO {club.name.toUpperCase()}</p>
          {packsLeft > 0 && <p className="text-[12px] text-[#D6D3D1]">Card packs + the rare 1-of-1 start at your <strong className="text-white">{ordinal(unlocks.packs_from)} schedule</strong> — {packsLeft} more to go.</p>}
          {chosenLeft != null && chosenLeft > 0 && <p className="text-[12px] text-[#D6D3D1]"><strong className="text-[#F6C94C]">Chosen</strong> cards (only 10 ever) go out from your <strong className="text-white">{ordinal(unlocks.chosen_from!)} schedule</strong> — {chosenLeft} more to go.</p>}
        </div>
      )}

      {(isMain || isOwner) && <WinnerPicker clubId={club.id} onDone={load} />}

      {/* TEST — main admin only: try the pack opening with a made-up pack (nothing saved). Remove after testing. */}
      {isMain && me && (
        <button onClick={() => setTesting(true)} className={`${hbtn.ghost} w-full !border-dashed !border-[#F6C94C]/60`}>
          <Sparkles className="w-4 h-4 text-[#F6C94C]" />Test pack opening <span className="text-[10px] font-normal text-[#A8A29E]">(only you · nothing saved)</span>
        </button>
      )}
      {testing && me && <PackOpener demo pack={{ id: 'test', status: 'ready', schedule_id: 'test', member_id: me.id, created_at: '', game: { title: 'Test pack', starts_at: '' } }} me={me} stats={stats} onClose={() => setTesting(false)} />}

      {packs === null ? <Spinner label="Loading packs…" />
        : !me || me.status !== 'active' ? (
          <p className="p-4 rounded-2xl border border-white/10 text-[13px] text-[#A8A29E] text-center" style={{ background: H.surface }}>Join the club to start collecting card packs.</p>
        ) : packs.length === 0 ? (
          <div className="p-5 rounded-2xl border border-white/10 text-center space-y-2" style={{ background: H.surface }}>
            <Gift className="w-8 h-8 mx-auto text-[var(--hp)]" />
            <p className="font-hoop italic font-black text-[20px] uppercase text-white">No packs yet</p>
            <p className="text-[12px] text-[#A8A29E]">Play in a schedule. When it’s closed, your card pack shows up here.</p>
          </div>
        ) : (
          <section className="space-y-2.5">
            <h2 className="font-hoop italic font-black text-[22px] uppercase text-white">My packs</h2>
            {packs.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl border border-white/10" style={{ background: p.status === 'ready' ? 'linear-gradient(110deg, color-mix(in srgb, var(--hp) 18%, #141414), #141414 75%)' : H.surface, borderColor: p.status === 'ready' ? 'color-mix(in srgb, var(--hp) 55%, transparent)' : undefined }}>
                <div className="w-12 flex-shrink-0 pointer-events-none"><CardBack club={club} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-white truncate">{p.game?.title || 'Schedule'}</p>
                  <p className="text-[11px] text-[#A8A29E]">{p.game ? gameDate(p.game.starts_at) : ''} · 5 cards</p>
                </div>
                {p.status === 'waiting' ? (
                  <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.06] text-[11px] font-bold text-[#D6D3D1] whitespace-nowrap"><Hourglass className="w-3.5 h-3.5" />Sealed</span>
                ) : p.status === 'ready' ? (
                  <button onClick={() => setOpening(p)} className={`${hbtn.primary} !py-2 !px-3.5 !text-xs whitespace-nowrap`}><Sparkles className="w-4 h-4" />Open pack</button>
                ) : (
                  <button onClick={() => setOpening(p)} className={`${hbtn.ghost} !py-2 !px-3 !text-xs whitespace-nowrap`}>View cards</button>
                )}
              </div>
            ))}
            {packs.some((p) => p.status === 'waiting') && <p className="text-[11px] text-[#78716C]">Sealed packs are being prepared — they open soon after the schedule is closed.</p>}
          </section>
        )}

      {opening && me && <PackOpener pack={opening} me={me} stats={stats} onClose={() => { setOpening(null); load(); }} />}
    </div>
  );
};

// ===================================================================== MAIN ADMIN: pick the 1-of-1 winner
interface AdminPack { id: string; status: string; schedule_id: string; member_id: string; game?: { title: string; starts_at: string; closed_at?: string | null } | null; member?: (HoopMember & { profiles?: any }) | null }
interface Draw { schedule_id: string; winner_member_id: string | null; drawn_at: string }

const WinnerPicker: React.FC<{ clubId: string; onDone: () => void }> = ({ clubId, onDone }) => {
  const [packs, setPacks] = useState<AdminPack[] | null>(null);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const { club: wc } = useClub();
  const unlocks = useClubUnlocks(wc);
  const chosenNow = unlockedNow(unlocks?.chosen_from, unlocks);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: d }] = await Promise.all([
      supabase.from('hoop_packs').select(`id, status, schedule_id, member_id, ${GAME}, member:hoop_members!hoop_packs_member_id_fkey(id, name, photo_url, profiles!hoop_members_profile_id_fkey(${PERSON}))`).eq('club_id', clubId),
      supabase.from('hoop_pack_draws').select('schedule_id, winner_member_id, drawn_at').eq('club_id', clubId).order('drawn_at', { ascending: false }),
    ]);
    setPacks((p as any[]) || []);
    setDraws((d as any[]) || []);
  }, [clubId]);
  useEffect(() => { load(); }, [load]);

  const schedules = useMemo(() => {
    const by = new Map<string, AdminPack[]>();
    (packs || []).forEach((p) => by.set(p.schedule_id, [...(by.get(p.schedule_id) || []), p]));
    return [...by.entries()].map(([id, list]) => ({ id, list, game: list[0]?.game, draw: draws.find((d) => d.schedule_id === id) || null }))
      .sort((a, b) => (b.game?.starts_at || '').localeCompare(a.game?.starts_at || ''));
  }, [packs, draws]);
  const lastWinner = draws.find((d) => d.winner_member_id)?.winner_member_id || null;   // skips schedules opened without a 1-of-1
  const nameOf = (p?: AdminPack) => (p?.member ? personOf(p.member as any).display_name : 'Player');

  if (packs === null) return null;
  const open = schedules.filter((s) => !s.draw && !!s.game?.closed_at);   // reopened schedules wait until they're closed again
  const done = schedules.filter((s) => s.draw).slice(0, 5);

  const draw = async (scheduleId: string, title: string, noOne = false) => {
    const winner = noOne ? null : pick[scheduleId]; if (!noOne && !winner) return;
    if (noOne) {
      if (!(await confirmDelete({ title: 'Open the packs without a 1-of-1?', message: `Every pack for “${title}” opens now. Nobody gets the 1-of-1 this time${chosenNow ? ' — Chosen cards still go to up to 10 random players' : ''}. This can’t be changed.`, confirmLabel: 'Open packs' }))) return;
    } else {
      const who = nameOf(packs.find((p) => p.member_id === winner));
      if (!(await confirmDelete({ title: `Give the 1-of-1 to ${who}?`, message: `Every pack for “${title}” opens now, and ${who} finds the 1-of-1 hidden in theirs. This can’t be changed.`, confirmLabel: 'Yes, pick them' }))) return;
    }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('hoop_draw_pack_winner', { p_schedule: scheduleId, p_member: winner });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    await load(); onDone();
  };

  return (
    <section className="rounded-2xl p-3 space-y-3 border border-[#F6C94C]/45" style={{ background: 'linear-gradient(160deg, rgba(246,201,76,0.10), rgba(20,20,20,0.6) 60%)' }}>
      <p className="flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[#F6C94C]"><Crown className="w-4 h-4" />1-OF-1 DRAW · ONLY THE CLUB OWNER SEES THIS</p>
      {open.length === 0 ? (
        <p className="text-[12px] text-[#A8A29E]">No sealed packs right now. When a schedule is closed, pick its lucky winner here — every pack opens once you do.</p>
      ) : open.map((s) => (
        <div key={s.id} className="space-y-2">
          <p className="text-[13px] font-bold text-white">{s.game?.title || 'Schedule'} <span className="font-normal text-[#A8A29E]">· {s.game ? gameDate(s.game.starts_at) : ''} · {s.list.length} packs sealed</span></p>
          <div className="grid grid-cols-2 gap-1.5">
            {s.list.map((p) => {
              const banned = p.member_id === lastWinner;
              const on = pick[s.id] === p.member_id;
              const person = p.member ? personOf(p.member as any) : null;
              return (
                <button key={p.id} disabled={banned || busy} onClick={() => setPick({ ...pick, [s.id]: p.member_id })}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-left ${banned ? 'opacity-45 cursor-not-allowed border-white/10' : on ? 'border-[#F6C94C] bg-[#F6C94C]/15 cursor-pointer' : 'border-white/10 bg-white/[0.03] hover:border-white/30 cursor-pointer'}`}>
                  {person && <Avatar src={person.avatar_url} name={person.display_name} size={28} />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-bold text-white truncate">{person?.display_name || 'Player'}</span>
                    {banned && <span className="block text-[10px] text-[#A8A29E]">Won last time</span>}
                  </span>
                  {on && <Check className="w-4 h-4 text-[#F6C94C] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          <button onClick={() => draw(s.id, s.game?.title || 'this schedule')} disabled={!pick[s.id] || busy} className={`${hbtn.primary} w-full !py-2.5`}>
            <Crown className="w-4 h-4" />{busy ? 'Opening packs…' : pick[s.id] ? `Give the 1-of-1 to ${nameOf(s.list.find((p) => p.member_id === pick[s.id]))}` : 'Pick the lucky winner'}
          </button>
          <button onClick={() => draw(s.id, s.game?.title || 'this schedule', true)} disabled={busy} className={`${hbtn.ghost} w-full !py-2 !text-xs`}>
            No 1-of-1 this time — just open the packs{chosenNow ? ' (Chosen cards still go out)' : ''}
          </button>
        </div>
      ))}
      {done.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-1">
          <p className="text-[10px] font-black tracking-wider text-[#A8A29E]">PAST WINNERS</p>
          {done.map((s) => {
            const wp = s.draw!.winner_member_id ? s.list.find((p) => p.member_id === s.draw!.winner_member_id) : undefined;
            return (
              <p key={s.id} className="flex items-center justify-between gap-2 text-[12px] text-[#D6D3D1]">
                <span className="truncate">{s.game?.title || 'Schedule'} · {s.game ? gameDate(s.game.starts_at) : ''}</span>
                <span className="flex items-center gap-1 font-bold text-white whitespace-nowrap"><Crown className="w-3.5 h-3.5 text-[#F6C94C]" />{s.draw!.winner_member_id ? nameOf(wp) : 'No 1-of-1'}{wp && <span className="font-normal text-[#A8A29E]">{wp.status === 'opened' ? '· found it' : '· not opened yet'}</span>}</span>
              </p>
            );
          })}
        </div>
      )}
      <ErrorNote text={err} />
    </section>
  );
};

// ===================================================================== opening a pack: 5 face-down cards, flip one by one
/** demo = the main admin's TEST pack: made up on this phone, nothing is saved (remove with the test button). */
const PackOpener: React.FC<{ pack: Pack; me: HoopMember; stats: HoopStats | null; onClose: () => void; demo?: boolean }> = ({ pack, me, stats, onClose, demo = false }) => {
  const go = useNav();
  const { club, reload } = useClub();
  const [res, setRes] = useState<{ cards: string[]; one_slot: number | null; one_id: string | null; sel_slot?: number | null; sel_id?: string | null; sel_serial?: number | null; sel_total?: number | null } | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false, false, false]);
  const [big, setBig] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [using, setUsing] = useState(false);
  const [fresh, setFresh] = useState<boolean[]>([false, false, false, false, false]);   // flipped just now → play the reveal effects
  const [sig, setSig] = useState<string | null>(null);   // the 1-of-1's signature
  const [signing, setSigning] = useState<false | 'one' | 'sel'>(false);
  const [selSig, setSelSig] = useState<string | null>(null);   // the Selected card's signature
  const person = personOf(me);
  const lvl = useMemberSchedules(me.id);

  useEffect(() => {
    if (demo) {
      if (!lvl.ready) return;
      // like real packs: other players of the club, each in the card design they've earned
      let live = true;
      (async () => {
        const { data: ms } = await supabase.from('hoop_members').select('id').eq('club_id', me.club_id).eq('status', 'active').neq('id', me.id);
        const ids = ((ms as any[]) || []).map((x) => x.id as string).sort(() => Math.random() - 0.5).slice(0, 5);
        const { data: sc } = ids.length ? await supabase.from('hoop_member_schedules').select('member_id, schedules').in('member_id', ids) : { data: [] as any[] };
        const n = (id: string) => ((sc as any[]) || []).find((x) => x.member_id === id)?.schedules ?? 0;
        const pool = ids.length ? ids.map((id) => `${levelFor(n(id)).key}:${id}`) : [`${lvl.level.key}:${me.id}`];
        const cards = Array.from({ length: 5 }, (_, i) => pool[i] ?? pool[Math.floor(Math.random() * pool.length)]);
        const slot = 1 + Math.floor(Math.random() * 5); cards[slot - 1] = 'oneofone';
        // the test pack also shows a numbered Selected card (when the club has that design)
        const selSlot = club?.selected_url ? [1, 2, 3, 4, 5].filter((x) => x !== slot)[Math.floor(Math.random() * 4)] : null;
        if (selSlot) cards[selSlot - 1] = 'selected';
        if (live) setRes({ cards, one_slot: slot, one_id: null, sel_slot: selSlot, sel_id: null, sel_serial: selSlot ? 1 + Math.floor(Math.random() * 10) : null, sel_total: 10 });
      })();
      return () => { live = false; };
    }
    supabase.rpc('hoop_open_pack', { p_pack: pack.id }).then(({ data, error }) => {
      if (error) return setErr(errorMessage(error));
      setRes(data as any);
      if (pack.status === 'opened') setFlipped([true, true, true, true, true]);   // already opened before: show them all
    });
  }, [pack.id, demo && lvl.ready]);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const won = !!res?.one_slot && flipped[res.one_slot - 1];
  const wonSel = !!res?.sel_slot && flipped[res.sel_slot - 1];
  const all = flipped.every(Boolean);
  const zoomTimer = useRef<number | null>(null);
  useEffect(() => () => { if (zoomTimer.current) window.clearTimeout(zoomTimer.current); }, []);
  const flipOne = (i: number, zoom = false) => {
    setFlipped((f) => f.map((v, j) => (j === i ? true : v)));
    setFresh((f) => f.map((v, j) => (j === i ? true : v)));
    // after the flip lands, show the card full screen (tap to send it back)
    if (zoom) {
      if (zoomTimer.current) window.clearTimeout(zoomTimer.current);   // two quick taps → only the last one zooms
      zoomTimer.current = window.setTimeout(() => { zoomTimer.current = null; setBig(i); }, 820);
    }
  };
  const flip = (i: number) => { if (big !== null) return; if (!flipped[i]) flipOne(i, true); else setBig(i); };
  const flipTimers = useRef<number[]>([]);
  useEffect(() => () => flipTimers.current.forEach((t) => window.clearTimeout(t)), []);
  const flipAll = () => {
    if (zoomTimer.current) { window.clearTimeout(zoomTimer.current); zoomTimer.current = null; }   // don't pop a card over the rest
    flipped.forEach((f, i) => { if (!f) flipTimers.current.push(window.setTimeout(() => flipOne(i), 260 * i)); });
  };
  useEffect(() => {   // Escape closes the full-screen card (keyboard / computer)
    if (big === null) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [big]);
  const useIt = async (kind: 'one' | 'sel' = 'one') => {
    const id = kind === 'sel' ? res?.sel_id : res?.one_id;
    if (!id) return;
    setUsing(true); setErr(null);
    const { error } = await supabase.from('hoop_members').update({ card_choice: `${kind}:${id}` }).eq('id', me.id);
    setUsing(false);
    if (error) return setErr(errorMessage(error));
    reload(); onClose();
    if (club) go({ name: 'hoopClub', club: club.id, tab: 'me' });
  };

  const cardProps = { person, card: me, stats, club: club ? { name: club.name, logo_url: club.logo_url, oneofone_url: club.oneofone_url, selected_url: club.selected_url } : null };
  // each card is another player ('<design>:<member id>'); load those players' cards + stats
  const [others, setOthers] = useState<Record<string, { m: HoopMember; s: HoopStats | null }>>({});
  const [othersDone, setOthersDone] = useState(false);
  useEffect(() => {
    const ids = [...new Set(((res?.cards || []) as string[]).filter((k) => k.includes(':')).map((k) => k.split(':')[1]))];
    if (!ids.length) return;
    let live = true;
    Promise.all([supabase.from('hoop_members').select(MEMBER_COLS).in('id', ids), fetchStats(ids)]).then(([{ data }, st]) => {
      if (!live) return;
      const o: Record<string, { m: HoopMember; s: HoopStats | null }> = {};
      ((data as any[]) || []).forEach((m) => { o[m.id] = { m, s: st[m.id] || null }; });
      setOthers(o); setOthersDone(true);
    }, () => { if (live) setOthersDone(true); });
    return () => { live = false; };
  }, [res]);
  const face = (i: number) => {
    const key = res!.cards[i];
    if (key === 'oneofone') return <OneOfOneCard {...cardProps} signature={sig} />;
    if (key === 'selected') return <SelectedCard {...cardProps} serial={res!.sel_serial} total={res!.sel_total ?? 10} signature={selSig} />;
    const [design, id] = key.split(':');
    const Comp = DESIGNS[design] || DESIGNS.glow;
    if (!id) return <Comp {...cardProps} />;   // an old pack: the opener's own card
    const o = others[id];
    if (!o) return othersDone
      // that player left the club since: show their card design without a name
      ? <Comp person={{ id, display_name: 'Former player', username: '', avatar_url: null } as any} card={{ jersey_number: null, position: null } as any} stats={null} club={cardProps.club} />
      : <div className="w-full aspect-[5/7] rounded-[5cqw] bg-white/[0.06] animate-pulse" />;
    return <Comp person={personOf(o.m)} card={o.m} stats={o.s} club={cardProps.club} />;
  };
  useEffect(() => {   // a pack opened before: show the signature the winner already put on it
    if (!res?.one_id || demo) return;
    supabase.from('hoop_one_of_ones').select('signature_url').eq('id', res.one_id).maybeSingle().then(({ data }) => setSig((data as any)?.signature_url ?? null));
  }, [res?.one_id]);
  useEffect(() => {   // … and on a Selected card
    if (!res?.sel_id || demo) return;
    supabase.from('hoop_numbered_cards').select('signature_url').eq('id', res.sel_id).maybeSingle().then(({ data }) => setSelSig((data as any)?.signature_url ?? null));
  }, [res?.sel_id]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" style={{ background: 'radial-gradient(120% 80% at 50% 20%, #1B1630 0%, #07060C 70%)' }}>
      <div className="max-w-[480px] mx-auto px-4 py-5 space-y-4 min-h-full">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.3em] text-[var(--hp)]">{demo ? 'TEST CARD PACK · ONLY YOU' : 'CARD PACK'}</p>
            <p className="font-hoop italic font-black text-[24px] uppercase text-white leading-none">{pack.game?.title || 'Schedule'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {err ? <ErrorNote text={err} /> : !res ? <Spinner label="Opening your pack…" /> : (
          <>
            <p className="text-center text-[13px] text-[#D6D3D1]">{all ? (res.one_slot ? 'You pulled the 1-of-1!' : res.sel_slot ? `You pulled a Chosen card — ${res.sel_serial} of ${res.sel_total ?? 10}!` : 'All 5 cards revealed. Tap a card to see it big.') : `Tap a card to flip it · ${flipped.filter(Boolean).length} of 5`}</p>
            <div className="flex flex-wrap justify-center gap-3" style={{ perspective: '1100px' }}>
              {res.cards.map((key, i) => {
                const isOne = key === 'oneofone';
                const isSel = key === 'selected';
                const shown = flipped[i];
                const justNow = fresh[i];
                return (
                  <div key={i} className={`pack-card relative w-[30%] ${shown ? '' : 'is-idle'}`} style={{ animationDelay: `${i * 0.12}s` }}>
                    <TiltCard>
                      <button onClick={() => flip(i)} aria-label={shown ? `Card ${i + 1}: ${isOne ? '1 of 1' : isSel ? `Chosen ${res.sel_serial} of 10` : 'player card'} — tap to see it big` : `Flip card ${i + 1}`}
                        className={`relative block w-full cursor-pointer ${justNow ? 'pack-lift' : ''}`}>
                        <div className={`pack-flipper relative w-full ${shown ? 'is-flipped' : ''}`}>
                          <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                            <CardBack club={club ? { name: club.name, logo_url: club.logo_url } : null} />
                          </div>
                          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                            <div className={`pointer-events-none ${(isOne || isSel) && shown ? 'pack-winner' : ''}`}>{face(i)}</div>
                            {/* light sweeping across the card as it lands */}
                            {justNow && (
                              <span className="absolute inset-0 overflow-hidden pointer-events-none rounded-[6%]">
                                <span className="pack-shine absolute top-0 bottom-0" style={{ left: 0, width: '45%', background: `linear-gradient(90deg, transparent, rgba(255,255,255,${isOne || isSel ? 0.75 : 0.5}) 50%, transparent)` }} />
                              </span>
                            )}
                          </div>
                        </div>
                        {/* glow burst on reveal (gold + sparks for the 1-of-1) */}
                        {justNow && <span className="pack-burst absolute inset-[-25%] rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${isOne ? 'rgba(255,214,110,0.9)' : isSel ? 'rgba(90,160,255,0.85)' : 'rgba(255,255,255,0.45)'} 0%, transparent 62%)` }} />}
                        {justNow && (isOne || isSel) && Array.from({ length: 16 }, (_, k) => {
                          const a = (Math.PI * 2 * k) / 16, d = 70 + (k % 3) * 28;
                          return <span key={k} className="pack-spark absolute left-1/2 top-1/2 w-2 h-2 -ml-1 -mt-1 rounded-full pointer-events-none"
                            style={{ background: k % 2 ? (isSel ? '#8EC5FF' : '#FFE38A') : '#FFFFFF', boxShadow: isSel ? '0 0 8px #4A9BFF' : '0 0 8px #FFC94A', ['--dx' as any]: `${Math.cos(a) * d}px`, ['--dy' as any]: `${Math.sin(a) * d}px` }} />;
                        })}
                        {isSel && shown && <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-black text-white whitespace-nowrap z-10" style={{ background: 'linear-gradient(180deg,#4FA3FF,#1D4FB8)', boxShadow: '0 0 12px rgba(80,160,255,0.8)' }}>{res.sel_serial}/10</span>}
                        {isOne && shown && <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-black text-[#1A1205] whitespace-nowrap z-10" style={{ background: 'linear-gradient(180deg,#FFE98A,#F5A623)', boxShadow: '0 0 12px rgba(255,200,80,0.8)' }}>1 OF 1</span>}
                      </button>
                    </TiltCard>
                  </div>
                );
              })}
            </div>

            {wonSel && (
              <div className="p-4 rounded-2xl text-center space-y-2 border border-[#5AA2FF]/60" style={{ background: 'linear-gradient(160deg, rgba(60,130,255,0.25), rgba(246,201,76,0.12))', boxShadow: '0 0 40px rgba(80,150,255,0.25)' }}>
                <Crown className="w-9 h-9 mx-auto text-[#8EC5FF]" />
                <p className="font-hoop italic font-black text-[26px] uppercase text-white leading-none">You’re Chosen! {res.sel_serial}/{res.sel_total ?? 10}</p>
                <p className="text-[12px] text-[#E7E5E4]">Only 10 Chosen cards will ever exist — you got number {res.sel_serial}. It’s in your card list on My Card.</p>
                {(demo || res.sel_id) && (
                  <button onClick={() => setSigning('sel')} className={`${hbtn.primary} w-full`}><PenLine className="w-4 h-4" />{selSig ? 'Re-sign your Chosen card' : 'Sign your Chosen card now'}</button>
                )}
                {demo && <p className="text-[11px] text-[#8EC5FF]">Test pack — nothing was saved.</p>}
                {!demo && res.sel_id && <button onClick={() => useIt('sel')} disabled={using} className={`${hbtn.ghost} w-full`}><Crown className="w-4 h-4" />{using ? 'Saving…' : 'Use it on My Card'}</button>}
              </div>
            )}
            {won && (
              <div className="p-4 rounded-2xl text-center space-y-2 border border-[#F6C94C]/60" style={{ background: 'linear-gradient(160deg, rgba(246,201,76,0.22), rgba(224,74,46,0.12))', boxShadow: '0 0 40px rgba(246,201,76,0.25)' }}>
                <Crown className="w-9 h-9 mx-auto text-[#F6C94C]" />
                <p className="font-hoop italic font-black text-[26px] uppercase text-white leading-none">You got the 1-of-1!</p>
                <p className="text-[12px] text-[#E7E5E4]">Only one player gets this card each schedule — it’s yours now and it’s in your card list on My Card.</p>
                {(demo || res.one_id) && (
                  <button onClick={() => setSigning('one')} className={`${hbtn.primary} w-full`}><PenLine className="w-4 h-4" />{sig ? 'Re-sign your 1-1 card' : 'Sign your 1-1 card now'}</button>
                )}
                {demo && <p className="text-[11px] text-[#F6C94C]">Test pack — nothing was saved.</p>}
                {!demo && res.one_id && <button onClick={() => useIt('one')} disabled={using} className={`${hbtn.ghost} w-full`}><Crown className="w-4 h-4" />{using ? 'Saving…' : 'Use it on My Card'}</button>}
              </div>
            )}
            {all && !res.one_slot && !res.sel_slot && <p className="text-center text-[12px] text-[#A8A29E]">No 1-of-1 this time. Play the next schedule for another pack!</p>}
            {all && <button onClick={onClose} className={`${hbtn.ghost} w-full`}>Done</button>}
            {!all && <button onClick={flipAll} className="w-full text-center text-[12px] font-bold text-[#A8A29E] hover:text-white cursor-pointer py-1">Flip all</button>}
          </>
        )}
      </div>

      {signing === 'one' && res && <SignCard {...cardProps} oneId={res.one_id} current={sig} demo={demo} onClose={() => setSigning(false)}
        onSaved={(url) => { setSig(url); if (res.one_id && !demo) announceSigned(res.one_id, url); }} />}
      {signing === 'sel' && res && <SignCard {...cardProps} kind="sel" serial={res.sel_serial} oneId={res.sel_id ?? null} current={selSig} demo={demo} onClose={() => setSigning(false)}
        onSaved={(url) => { setSelSig(url); if (res.sel_id && !demo) announceSigned(res.sel_id, url); }} />}
      {big !== null && res && (
        <div role="dialog" aria-modal="true" aria-label="Your card — tap to go back" onClick={() => setBig(null)}
          className="pack-fade-in fixed inset-0 z-[80] flex flex-col items-center justify-center p-5 cursor-pointer"
          style={{ background: res.cards[big] === 'oneofone' ? 'radial-gradient(80% 60% at 50% 45%, rgba(120,84,10,0.85) 0%, rgba(5,4,8,0.96) 70%)' : res.cards[big] === 'selected' ? 'radial-gradient(80% 60% at 50% 45%, rgba(130,90,15,0.85) 0%, rgba(5,4,8,0.96) 70%)' : 'radial-gradient(80% 60% at 50% 45%, rgba(40,36,70,0.9) 0%, rgba(5,4,8,0.96) 70%)' }}>
          {res.cards[big] === 'selected' && (
            <p className="pack-fade-in mb-3 font-hoop italic font-black text-[28px] uppercase text-[#F6C94C] leading-none" style={{ textShadow: '0 0 18px rgba(255,200,80,0.7)' }}>Chosen {res.sel_serial}/10!</p>
          )}
          {res.cards[big] === 'oneofone' && (
            <p className="pack-fade-in mb-3 font-hoop italic font-black text-[28px] uppercase text-[#F6C94C] leading-none" style={{ textShadow: '0 0 18px rgba(255,200,80,0.7)' }}>1 of 1!</p>
          )}
          <div className="relative w-full max-w-[min(360px,calc((100dvh-150px)*0.714))]" style={{ perspective: '1100px' }}>
            <div key={big} className="pack-zoom-in">
              <TiltCard>{face(big)}</TiltCard>
            </div>
            {(res.cards[big] === 'oneofone' || res.cards[big] === 'selected') && Array.from({ length: 22 }, (_, k) => {
              const a = (Math.PI * 2 * k) / 22, d = 140 + (k % 4) * 40;
              return <span key={k} className="pack-spark absolute left-1/2 top-1/2 w-2.5 h-2.5 -ml-1 -mt-1 rounded-full pointer-events-none"
                style={{ background: k % 2 ? '#FFE38A' : '#FFFFFF', boxShadow: '0 0 10px #FFC94A', ['--dx' as any]: `${Math.cos(a) * d}px`, ['--dy' as any]: `${Math.sin(a) * d}px` }} />;
            })}
          </div>
          <button autoFocus onClick={() => setBig(null)} className="mt-4 text-[12px] font-bold text-white/70 cursor-pointer">Tap anywhere to go back</button>
        </div>
      )}
    </div>
  );
};

/** True when I have an unopened (ready) pack in this club — for the dot on the Packs tab. */
export function usePackDot(memberId?: string | null, refreshKey?: string): boolean {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!memberId) { setN(0); return; }
    let live = true;
    supabase.from('hoop_packs').select('id', { count: 'exact', head: true }).eq('member_id', memberId).eq('status', 'ready')
      .then(({ count }) => { if (live) setN(count || 0); });
    return () => { live = false; };
  }, [memberId, refreshKey]);
  return n > 0;
}


