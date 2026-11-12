import { pathOf, tabOf } from './app-tabs';

export type PageTransitionKind = 'push' | 'pop';

export interface PagePlace {
  readonly url: string;
  readonly parent: string | null;
}

export interface NavigationFacts {
  readonly first: boolean;
  readonly reducedMotion: boolean;
  readonly compact: boolean;
  readonly dialogOpen: boolean;
  readonly trigger: 'imperative' | 'popstate' | 'hashchange';
  readonly back: boolean;
  readonly replaceUrl: boolean;
  readonly skipLocationChange: boolean;
  readonly from: PagePlace;
  readonly to: PagePlace;
}

export function pageTransitionFor(facts: NavigationFacts): PageTransitionKind | null {
  if (
    facts.first ||
    facts.reducedMotion ||
    !facts.compact ||
    facts.dialogOpen ||
    facts.skipLocationChange ||
    pathOf(facts.from.url) === pathOf(facts.to.url)
  ) {
    return null;
  }
  if (facts.trigger === 'popstate' || facts.back) {
    return facts.from.parent === null ? null : 'pop';
  }
  if (facts.replaceUrl || facts.to.parent === null) {
    return null;
  }
  return sameTab(facts.from.url, facts.to.url) ? 'push' : null;
}

function sameTab(from: string, to: string): boolean {
  const here = tabOf(from);
  const there = tabOf(to);
  return here === null || there === null || here.id === there.id;
}
