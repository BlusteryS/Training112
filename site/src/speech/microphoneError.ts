export function microphoneError(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : '';
  if ((cause instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(cause.name))
    || /permission denied|notallowederror/i.test(message)) {
    return 'Доступ к микрофону запрещён. Разрешите его в браузере и системе, затем повторите звонок.';
  }
  return message || fallback;
}
