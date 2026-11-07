export const BREAKPOINTS = {
  tiny: 360,
  narrow: 420,
  phone: 480,
  cards: 640,
  tablet: 768,
  nav: 899,
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
