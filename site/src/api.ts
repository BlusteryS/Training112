export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(20_000);
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      method: body === undefined ? 'GET' : 'POST',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: body === undefined ? undefined : {
        'Content-Type': 'application/json', 'X-Requested-With': 'training112',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, timeout.aborted
      ? 'Сервер не ответил вовремя. Проверьте состояние операции перед повтором.'
      : 'Не удалось связаться с сервером. Проверьте подключение.');
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new ApiError(response.status, typeof result?.error?.message === 'string' ? result.error.message
      : response.status === 429 ? 'Слишком много запросов. Повторите позже.' : 'Не удалось выполнить запрос.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
