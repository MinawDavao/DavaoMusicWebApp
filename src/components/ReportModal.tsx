import React, { useState } from 'react';
import { Flag, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { REPORT_REASONS, errorMessage, type ReportReason, type ReportTarget } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { ErrorNote, Modal, btn } from './ui';

/** Report dialog — enforces the Terms of Agreement (reports are reviewed by moderators). */
export const ReportModal: React.FC<{ targetType: ReportTarget; targetId: string; label?: string; onClose: () => void; onLogin: () => void }> = ({
  targetType, targetId, label = 'this post', onClose, onLogin,
}) => {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!user || !reason) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id, target_type: targetType, target_id: targetId, reason, details: details.trim() || null,
    });
    setBusy(false);
    if (error) setErr(errorMessage(error));
    else setDone(true);
  };

  return (
    <Modal title={`Report ${label}`} onClose={onClose}>
      {!user ? (
        <div className="space-y-3">
          <p className="text-sm text-[#8E9AA7]">Log in to report content that breaks the Terms of Agreement.</p>
          <button className={btn.primary} onClick={() => { onClose(); onLogin(); }}>Log In</button>
        </div>
      ) : done ? (
        <div className="flex gap-3 items-start p-3 rounded-xl bg-[#53E6D4]/10 border border-[#53E6D4]/30">
          <ShieldCheck className="w-5 h-5 text-[#53E6D4] flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-white">Thanks — report received</p>
            <p className="text-xs text-[#8E9AA7] leading-relaxed">Our moderators will review it and remove it if it breaks the Terms of Agreement.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[#8E9AA7]">Why are you reporting {label}? Your report is anonymous to the person who posted.</p>
          <div role="radiogroup" className="space-y-1.5">
            {REPORT_REASONS.map((r) => {
              const on = reason === r.key;
              return (
                <button
                  key={r.key}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setReason(r.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer border ${on ? 'bg-[#FF8A7A]/10 border-[#FF8A7A]' : 'bg-[#0F1417] border-white/15'}`}
                >
                  <span className={`w-4 h-4 rounded-full flex-shrink-0 ${on ? 'border-[5px] border-[#FF8A7A]' : 'border-2 border-white/35'}`} />
                  <span>
                    <span className="block text-[13px] font-bold text-white">{r.label}</span>
                    <span className="block text-[11px] text-[#8E9AA7]">{r.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <textarea
            aria-label="Extra details"
            rows={2}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Add details for our moderators (optional)"
            className="w-full px-3 py-2 rounded-xl bg-[#0F1417] border border-white/15 text-sm text-[#EBEBED] outline-none resize-none"
          />
          <ErrorNote text={err} />
          <button disabled={!reason || busy} onClick={submit} className={`${btn.primary} w-full !bg-[#FF8A7A] !text-[#0F1417] disabled:!bg-[#252D37] disabled:!text-[#8E9AA7]`}>
            <Flag className="w-4 h-4" /> {busy ? 'Sending…' : 'Submit Report'}
          </button>
          <p className="text-[10px] text-center text-[#8E9AA7]">Reports are reviewed under our Terms of Agreement. Content proven to break the rules is removed.</p>
        </div>
      )}
    </Modal>
  );
};
