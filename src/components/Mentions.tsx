import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNav } from '../nav';
import { Avatar } from './ui';
import { roleMeta, type Role } from '../lib/db';

// ---------------------------------------------------------------- username lookup (cached)
type Who = { id: string; username: string; display_name: string; role: Role };
const cache = new Map<string, Who | null>();
let pending: Set<string> = new Set();
let waiters: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function resolve(usernames: string[]): Promise<void> {
  const need = usernames.filter((u) => !cache.has(u));
  if (!need.length) return Promise.resolve();
  need.forEach((u) => pending.add(u));
  return new Promise((done) => {
    waiters.push(done);
    if (timer) return;
    timer = setTimeout(async () => {
      const batch = [...pending]; pending = new Set(); timer = null;
      const ws = waiters; waiters = [];
      const { data, error } = await supabase.from('profiles').select('id, username, display_name, role').in('username', batch);
      // Only remember "no such user" when the lookup worked; a network blip shouldn't grey out tags for the whole visit.
      if (!error) batch.forEach((u) => cache.set(u, null));
      ((data as Who[]) || []).forEach((w) => cache.set(w.username, w));
      ws.forEach((w) => w());
    }, 30);
  });
}

const MENTION_RE = /(^|[^a-z0-9_@])@([a-z0-9_]{3,30})/gi;

/** Post / comment text with @username tags shown bold and colored (fans mint, artists purple). */
export const MentionText: React.FC<{ text: string; className?: string; plain?: boolean }> = ({ text, className = '', plain = false }) => {
  const go = useNav();
  const [, force] = useState(0);
  const names = [...text.matchAll(MENTION_RE)].map((m) => m[2].toLowerCase());

  useEffect(() => {
    if (names.length) resolve(names).then(() => force((x) => x + 1));
  }, [text]);

  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    const uname = m[2].toLowerCase();
    parts.push(text.slice(last, start));
    const who = cache.get(uname);
    if (who && plain) {
      parts.push(<strong key={start} className={roleMeta(who.role).text}>{who.display_name}</strong>);  // no link (e.g. inside a notification button)
    } else if (who) {
      parts.push(
        <button
          key={start}
          type="button"
          onClick={(e) => { e.stopPropagation(); go({ name: 'profile', id: who.id }); }}
          title={`@${who.username} · ${roleMeta(who.role).label}`}
          className={`font-bold hover:underline cursor-pointer ${roleMeta(who.role).text}`}
        >
          {who.display_name}
        </button>,
      );
    } else {
      parts.push(<span key={start} className={cache.has(uname) ? '' : 'font-bold text-[#8E9AA7]'}>@{m[2]}</span>);
    }
    last = start + 1 + m[2].length;
  }
  parts.push(text.slice(last));
  return <span className={`whitespace-pre-line ${className}`}>{parts}</span>;
};

// ---------------------------------------------------------------- input with @ suggestions
type Suggest = { id: string; username: string; display_name: string; avatar_url: string | null; role: string };

/** Textarea / input that suggests fans & artists when you type “@”. */
export const MentionInput: React.FC<{
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; single?: boolean;
  className?: string; ariaLabel: string; onEnter?: () => void;
}> = ({ value, onChange, placeholder, rows = 3, single = false, className = '', ariaLabel, onEnter }) => {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [list, setList] = useState<Suggest[]>([]);
  const [hi, setHi] = useState(0);

  const detect = (v: string, caret: number) => {
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|[^a-z0-9_@])@([a-z0-9_]{0,30})$/i);
    setQuery(m ? m[1] : null);
  };

  useEffect(() => {
    if (query === null) { setList([]); return; }
    const q = query.replace(/[^a-z0-9_]/gi, '');
    const t = setTimeout(async () => {
      let req = supabase.from('profiles').select('id, username, display_name, avatar_url, role').limit(6);
      if (q) req = req.or(`username.ilike.${q}%,display_name.ilike.%${q}%`);
      else req = req.order('created_at', { ascending: false });
      const { data } = await req;
      setList((data as Suggest[]) || []);
      setHi(0);
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (s: Suggest) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([a-z0-9_]{0,30})$/i, `@${s.username} `);
    const next = before + value.slice(caret);
    onChange(next);
    cache.set(s.username, { id: s.id, username: s.username, display_name: s.display_name, role: s.role as any });
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (query !== null && list.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % list.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + list.length) % list.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[hi]); return; }
      if (e.key === 'Escape') { setQuery(null); return; }
    }
    if (single && e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); }
  };

  const common = {
    ref,
    'aria-label': ariaLabel,
    value,
    placeholder,
    onKeyDown: onKey,
    onChange: (e: any) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart ?? e.target.value.length); },
    onClick: (e: any) => detect(e.target.value, e.target.selectionStart ?? 0),
    onBlur: () => setTimeout(() => setQuery(null), 150),
    className,
  };

  return (
    <div className="relative flex-1 min-w-0">
      {single ? <input {...common} /> : <textarea {...common} rows={rows} />}
      {query !== null && list.length > 0 && (
        <div role="listbox" aria-label="Tag someone" className="absolute left-0 right-0 top-full mt-1 z-50 max-h-64 overflow-y-auto rounded-xl bg-[#161B20] border border-white/15 shadow-2xl p-1">
          {list.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer ${i === hi ? 'bg-white/10' : ''}`}
            >
              <Avatar src={s.avatar_url} name={s.display_name} size={28} square={roleMeta(s.role).square} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-white truncate">{s.display_name}</span>
                <span className="block font-mono text-[10px] text-[#8E9AA7]">@{s.username}</span>
              </span>
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${roleMeta(s.role).chip}`}>{roleMeta(s.role).label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
