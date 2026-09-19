export type User = {
  id: string;
  login: string;
  role: 'user' | 'admin';
};

type Credentials = { login: string; password: string };
type AuthResponse = { user: User };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: body === undefined ? undefined : {
        'Content-Type': 'application/json',
        'X-Requested-With': 'training112',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = typeof data?.error?.message === 'string' ? data.error.message
      : response.status === 429 ? 'Слишком много запросов. Попробуйте позже.'
      : 'Сервис временно недоступен. Попробуйте ещё раз.';
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const authApi = {
  me: (signal?: AbortSignal) => request<AuthResponse>('me', undefined, signal),
  login: (credentials: Credentials) => request<AuthResponse>('login', credentials),
  register: (credentials: Credentials) => request<AuthResponse>('register', credentials),
  logout: () => request<void>('logout', {}),
};
