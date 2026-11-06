export const BREAKPOINTS = {
  tabs: 208,
  pair: 260,
  tiny: 360,
  narrow: 420,
  phone: 480,
  cards: 640,
  tablet: 768,
  nav: 899,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export function downQuery(name: Breakpoint): string {
  return `(max-width: ${BREAKPOINTS[name]}px)`;
}
