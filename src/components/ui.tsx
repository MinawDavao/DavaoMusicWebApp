import React from 'react';
import { Loader2, X } from 'lucide-react';
import { initials } from '../lib/db';

export const Avatar: React.FC<{ src?: string | null; name?: string | null; size?: number; square?: boolean; ring?: boolean }> = ({
  src, name, size = 40, square = false, ring = false,
}) => {
  const radius = square ? 'rounded-xl' : 'rounded-full';
  const ringCls = ring ? 'ring-2 ring-[#53E6D4]' : 'border border-white/15';
  if (src) {
    return <img src={src} alt={name || ''} style={{ width: size, height: size }} className={`${radius} ${ringCls} object-cover flex-shrink-0 bg-[#252D37]`} />;
  }
  return (
    <div
      aria-label={name || ''}
      style={{ width: size, height: size, fontSize: Math.max(10, size / 3) }}
      className={`${radius} ${ringCls} flex-shrink-0 bg-[#252D37] text-[#8E9AA7] font-heading font-bold flex items-center justify-center`}
    >
      {initials(name)}
    </div>
  );
};

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#8E9AA7]">
    <Loader2 className="w-4 h-4 animate-spin text-[#53E6D4]" />
    {label && <span>{label}</span>}
  </div>
);

export const EmptyState: React.FC<{ icon: React.ElementType; title: string; text?: string; action?: React.ReactNode }> = ({
  icon: Icon, title, text, action,
}) => (
  <div className="flex flex-col items-center text-center gap-2 px-5 py-8 rounded-2xl border border-dashed border-white/15 bg-[#161B20]">
    <div className="w-11 h-11 rounded-2xl bg-[#6045F4]/15 text-[#A78BFA] flex items-center justify-center">
      <Icon className="w-5 h-5" />
    </div>
    <p className="font-heading font-bold text-white text-sm">{title}</p>
    {text && <p className="text-xs text-[#8E9AA7] max-w-xs leading-relaxed">{text}</p>}
    {action && <div className="pt-1">{action}</div>}
  </div>
);

