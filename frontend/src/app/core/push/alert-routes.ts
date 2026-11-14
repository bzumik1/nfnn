export const ALERTS_PAGE = '/sprava/upozorneni';

export const MAX_OPEN_ALERT_COUNT = 999;

const ROUTE_OF_KIND: Readonly<Record<string, string>> = {
  test: ALERTS_PAGE,
  'bank-import-outage': '/sprava',
  'bank-import-recovered': '/sprava',
  'backups-outage': '/sprava/zalohy',
  'backups-recovered': '/sprava/zalohy',
  'mail-outage': '/sprava/nastaveni',
  'mail-recovered': '/sprava/nastaveni',
  'donor-test': '/darce/udaje',
  'gift-arrived': '/darce/dary',
  'yearly-receipt-ready': '/darce/potvrzeni',
};

export function routeOfAlert(data: unknown): string {
  const kind = fieldOf(data, 'kind');
  return typeof kind === 'string' && Object.hasOwn(ROUTE_OF_KIND, kind)
    ? ROUTE_OF_KIND[kind]
    : ALERTS_PAGE;
}

export function openAlertCountOf(message: unknown): number | null {
  const count = fieldOf(message, 'count');
  return typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= 0 &&
    count <= MAX_OPEN_ALERT_COUNT
    ? count
    : null;
}

function fieldOf(value: unknown, name: string): unknown {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)[name]
    : undefined;
}
