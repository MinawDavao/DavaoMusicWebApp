import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, ExternalLink, Share2 } from 'lucide-react';
import { Modal } from '../components/ui';
import { hbtn } from './lib';
import { canSharePicture, downloadPicture, shareOrDownload } from './TradingCard';

export interface ReadyPicture { blob: Blob; fileName: string; kind: 'story' | 'post' | 'card' }

/** Inside the Facebook / Instagram / Messenger app browser: no share menu and no downloads there. */
const IN_APP = typeof navigator !== 'undefined' && /FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(navigator.userAgent);

/**
 * Step 2 of sharing a card: the picture is ready, the player says yes, and only THEN the phone's share menu
 * opens (it has to be straight from a tap). Fallbacks: save the picture, then open Instagram / Facebook.
 */
export const ShareSheet: React.FC<{ pic: ReadyPicture; onClose: () => void }> = ({ pic, onClose }) => {
  const url = useMemo(() => URL.createObjectURL(pic.blob), [pic.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const canShare = !IN_APP && canSharePicture(pic.blob, pic.fileName);
  const [note, setNote] = useState<string | null>(null);
  const what = pic.kind === 'story' ? 'Story' : pic.kind === 'post' ? 'Post' : 'card';
  const where = pic.kind === 'story' ? 'Facebook or Instagram Story' : pic.kind === 'post' ? 'Instagram post' : 'Facebook or Instagram';

  const share = async () => {
    setNote(null);
    const r = await shareOrDownload(pic.blob, pic.fileName);
    if (r === 'shared') { onClose(); return; }
    if (r === 'downloaded') setNote('Saved to your phone. Now open Instagram or Facebook and add it from your photos.');
  };
  const save = () => { downloadPicture(pic.blob, pic.fileName); setNote('Saved! Now open Instagram or Facebook and add it from your photos.'); };

  return (
    <Modal title={`Your ${what} picture is ready`} onClose={onClose}>
      <div className="mx-auto" style={{ width: pic.kind === 'story' ? '46%' : pic.kind === 'post' ? '62%' : '58%' }}>
        <img src={url} alt={`My player card ${what}`} className="w-full rounded-xl border border-white/10 shadow-lg" />
      </div>

      {IN_APP ? (
        <div className="p-3 rounded-2xl border border-[var(--hp)]/40 text-[12px] text-[#E7E5E4] space-y-1" style={{ background: 'color-mix(in srgb, var(--hp) 8%, transparent)' }}>
          <p className="font-bold text-white">You’re inside the Facebook / Instagram browser</p>
          <p>Press and hold the picture above and choose <strong>Save image</strong>. Then post it from the app{pic.kind === 'card' ? '' : ` as your ${where}`}.</p>
        </div>
      ) : canShare ? (
        <>
          <p className="text-[13px] text-[#E7E5E4] text-center">Share it to your <strong>{where}</strong>? Your phone will ask which app — pick <strong>Instagram</strong> or <strong>Facebook</strong>.</p>
          <button onClick={share} className={`${hbtn.primary} w-full !py-3`}><Share2 className="w-4 h-4" />Yes, open Instagram / Facebook</button>
        </>
      ) : (
        <p className="text-[13px] text-[#E7E5E4] text-center">Save the picture, then open Instagram or Facebook and add it from your photos{pic.kind === 'card' ? '' : ` as your ${where}`}.</p>
      )}

      {!IN_APP && <button onClick={save} className={`${hbtn.ghost} w-full !py-2.5 !text-xs`}><Download className="w-4 h-4" />Save picture to my phone</button>}
      {note && <p className="flex items-start gap-1.5 text-[12px] text-[#53E6D4]"><Check className="w-4 h-4 flex-shrink-0" />{note}</p>}
      <div className="grid grid-cols-2 gap-2">
        <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className={`${hbtn.ghost} !py-2 !text-xs`}><ExternalLink className="w-3.5 h-3.5" />Open Instagram</a>
        <a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer" className={`${hbtn.ghost} !py-2 !text-xs`}><ExternalLink className="w-3.5 h-3.5" />Open Facebook</a>
      </div>
      <button onClick={onClose} className="w-full text-center text-[12px] font-bold text-[#A8A29E] hover:text-white cursor-pointer py-1">Not now</button>
    </Modal>
  );
};
