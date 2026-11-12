export function formatIban(iban: string): string {
  return ibanGroups(iban).join(' ');
}

export function ibanGroups(iban: string): string[] {
  return iban.match(/.{1,4}/g) ?? [];
}

export function ibanHalves(iban: string): [string, string] {
  const groups = ibanGroups(iban);
  const firstHalf = Math.ceil(groups.length / 2);
  return [groups.slice(0, firstHalf).join(' '), groups.slice(firstHalf).join(' ')];
}
