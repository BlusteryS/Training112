const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${numberFormat.format(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${numberFormat.format(bytes / 1024)} КиБ`;
  return `${numberFormat.format(bytes / (1024 * 1024))} МиБ`;
}
