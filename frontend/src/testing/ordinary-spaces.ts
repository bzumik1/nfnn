export function withOrdinarySpaces<T extends string | null | undefined>(text: T): T {
  return (typeof text === 'string' ? text.replace(/\u00a0/g, ' ') : text) as T;
}
