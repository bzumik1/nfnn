export type PluralCategory = 'one' | 'few' | 'other';

const CZECH_RULES = new Intl.PluralRules('cs');

export function pluralCategory(count: number): PluralCategory {
  const category = CZECH_RULES.select(count);
  return category === 'one' || category === 'few' ? category : 'other';
}
