import React, { useState } from 'react';
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react';
import { Modal, btn } from './ui';

export interface ShareData { title: string; text: string; url: string }

/** Copies text, also in browsers without the Clipboard API (e.g. Facebook / Messenger in-app browsers). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/**
 * Share button logic: uses the phone's share menu when it works, otherwise (desktop, in-app browsers,
 * or if the share menu fails) opens our own sheet with Copy link / Facebook / Messenger / WhatsApp / X.
 */
export function useShare() {
  const [data, setData] = useState<ShareData | null>(null);
  const share = async (d: ShareData) => {
    const nav = navigator as Navigator & { canShare?: (x: any) => boolean };
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile && typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ title: d.title, text: d.text, url: d.url }))) {
      try { await nav.share({ title: d.title, text: d.text, url: d.url }); return; }
      catch (e: any) { if (e?.name === 'AbortError') return; /* otherwise show our sheet */ }
    }
    setData(d);
  };
  const sheet = data ? <ShareSheet data={data} onClose={() => setData(null)} /> : null;
  return { share, sheet };
}

const ShareSheet: React.FC<{ data: ShareData; onClose: () => void }> = ({ data, onClose }) => {
  const [copied, setCopied] = useState<boolean | null>(null);
  const u = encodeURIComponent(data.url);
  const t = encodeURIComponent(data.text);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const links: { label: string; href: string; color: string }[] = [
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, color: '#1877F2' },
    ...(mobile ? [{ label: 'Messenger', href: `fb-messenger://share/?link=${u}`, color: '#A033FF' }] : []),
    { label: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}`, color: '#25D366' },
    { label: 'X', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}`, color: '#EBEBED' },
  ];
  const copy = async () => setCopied(await copyText(`${data.text} ${data.url}`));
  const nav = navigator as Navigator;

  return (
    <Modal title="Share" onClose={onClose}>
      <p className="text-[13px] text-[#EBEBED]">{data.text}</p>
      <div className="flex gap-2">
        <input readOnly aria-label="Link to share" value={data.url} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-[#0F1417] border border-white/15 text-xs text-[#C9D1D9] font-mono" />
        <button onClick={copy} className={`${copied ? btn.mint : btn.primary} !px-3.5`}>{copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy</>}</button>
      </div>
      {copied === false && <p className="text-[11px] text-[#FFB800]">Couldn’t copy automatically — press and hold the link above to copy it.</p>}
      <div className={`grid gap-2 ${links.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noreferrer" onClick={() => setTimeout(onClose, 300)}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-[#0F1417] border border-white/10 hover:bg-white/5 text-[11px] font-bold text-white">
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${l.color}22`, color: l.color }}>
              {l.label === 'Messenger' ? <MessageCircle className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            </span>
            {l.label}
          </a>
        ))}
      </div>
      {typeof nav.share === 'function' && (
        <button onClick={async () => { try { await nav.share({ title: data.title, text: data.text, url: data.url }); onClose(); } catch { /* keep sheet open */ } }}
          className={`${btn.ghost} w-full`}><Share2 className="w-4 h-4" />More apps…</button>
      )}
    </Modal>
  );
};
