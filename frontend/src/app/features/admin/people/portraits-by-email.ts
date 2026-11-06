import type { PersonResponse } from '../../content/people-api';

const PORTRAIT_WIDTH = 480;

export function portraitsByEmail(members: readonly PersonResponse[]): Map<string, string | null> {
  const portraits = new Map<string, string | null>();
  for (const member of members) {
    if (!member.linkedToAccount) {
      continue;
    }
    const portrait = member.portrait ? `${member.portrait.url}?w=${PORTRAIT_WIDTH}` : null;
    for (const email of [member.personalEmail, member.fundEmail]) {
      if (email !== null && !portraits.has(email)) {
        portraits.set(email, portrait);
      }
    }
  }
  return portraits;
}
