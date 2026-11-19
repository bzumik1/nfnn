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

export type PageFadeFacts = Pick<
  NavigationFacts,
  'first' | 'reducedMotion' | 'compact' | 'dialogOpen' | 'trigger' | 'back' | 'skipLocationChange'
> & {
  readonly insideLockedAdministration: boolean;
  readonly from: string;
  readonly to: string;
};

export function pageFadeFor(facts: PageFadeFacts): boolean {
  return (
    !facts.first &&
    !facts.reducedMotion &&
    !facts.compact &&
    !facts.dialogOpen &&
    facts.trigger === 'imperative' &&
    !facts.back &&
    !facts.skipLocationChange &&
    !facts.insideLockedAdministration &&
    pathOf(facts.from) !== pathOf(facts.to)
  );
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

export function pushWithinSection(
  path: string,
  parent: string | null,
  sections: readonly string[],
): boolean {
  if (parent === null || sections.includes(path)) {
    return false;
  }
  const section = sections
    .filter((candidate) => candidate !== '/' && within(path, candidate))
    .reduce<string | null>(
      (longest, candidate) =>
        longest === null || candidate.length > longest.length ? candidate : longest,
      null,
    );
  return section !== null && within(pathOf(parent), section);
}

function within(path: string, section: string): boolean {
  return path === section || path.startsWith(`${section}/`);
}
