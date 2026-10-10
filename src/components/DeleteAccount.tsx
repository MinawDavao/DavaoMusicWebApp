import React, { useState } from 'react';
import { AlertTriangle, Loader2, Lock, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../nav';
import { ErrorNote, Field, Modal, btn, inputCls } from './ui';

const BUCKETS = ['avatars', 'banners', 'band-photos', 'post-images', 'gear-photos', 'tracks'];

/** Best effort: removes every file this person uploaded (their own folder in each bucket, plus their chat photos). */
async function removeMyFiles(uid: string) {
  const wipe = async (bucket: string, folder: string) => {
    for (let round = 0; round < 20; round++) {
      const { data } = await supabase.storage.from(bucket).list(folder, { limit: 100 });
      const files = (data || []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
      if (!files.length) return;
      const { error } = await supabase.storage.from(bucket).remove(files);
      if (error) return;
    }
  };
  for (const b of BUCKETS) { try { await wipe(b, uid); } catch { /* keep going */ } }
  try {
    const { data } = await supabase.from('conversations').select('id').or(`user_a.eq.${uid},user_b.eq.${uid}`);
    for (const c of (data as { id: string }[]) || []) await wipe('chat-photos', `${c.id}/${uid}`);
  } catch { /* ignore */ }
}

/** "Delete my account" section on your own profile. */
export const DeleteAccountSection: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <section id="account-settings" className="space-y-2.5 pt-2">
      <div className="p-3.5 rounded-2xl bg-[#FF4D6A]/[0.06] border border-[#FF4D6A]/30 space-y-2">
        <p className="flex items-center gap-2 text-[13px] font-bold text-white"><Trash2 className="w-4 h-4 text-[#FF8A9C]" />Delete account</p>
        <p className="text-[11px] text-[#8E9AA7] leading-relaxed">Permanently remove your MINAW DAVAO account and everything in it. This can’t be undone.</p>
        <button onClick={() => setOpen(true)} className={`${btn.ghost} !py-2 !text-xs !text-[#FF8A9C] !border-[#FF4D6A]/40`}><Trash2 className="w-3.5 h-3.5" />Delete my account…</button>
      </div>
      {open && <DeleteAccountModal onClose={() => setOpen(false)} />}
    </section>
  );
};

const DeleteAccountModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const go = useNav();
  const { user, profile, band, adminBands, isModerator, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ready = password.length > 0 && typed.trim().toUpperCase() === 'DELETE' && !busy;

  const run = async () => {
    if (!user?.email || !ready) return;
    setErr(null);
    try {
      setBusy('Checking your password…');
      const { error: pe } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (pe) throw new Error(/Invalid login/i.test(pe.message) ? 'Wrong password.' : pe.message);
      const { error: de } = await supabase.rpc('close_my_account', { p_confirm: 'DELETE', p_dry_run: true });
      if (de) throw de;
      setBusy('Removing your photos and songs…');
      await removeMyFiles(user.id);
      setBusy('Deleting your account…');
      const { error } = await supabase.rpc('close_my_account', { p_confirm: 'DELETE', p_dry_run: false });
      if (error) throw error;
      try { sessionStorage.setItem('minaw-account-deleted', '1'); } catch { /* ignore */ }
      await signOut().catch(() => {});
      go({ name: 'home' });
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <Modal title="Delete your account?" onClose={busy ? () => {} : onClose} footer={
      <>
        <ErrorNote text={err} />
        {busy && <p className="flex items-center justify-center gap-2 text-[12px] text-[#8E9AA7]"><Loader2 className="w-4 h-4 animate-spin" />{busy}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={!!busy} className={`${btn.ghost} flex-1`}>Keep my account</button>
          <button onClick={run} disabled={!ready || isModerator} className={`${btn.primary} flex-1 !bg-[#E5484D] hover:!bg-[#D13C41] disabled:opacity-50`}><Trash2 className="w-4 h-4" />Delete forever</button>
        </div>
      </>
    }>
      <div className="flex gap-2.5 p-3 rounded-xl bg-[#FF4D6A]/[0.08] border border-[#FF4D6A]/35 text-[12px] text-[#EBEBED] leading-relaxed">
        <AlertTriangle className="w-4 h-4 text-[#FF8A9C] flex-shrink-0 mt-0.5" />
        <span>This permanently deletes <strong className="text-white">{profile?.display_name || 'your account'}</strong> and <strong className="text-white">can’t be undone</strong>. You’d need to sign up again to come back.</span>
      </div>
      <div className="text-[12px] text-[#C9D1D9] space-y-1">
        <p className="font-bold text-white">What gets deleted:</p>
        <ul className="list-disc pl-5 space-y-0.5 text-[#8E9AA7]">
          <li>Your profile, photos and card background</li>
          <li>Your posts, comments, reactions and testimonials</li>
          {band && <li><strong className="text-[#FFB3BF]">Your band page “{band.name}”</strong> with its songs, gigs, photos and followers</li>}
          <li>Your deals on Gear Exchange</li>
          <li>Your playlists, follows, RSVPs and notifications</li>
          <li>Your chats (they disappear for the other person too)</li>
          {adminBands.length > 0 && <li>Your admin access to {adminBands.map((b) => b.name).join(', ')} (the band pages stay)</li>}
        </ul>
      </div>
      {isModerator ? (
        <p className="text-[12px] text-[#FFD873]">This is an admin account, so it can’t be deleted from the app. Remove it from the moderators list in Supabase first.</p>
      ) : (
        <>
          <Field label="Your password" icon={Lock} htmlFor="del-pw"><input id="del-pw" type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Type DELETE to confirm" htmlFor="del-type"><input id="del-type" autoCapitalize="characters" autoComplete="off" className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" /></Field>
        </>
      )}
    </Modal>
  );
};

/** One-time "your account was deleted" note on Home after deleting. */
export const AccountDeletedNote: React.FC = () => {
  const [show, setShow] = useState(() => { try { const v = sessionStorage.getItem('minaw-account-deleted'); sessionStorage.removeItem('minaw-account-deleted'); return !!v; } catch { return false; } });
  if (!show) return null;
  return (
    <div role="status" className="mx-3 mt-3 flex items-start gap-2 p-3 rounded-2xl bg-[#53E6D4]/[0.08] border border-[#53E6D4]/35 text-[12px] text-[#EBEBED]">
      <span className="flex-1">Your account has been deleted. Thanks for being part of the Davao scene — you’re welcome back anytime.</span>
      <button onClick={() => setShow(false)} className="text-[#8E9AA7] hover:text-white text-xs font-bold cursor-pointer">OK</button>
    </div>
  );
};
