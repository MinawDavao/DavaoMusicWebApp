import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, ExternalLink, MoreVertical, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import {
  canPromptInstall, isAndroid, isIOS, isIOSSafari, isInAppBrowser, isStandalone, promptInstall, subscribeInstall,
} from '../lib/install';
import { Modal, btn } from './ui';

const DISMISS_KEY = 'minaw-install-dismissed';
const DISMISS_DAYS = 14;

const dismissedRecently = () => {
  try { const t = Number(localStorage.getItem(DISMISS_KEY) || 0); return Date.now() - t < DISMISS_DAYS * 864e5; } catch { return false; }
};
const rememberDismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ } };

const useCanPrompt = () => useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);

type Mode = 'prompt' | 'ios' | 'inapp' | 'android-manual' | 'desktop';
const detectMode = (canPrompt: boolean): Mode =>
  canPrompt ? 'prompt'
    : isInAppBrowser() ? 'inapp'
      : isIOS() ? 'ios'
        : isAndroid() ? 'android-manual'
          : 'desktop';

const Logo: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <span className="flex-shrink-0 rounded-xl bg-[#0F1417] border border-white/10 flex items-center justify-center" style={{ width: size, height: size }}>
    <img src="/minaw-logo.png.png" alt="" style={{ height: size * 0.72 }} />
  </span>
);

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex items-start gap-2.5">
    <span className="w-6 h-6 rounded-full bg-[#6045F4] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{n}</span>
    <span className="text-[13px] text-[#EBEBED] leading-relaxed pt-0.5">{children}</span>
  </li>
);
const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-white/10 border border-white/15 text-[12px] font-bold text-white align-middle">{children}</span>
);

/** Step-by-step help for the device the person is on. */
const HowTo: React.FC<{ mode: Mode }> = ({ mode }) => {
  if (mode === 'ios') {
    return (
      <ol className="space-y-2.5">
        {!isIOSSafari() && <li className="text-[12px] text-[#FFC34D]">Tip: this works best in <strong>Safari</strong>. Open this page in Safari first.</li>}
        <Step n={1}>Tap the <Key><Share className="w-3.5 h-3.5" />Share</Key> button at the bottom of Safari (top right on iPad).</Step>
        <Step n={2}>Scroll down and tap <Key><PlusSquare className="w-3.5 h-3.5" />Add to Home Screen</Key>.</Step>
        <Step n={3}>Tap <Key>Add</Key>. The MINAW DVO icon appears on your home screen.</Step>
      </ol>
    );
  }
  if (mode === 'inapp') {
    return (
      <ol className="space-y-2.5">
        <Step n={1}>You’re inside Facebook, Messenger or another app’s browser, which can’t install apps.</Step>
        <Step n={2}>Tap <Key><MoreVertical className="w-3.5 h-3.5" />•••</Key> (top or bottom corner) and choose <Key><ExternalLink className="w-3.5 h-3.5" />Open in browser</Key> or <Key>Open in Safari</Key>.</Step>
        <Step n={3}>Then tap <strong>Install the app</strong> again from there.</Step>
      </ol>
    );
  }
  if (mode === 'android-manual') {
    return (
      <ol className="space-y-2.5">
        <Step n={1}>Tap the browser menu <Key><MoreVertical className="w-3.5 h-3.5" /></Key> (top right in Chrome).</Step>
        <Step n={2}>Tap <Key>Install app</Key> or <Key>Add to Home screen</Key>.</Step>
        <Step n={3}>Tap <Key>Install</Key>. The MINAW DVO icon appears on your home screen.</Step>
      </ol>
    );
  }
  return (
    <ol className="space-y-2.5">
      <Step n={1}>Scan the MINAW DVO QR code or open <strong>minawdavao.pages.dev</strong> on your phone.</Step>
      <Step n={2}>On Android, tap <strong>Install</strong> when it pops up. On iPhone, tap <Key><Share className="w-3.5 h-3.5" />Share</Key> → <Key>Add to Home Screen</Key>.</Step>
      <Step n={3}>On a computer using Chrome or Edge, click the install icon <Key><Download className="w-3.5 h-3.5" /></Key> at the right end of the address bar.</Step>
    </ol>
  );
};

/** Banner under the header inviting people to put MINAW DVO on their home screen. */
export const InstallBanner: React.FC = () => {
  const canPrompt = useCanPrompt();
  const [show, setShow] = useState(false);
  const [help, setHelp] = useState(false);
  const mode = detectMode(canPrompt);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;
    // Only on phones (or when the browser offers a one-tap install), after a short delay so it doesn't flash on load.
    if (mode === 'desktop') return;
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [mode]);

  if (!show || isStandalone()) return null;
  const close = () => { rememberDismiss(); setShow(false); };
  const install = async () => {
    if (mode === 'prompt') { const ok = await promptInstall(); if (ok) setShow(false); }
    else setHelp(true);
  };

  return (
    <>
      <div role="region" aria-label="Install the app" className="mx-3 mt-3 flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-[#2A2160] to-[#161B20] border border-[#6045F4]/45">
        <Logo />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white">Get the MINAW DVO app</p>
          <p className="text-[11px] text-[#8E9AA7] leading-snug">
            {mode === 'inapp' ? 'Open in your browser to add it to your home screen.' : 'Add it to your home screen. Free, no app store needed.'}
          </p>
        </div>
        <button onClick={install} className={`${btn.mint} !py-2 !px-3 !text-xs flex-shrink-0`}>
          {mode === 'prompt' ? <><Download className="w-3.5 h-3.5" />Install</> : 'How?'}
        </button>
        <button onClick={close} aria-label="Not now" className="w-7 h-7 -mr-1 flex items-center justify-center text-[#8E9AA7] hover:text-white cursor-pointer flex-shrink-0"><X className="w-4 h-4" /></button>
      </div>
      {help && <InstallHelpModal mode={mode} onClose={() => setHelp(false)} />}
    </>
  );
};

const InstallHelpModal: React.FC<{ mode: Mode; onClose: () => void }> = ({ mode, onClose }) => (
  <Modal title="Add MINAW DVO to your home screen" onClose={onClose}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Logo size={52} />
        <p className="text-xs text-[#8E9AA7] leading-relaxed">It opens full screen like a regular app, with the MINAW DVO icon on your phone.</p>
      </div>
      <HowTo mode={mode} />
      <button onClick={onClose} className={`${btn.primary} w-full`}>Got it</button>
    </div>
  </Modal>
);

/** “Install the app” link for the footer: one tap on Android, step-by-step help elsewhere. Hidden once installed. */
export const InstallLink: React.FC = () => {
  const canPrompt = useCanPrompt();
  const [help, setHelp] = useState(false);
  if (isStandalone()) return null;
  const mode = detectMode(canPrompt);
  return (
    <>
      <button
        onClick={async () => { if (mode === 'prompt') await promptInstall(); else setHelp(true); }}
        className="flex items-center gap-1.5 text-[12px] font-bold text-[#53E6D4] hover:underline cursor-pointer"
      >
        <Smartphone className="w-4 h-4" />Install the app on your phone
      </button>
      {help && <InstallHelpModal mode={mode} onClose={() => setHelp(false)} />}
    </>
  );
};
