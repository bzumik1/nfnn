export const BREAKPOINTS = {
  tabs: 208,
  pair: 260,
  pager: 312,
  tiny: 360,
  narrow: 420,
  phone: 480,
  amounts: 520,
  cards: 640,
  tablet: 768,
  ledger: 864,
  nav: 899,
  laptop: 1100,
  wide: 1599,
} as const;

export const HEIGHTS = {
  short: 500,
  'hero-lead': 680,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export type Height = keyof typeof HEIGHTS;

export function downQuery(name: Breakpoint): string {
  return `(max-width: ${BREAKPOINTS[name]}px)`;
}

export function heightDownQuery(name: Height): string {
  return `(max-height: ${HEIGHTS[name]}px)`;
}
