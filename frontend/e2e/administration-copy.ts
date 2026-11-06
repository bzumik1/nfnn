import { rowsSha256 } from '../src/app/features/donations/sync/canonical-rows';
import { administrator } from './donor-session';
import type { RouteTarget } from './fixtures';

export interface AdministrationCopyChunk {
  readonly id: string;
  readonly rows: readonly unknown[];
}

export interface AdministrationCopyMock {
  readonly today?: string;
  readonly donations?: readonly AdministrationCopyChunk[];
  readonly donors?: readonly AdministrationCopyChunk[];
}

export async function mockAdministrationCopy(
  target: RouteTarget,
  copy: AdministrationCopyMock = {},
): Promise<void> {
  const summary = { today: copy.today ?? '2027-02-10', byYear: [] };
  for (const part of ['donations', 'donors'] as const) {
    const chunks = await Promise.all(
      (copy[part] ?? []).map(async ({ id, rows }) => ({
        id,
        rowsSha256: await rowsSha256(rows),
        count: rows.length,
        rows,
      })),
    );
    const head = {
      subject: administrator.id,
      administrator: true,
      ...(part === 'donations' ? { summary } : {}),
    };
    await target.route(
      (url) => url.pathname === `/api/admin/${part}/sync`,
      (route) =>
        route.fulfill({
          json: {
            ...head,
            chunks: chunks.map(({ id, rowsSha256, count }) => ({ id, rowsSha256, count })),
          },
        }),
    );
    await target.route(
      (url) => url.pathname === `/api/admin/${part}/sync/chunks`,
      (route) => {
        const asked = (new URL(route.request().url()).searchParams.get('ids') ?? '').split(',');
        return route.fulfill({
          json: {
            ...head,
            chunks: chunks.filter((chunk) => asked.includes(chunk.id)),
            missing: asked.filter((id) => !chunks.some((chunk) => chunk.id === id)),
          },
        });
      },
    );
  }
}
