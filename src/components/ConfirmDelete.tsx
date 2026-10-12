import React, { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AlertTriangle, Trash2, X } from 'lucide-react';

/**
 * A second, deliberate check before anything is deleted (instead of the browser's quick OK/Cancel box).
 *   await confirmDelete({ title: 'Delete this post?' })                      → red "Delete" button
 *   await confirmDelete({ title: 'Delete this schedule?', typeToConfirm: true }) → must type DELETE first
 * Resolves true only when the person really confirms.
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  /** big, hard-to-undo deletes: the person has to type DELETE */
  typeToConfirm?: boolean;
  confirmLabel?: string;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function confirmDelete(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!host) { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); }
    const done = (ok: boolean) => { root!.render(<></>); resolve(ok); };
    root!.render(<ConfirmBox key={Math.random()} {...opts} onDone={done} />);
  });
}

const WORD = 'DELETE';

const ConfirmBox: React.FC<ConfirmOptions & { onDone: (ok: boolean) => void }> = ({ title, message, typeToConfirm, confirmLabel, onDone }) => {
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const ready = !typeToConfirm || typed.trim().toUpperCase() === WORD;
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 50);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(false); };
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(t); document.removeEventListener('keydown', esc); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4" onClick={() => onDone(false)}>
      <div role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#161B20] border border-[#FF6B7A]/40 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-2xl bg-[#FF6B7A]/15 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-[#FF8A9C]" /></span>
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="font-heading font-bold text-[16px] text-white leading-snug">{title}</h3>
            {message && <p className="text-[12.5px] text-[#C9D1D9] leading-relaxed whitespace-pre-line">{message}</p>}
          </div>
          <button onClick={() => onDone(false)} aria-label="Close" className="w-8 h-8 rounded-xl text-[#8E9AA7] hover:text-white flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {typeToConfirm && (
          <label className="block space-y-1.5">
            <span className="block text-[12px] text-[#C9D1D9]">This can’t be undone. Type <strong className="text-white tracking-wider">{WORD}</strong> to confirm.</span>
            <input ref={input} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false}
              onKeyDown={(e) => { if (e.key === 'Enter' && ready) onDone(true); }}
              placeholder={WORD} className="w-full h-11 px-3.5 rounded-xl bg-[#0F1417] border border-white/15 text-[15px] font-bold tracking-[0.2em] text-white placeholder:text-[#3F4A55] outline-none focus:border-[#FF6B7A]" />
          </label>
        )}
        <div className="flex gap-2">
          <button autoFocus={!typeToConfirm} onClick={() => onDone(false)} className="flex-1 h-11 rounded-xl bg-white/[0.06] border border-white/15 text-white font-bold text-sm cursor-pointer hover:bg-white/10">Cancel</button>
          <button onClick={() => ready && onDone(true)} disabled={!ready}
            className="flex-1 h-11 rounded-xl bg-[#E5484D] text-white font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#D13C41] disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 className="w-4 h-4" />{confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};
