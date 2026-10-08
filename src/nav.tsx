import { createContext, useContext } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'audio' }
  | { name: 'band'; id: string; song?: string }
  | { name: 'connect' }
  | { name: 'profile'; id?: string }
  | { name: 'deals' }
  | { name: 'playlist'; id: string }
  | { name: 'post'; id: string }
  | { name: 'auth'; mode?: 'login' | 'signup' }
  | { name: 'onboarding' }
  | { name: 'admin' }
  | { name: 'messages' }
  | { name: 'hoop' }
  | { name: 'hoopGame'; id: string }
  | { name: 'hoopPlayer'; id?: string }
  | { name: 'hoopPlayers' }
  | { name: 'chat'; id: string; listing?: string };

export const NavContext = createContext<(r: Route) => void>(() => {});
export const useNav = () => useContext(NavContext);
