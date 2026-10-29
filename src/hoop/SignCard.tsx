import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, PenLine, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage, removeImageByUrl, uploadImage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { ErrorNote } from '../components/ui';
import { OneOfOneCard, SEL_ZONE, SIG_ZONE, SelectedCard, TenCard } from './CardDesigns';
import { hbtn } from './lib';
import type { TradingCardProps } from './TradingCard';

const INKS = [
  { key: 'gold', label: 'Gold', color: '#F6C94C' },
  { key: 'white', label: 'White', color: '#FFFFFF' },
  { key: 'black', label: 'Black', color: '#111111' },
  { key: 'blue', label: 'Blue', color: '#2F6BFF' },
];
// the canvas is drawn big (12 px per card unit) so the signature stays sharp in saved pictures

/**
 * "Sign your 1-1 card": the winner signs right on their card with a finger or mouse.
 * Saves a transparent PNG (their own upload) to hoop_one_of_ones.signature_url.
 */
export const SignCard: React.FC<{ oneId: string | null; current?: string | null; demo?: boolean; onSaved: (url: string | null) => void; onClose: () => void;
  /** 'sel' = a numbered Selected card (oneId is then its id in hoop_numbered_cards) */
  kind?: 'one' | 'sel'; serial?: number | null; design?: string | null; frame?: string | null; series?: string | null }
  & Omit<TradingCardProps, 'photoUrl' | 'crop' | 'onCropChange'>> = ({ oneId, current, demo = false, onSaved, onClose, kind = 'one', serial, design, frame, series, ...card }) => {
  const ten = kind === 'sel' && series === 'ten';
  const ZONE = kind === 'sel' && !ten ? SEL_ZONE : SIG_ZONE;
  const W = ZONE.w * 12, H = ZONE.h * 12;
  const { user } = useAuth();
  const canvas = useRef<HTMLCanvasElement>(null);
  const pts = useRef<{ x: number; y: number; t: number }[]>([]);
  const drawing = useRef(false);
  const [ink, setInk] = useState(INKS[0]);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const ctx = () => canvas.current!.getContext('2d')!;
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, t: performance.now() };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true; pts.current = [pos(e)];
    const c = ctx(), p = pts.current[0];
    c.fillStyle = ink.color; c.beginPath(); c.arc(p.x, p.y, 4.5, 0, Math.PI * 2); c.fill();
    setEmpty(false);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e), list = pts.current, a = list[list.length - 1];
    if (Math.hypot(p.x - a.x, p.y - a.y) < 1.5) return;
    list.push(p);
    if (list.length < 3) return;
    // smooth curve through midpoints; faster strokes are thinner, like a real pen
    const [p0, p1, p2] = list.slice(-3);
    const speed = Math.hypot(p2.x - p1.x, p2.y - p1.y) / Math.max(1, p2.t - p1.t);
    const c = ctx();
    c.strokeStyle = ink.color; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = Math.max(4, Math.min(10, 10.5 - speed * 2.4));
    c.beginPath();
    c.moveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    c.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
    c.stroke();
  };
  const up = () => { drawing.current = false; pts.current = []; };
  const clear = () => { ctx().clearRect(0, 0, W, H); setEmpty(true); };

  const save = async () => {
    if (empty) return;
    setBusy(true); setErr(null);
    try {
      const blob = await new Promise<Blob | null>((res) => canvas.current!.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Could not save the signature. Please try again.');
      if (demo) { onSaved(canvas.current!.toDataURL('image/png')); onClose(); return; }   // TEST pack: show it, save nothing
      if (!oneId || !user) throw new Error(kind === 'sel' ? 'This Chosen card can’t be signed right now.' : 'This 1-of-1 card can’t be signed right now.');
      const url = await uploadImage('avatars', user.id, new File([blob], 'signature.png', { type: 'image/png' }));
      const { error } = await supabase.from(kind === 'sel' ? 'hoop_numbered_cards' : 'hoop_one_of_ones').update({ signature_url: url }).eq('id', oneId);
      if (error) { removeImageByUrl(url); throw error; }
      if (current) removeImageByUrl(current);
      onSaved(url); onClose();
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto" style={{ background: 'radial-gradient(120% 80% at 50% 20%, #241C0C 0%, #07060C 70%)' }}>
      <div className="max-w-[440px] mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.3em] text-[#F6C94C]">{demo ? 'TEST · NOTHING SAVED' : ten ? `YOUR 10-10 · ${serial ?? ''}-10` : kind === 'sel' ? `YOUR CHOSEN ${serial ?? ''}/10` : 'YOUR 1-OF-1'}</p>
            <p className="font-hoop italic font-black text-[24px] uppercase text-white leading-none flex items-center gap-2"><PenLine className="w-6 h-6 text-[#F6C94C]" />Sign your card</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[12px] text-[#D6D3D1]">Sign inside the dotted box with your finger (or mouse on a computer). Your autograph shows on your {ten ? '10-10' : kind === 'sel' ? 'Chosen' : '1-of-1'} card.</p>

        {/* the card with the signing box exactly where the signature will sit */}
        <div className="relative mx-auto w-full max-w-[340px]">
          {ten ? <TenCard {...card} serial={serial} signature={null} glow={false} /> : kind === 'sel' ? <SelectedCard {...card} serial={serial} signature={null} glow={false} /> : <OneOfOneCard {...card} design={design} frame={frame} signature={null} glow={false} />}
          <div className="absolute rounded-lg" style={{
            left: `${ZONE.x}%`, top: `${(ZONE.y / 140) * 100}%`, width: `${ZONE.w}%`, height: `${(ZONE.h / 140) * 100}%`,
            outline: '2px dashed rgba(246,201,76,0.85)', background: 'rgba(0,0,0,0.18)',
          }}>
            <canvas ref={canvas} width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
              aria-label="Signature pad" className="w-full h-full touch-none cursor-crosshair" style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.6))' }} />
            {empty && <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[13px] font-bold text-white/80">Sign here</span>}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          {INKS.map((k) => (
            <button key={k.key} onClick={() => setInk(k)} aria-pressed={ink.key === k.key} aria-label={`${k.label} ink`}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-bold border cursor-pointer ${ink.key === k.key ? 'border-[#F6C94C] bg-[#F6C94C]/15 text-white' : 'border-white/15 bg-white/[0.04] text-[#D6D3D1]'}`}>
              <span className="w-3.5 h-3.5 rounded-full border border-white/40" style={{ background: k.color }} />{k.label}
            </button>
          ))}
        </div>
        <ErrorNote text={err} />
        <div className="flex gap-2">
          <button onClick={clear} disabled={empty || busy} className={`${hbtn.ghost} flex-1`}><Eraser className="w-4 h-4" />Clear</button>
          <button onClick={save} disabled={empty || busy} className={`${hbtn.primary} flex-[2]`}><Check className="w-4 h-4" />{busy ? 'Saving…' : 'Save my signature'}</button>
        </div>
      </div>
    </div>
  );
};
