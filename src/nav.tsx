import { createContext, useContext } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'audio' }
  | { name: 'band'; id: string }
  | { name: 'connect' }
  | { name: 'profile'; id?: string }
  | { name: 'deals' }
  | { name: 'auth'; mode?: 'login' | 'signup' }
  | { name: 'onboarding' };

export const NavContext = createContext<(r: Route) => void>(() => {});
export const useNav = () => useContext(NavContext);
