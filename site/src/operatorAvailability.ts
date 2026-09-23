const manualStatusPrefix = 'training112.operator.available.';
const cooldownPrefix = 'training112.operator.cooldown.';

export function readManualAvailability(userId: string) {
  return localStorage.getItem(`${manualStatusPrefix}${userId}`) !== 'false';
}

export function writeManualAvailability(userId: string, available: boolean) {
  localStorage.setItem(`${manualStatusPrefix}${userId}`, String(available));
}

export function readCooldown(userId: string) {
  const value = Number(localStorage.getItem(`${cooldownPrefix}${userId}`));
  return Number.isFinite(value) ? value : 0;
}

export function startCooldown(userId: string) {
  localStorage.setItem(`${cooldownPrefix}${userId}`, String(Date.now() + 10_000));
}
