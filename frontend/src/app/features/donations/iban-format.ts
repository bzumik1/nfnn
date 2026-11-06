export function formatIban(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, '$1 ');
}

export function ibanHalves(iban: string): [string, string] {
  const groups = formatIban(iban).split(' ');
  const firstHalf = Math.ceil(groups.length / 2);
  return [groups.slice(0, firstHalf).join(' '), groups.slice(firstHalf).join(' ')];
}
