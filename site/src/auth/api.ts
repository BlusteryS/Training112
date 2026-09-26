import { api } from '../api';
export { ApiError } from '../api';

export type User = {
  id: string;
  login: string;
  role: 'user' | 'instructor' | 'admin';
  workstation?: string;
};

type Credentials = { login: string; password: string; workstation: string };
type AuthResponse = { user: User };

export const authApi = {
  me: (signal?: AbortSignal) => api<AuthResponse>('auth/me', undefined, signal),
  login: (credentials: Credentials) => api<AuthResponse>('auth/login', credentials),
  logout: () => api<void>('auth/logout', {}),
};
