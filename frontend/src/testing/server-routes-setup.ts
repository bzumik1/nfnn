import { readFileSync } from 'node:fs';
import type { TestProject } from 'vitest/node';
import { APP_ROUTES_FILE, appRoutePatterns } from '../../scripts/app-routes.mjs';
import type { ServerAppRoutes } from './server-routes';

export default function provideServerRoutes(project: TestProject): void {
  const routes: ServerAppRoutes = appRoutePatterns(readFileSync(APP_ROUTES_FILE, 'utf8'));
  project.provide('serverAppRoutes', routes);
}
