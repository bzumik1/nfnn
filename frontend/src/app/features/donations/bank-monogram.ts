const ABBREVIATION = /^(?=.*\p{Lu}.*\p{Lu})[\p{Lu}\d&]{2,4}$/u;
const CZECH = 'cs';

export function bankMonogram(shortName: string): string {
  const words = shortName.split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) {
    return '';
  }
  const [first, second] = words;
  if (ABBREVIATION.test(first)) {
    return first;
  }
  const letters =
    second === undefined ? [...first].slice(0, 2) : [first.charAt(0), second.charAt(0)];
  return letters.join('').toLocaleUpperCase(CZECH);
}
