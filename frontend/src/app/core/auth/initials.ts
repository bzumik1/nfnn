export function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '');
  if (words.length === 0) {
    return '';
  }
  const first = words[0];
  const last = words[words.length - 1];
  const letters = words.length === 1 ? first.charAt(0) : first.charAt(0) + last.charAt(0);
  return letters.toLocaleUpperCase('cs');
}
