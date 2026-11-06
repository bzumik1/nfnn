import type { LoadChildren, Routes } from '@angular/router';

export type ServerAppRoutes = readonly string[];

declare module 'vitest' {
  interface ProvidedContext {
    serverAppRoutes: ServerAppRoutes;
  }
}

interface Alias {
  readonly from: string;
  readonly to: string;
}

export async function appRoutePaths(routes: Routes): Promise<string[]> {
  const found = new Set<string>();
  const aliases: Alias[] = [];
  await collect(routes, [], found, aliases);
  for (const { from, to } of aliases) {
    for (const path of [...found]) {
      if (path === to || path.startsWith(`${to}/`)) {
        found.add(from + path.slice(to.length));
      }
    }
  }
  return [...found].sort();
}

async function collect(
  routes: Routes,
  parent: readonly string[],
  found: Set<string>,
  aliases: Alias[],
): Promise<void> {
  for (const route of routes) {
    const path = route.path ?? '';
    if (path === '**') {
      continue;
    }
    const segments = [...parent, ...segmentsOf(path)];
    if (typeof route.redirectTo === 'string' && path !== '' && route.pathMatch !== 'full') {
      const target = route.redirectTo.startsWith('/')
        ? segmentsOf(route.redirectTo)
        : [...parent, ...segmentsOf(route.redirectTo)];
      aliases.push({ from: address(segments), to: address(target) });
      continue;
    }
    const children = route.children ?? (route.loadChildren && (await loaded(route.loadChildren)));
    if (children && children.length > 0) {
      await collect(children, segments, found, aliases);
    } else {
      found.add(address(segments));
    }
  }
}

async function loaded(load: LoadChildren): Promise<Routes> {
  const children: unknown = await load();
  if (!Array.isArray(children)) {
    throw new Error('a lazy route set must resolve to an array of routes');
  }
  return children as Routes;
}

function segmentsOf(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '');
}

function address(segments: readonly string[]): string {
  return `/${segments.map((segment) => (segment.startsWith(':') ? ':param' : segment)).join('/')}`;
}
