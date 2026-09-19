import { createContext, useContext } from 'react';
import type { User } from './api';

export type AuthState = {
  user: User;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth requires an authenticated session');
  return auth;
}
