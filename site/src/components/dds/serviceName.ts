export function sameService(left: string, right: string) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase('ru').replace(/^служба\s+/, '');
  return normalize(left) === normalize(right);
}
