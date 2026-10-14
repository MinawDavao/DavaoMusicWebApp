import React, { useCallback, useEffect, useState } from 'react';
import { MailCheck, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { errorMessage, timeAgo } from '../../lib/db';
import { ErrorNote, Spinner, btn, inputCls } from '../../components/ui';
import { confirmDelete } from '../../components/ConfirmDelete';

interface Row { email: string; note: string | null; created_at: string }

/** Emails that can sign up without the 6-digit email code (friends, testers). */
export const AdminSkipVerify: React.FC = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('signup_skip_verification').select('email, note, created_at').order('created_at', { ascending: false });
    if (error) setErr(errorMessage(error));
    setRows((data as Row[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setErr('Please enter a valid email address.');
    setBusy(true); setErr(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('signup_skip_verification').insert({ email: v, note: note.trim() || null, added_by: user?.id });
    setBusy(false);
    if (error) return setErr(/duplicate/i.test(error.message) ? 'That email is already on the list.' : errorMessage(error));
    setEmail(''); setNote(''); load();
  };
  const remove = async (r: Row) => {
    if (!(await confirmDelete({ title: `Remove ${r.email}?`, message: 'If they haven’t signed up yet, they’ll need the email code like everyone else.', confirmLabel: 'Remove' }))) return;
    const { error } = await supabase.from('signup_skip_verification').delete().eq('email', r.email);
    if (error) return setErr(errorMessage(error));
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 bg-[#1D232A] border border-white/[0.08] space-y-1.5">
        <p className="flex items-center gap-2 font-heading font-bold text-white"><MailCheck className="w-5 h-5 text-[#53E6D4]" />Skip email code</p>
        <p className="text-[12px] text-[#8E9AA7] leading-relaxed">
          People who sign up with an email on this list don’t get asked for the 6-digit code — their account is confirmed right away and they go straight to the next step.
          Add the email <strong className="text-white">before</strong> they sign up. Only add people you trust: the app can’t check they really own that email.
        </p>
      </div>

      <form onSubmit={add} className="rounded-2xl p-3.5 bg-[#1D232A] border border-white/[0.08] space-y-2.5">
        <input type="email" inputMode="email" autoCapitalize="none" aria-label="Email" placeholder="friend@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input aria-label="Note" placeholder="Note (optional) — e.g. Friend, artist" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        <ErrorNote text={err} />
        <button type="submit" disabled={busy || !email.trim()} className={`${btn.primary} w-full`}><Plus className="w-4 h-4" />{busy ? 'Adding…' : 'Add email'}</button>
      </form>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-center text-[12px] text-[#8E9AA7] py-4">No emails yet.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.email} className="flex items-center gap-3 p-3 rounded-xl bg-[#1D232A] border border-white/[0.08]">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-white truncate">{r.email}</span>
                <span className="block text-[11px] text-[#8E9AA7] truncate">{r.note ? `${r.note} · ` : ''}added {timeAgo(r.created_at)}</span>
              </span>
              <button onClick={() => remove(r)} aria-label={`Remove ${r.email}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8E9AA7] hover:text-[#FF6B7A] cursor-pointer"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