export const SectionHead: React.FC<{ icon: React.ElementType; title: string; right?: React.ReactNode; sub?: string }> = ({
  icon: Icon, title, right, sub,
}) => (
  <div className="space-y-1 px-1">
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-heading font-bold uppercase tracking-wider text-[#53E6D4]">
        <Icon className="w-4 h-4" />
        <span>{title}</span>
      </h2>
      {right}
    </div>
    {sub && <p className="text-[11px] text-[#8E9AA7]">{sub}</p>}
  </div>
);

/** Colour themes for page sections, so each one is easy to spot while scrolling. */
export const TONES = {
  music:     { c: '#8B7BFF', name: 'violet' },
  gigs:      { c: '#FFB800', name: 'amber' },
  posts:     { c: '#53E6D4', name: 'mint' },
  gallery:   { c: '#FF6B9A', name: 'pink' },
  members:   { c: '#4FA3FF', name: 'blue' },
  followers: { c: '#FF8A5B', name: 'orange' },
  following: { c: '#C17BFF', name: 'purple' },
  reviews:   { c: '#FFD24D', name: 'gold' },
  playlists: { c: '#8FE36B', name: 'lime' },
  bands:     { c: '#6C8CFF', name: 'indigo' },
  tagged:    { c: '#2FD3A0', name: 'green' },
  blocked:   { c: '#FF6B7A', name: 'red' },
  band:      { c: '#B7A8FF', name: 'lavender' },
} as const;
export type Tone = keyof typeof TONES;

/** A tinted section card with a coloured header strip. */
export const Panel: React.FC<{
  tone: Tone; icon: React.ElementType; title: string; right?: React.ReactNode; sub?: string; children?: React.ReactNode; id?: string; className?: string;
}> = ({ tone, icon: Icon, title, right, sub, children, id, className = '' }) => {
  const c = TONES[tone].c;
  return (
    <section id={id} data-tone={tone} className={`relative rounded-3xl border overflow-hidden ${className}`}
      style={{ background: `linear-gradient(165deg, ${c}26 0%, ${c}0d 38%, #14191e 100%)`, borderColor: `${c}4d` }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${c}, ${c}55 60%, transparent)` }} />
      <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl" style={{ background: `${c}22` }} />
      <div className="relative p-3.5 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 text-sm font-heading font-bold uppercase tracking-wider" style={{ color: c }}>
              <span className="w-8 h-8 rounded-xl flex items-center justify-center border" style={{ background: `${c}24`, borderColor: `${c}55` }}><Icon className="w-4 h-4" /></span>
              <span>{title}</span>
            </h2>
            {right}
          </div>
          {sub && <p className="text-[11px] text-[#A3AEB9] pl-[42px]">{sub}</p>}
        </div>
        {children}
      </div>
    </section>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl bg-[#1D232A] border border-white/[0.08] p-4 ${className}`}>{children}</div>
);

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#6045F4] hover:bg-[#7A62FF] text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  mint:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#53E6D4] hover:bg-[#76EFE0] text-[#0F1417] text-sm font-bold transition-colors cursor-pointer disabled:bg-[#252D37] disabled:text-[#8E9AA7] disabled:cursor-not-allowed',
  ghost:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[#EBEBED] text-sm font-bold transition-colors cursor-pointer disabled:opacity-50',
  icon:
    'inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#161B20] hover:bg-white/10 border border-white/15 text-[#8E9AA7] hover:text-white transition-colors cursor-pointer',
};

export const inputCls =
  'w-full min-h-[46px] px-3.5 rounded-xl bg-[#0F1417] border border-white/15 focus:border-[#53E6D4] outline-none text-[#EBEBED] text-sm placeholder:text-[#5f6b78]';

export const Field: React.FC<{ label: string; icon?: React.ElementType; hint?: string; htmlFor?: string; children: React.ReactNode }> = ({
  label, icon: Icon, hint, htmlFor, children,
}) => (
  <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[13px] font-bold text-white">
      {Icon && <Icon className="w-3.5 h-3.5 text-[#53E6D4]" />}
      <span>{label}</span>
      {hint && <span className="ml-auto text-[10px] font-medium text-[#8E9AA7]">{hint}</span>}
    </label>
    {children}
  </div>
);

export const ErrorNote: React.FC<{ text?: string | null }> = ({ text }) =>
  text ? <p role="alert" className="text-xs text-[#FF8A7A] bg-[#FF8A7A]/10 border border-[#FF8A7A]/30 rounded-xl px-3 py-2">{text}</p> : null;

export const OkNote: React.FC<{ text?: string | null }> = ({ text }) =>
  text ? <p role="status" className="text-xs text-[#53E6D4] bg-[#53E6D4]/10 border border-[#53E6D4]/30 rounded-xl px-3 py-2">{text}</p> : null;

/** Pop-up sheet. `footer` (e.g. Save / Cancel) stays pinned at the bottom so it’s always in reach without scrolling. */
export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({ title, onClose, children, footer }) => (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#161B20] border border-white/15 p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading font-bold text-lg text-white">{title}</h3>
        <button onClick={onClose} aria-label="Close" className={btn.icon}><X className="w-4 h-4" /></button>
      </div>
      {children}
      {footer && (
        <div className="sticky -bottom-5 z-20 -mx-5 -mb-5 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-[#161B20]/95 backdrop-blur border-t border-white/10 space-y-2">
          {footer}
        </div>
      )}
    </div>
  </div>
);

/** Hidden file input wrapped in a styled button. */
export const FilePick: React.FC<{
  accept: string; onPick: (f: File) => void; children: React.ReactNode; className?: string; disabled?: boolean; multiple?: boolean; onPickMany?: (f: File[]) => void;
}> = ({ accept, onPick, children, className = btn.ghost, disabled, multiple, onPickMany }) => (
  <label className={`${className} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
    {children}
    <input
      type="file"
      accept={accept}
      multiple={multiple}
      className="sr-only"
      disabled={disabled}
      onChange={(e) => {
        const files = Array.from(e.target.files || []);
        if (multiple && onPickMany) onPickMany(files);
        else if (files[0]) onPick(files[0]);
        e.target.value = '';
      }}
    />
  </label>
);
