/** Tracks whether the app can be installed (Android "Install app" prompt) and what kind of device this is. */

type Listener = () => void;
let deferred: any = null;            // the browser's saved install prompt (Chrome/Edge/Samsung on Android, desktop Chrome)
let installed = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit(); });
}

export const subscribeInstall = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const canPromptInstall = () => !!deferred;

/** Shows the browser's own "Install MINAW DAVAO?" dialog. Returns true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred; deferred = null; emit();
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  if (choice?.outcome === 'accepted') { installed = true; emit(); return true; }
  return false;
}

export const isStandalone = () =>
  installed || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

const ua = () => navigator.userAgent || '';
export const isIOS = () => /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(ua());
/** Facebook, Messenger, Instagram, TikTok… in-app browsers can't add to the home screen. */
export const isInAppBrowser = () => /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|TikTok|musical_ly|Twitter/i.test(ua());
/** On iPhone only Safari can add to the home screen (Chrome/Firefox on iPhone now can too on iOS 16.4+, via their share menu). */
export const isIOSSafari = () => isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua()) && !isInAppBrowser();

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || (import.meta as any).env?.DEV) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
