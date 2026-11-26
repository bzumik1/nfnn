import { ERROR_KINDS, ERROR_NAMES, ERROR_PLACES } from '../errors/error-vocabulary';
import { field, oneOf, record, whole } from './diagnostic-reading';

export const MAX_EVENTS = 50;
export const MAX_SECONDS_AGO = 86_400;

export const DIAGNOSTIC_ONLY_KINDS = ['copy-sync'] as const;
export const PDF_LOAD_DETAILS = ['tools-missing', 'fonts'] as const;
export const PDF_RENDER_DETAILS = ['image', 'drawing', 'style'] as const;
export const SYNC_DETAILS = ['stored', 'failed', 'mismatch', 'no-copy'] as const;

export type DiagnosticEventKind =
  (typeof ERROR_KINDS)[number] | (typeof DIAGNOSTIC_ONLY_KINDS)[number];
export type EventDetail =
  | (typeof PDF_LOAD_DETAILS)[number]
  | (typeof PDF_RENDER_DETAILS)[number]
  | (typeof SYNC_DETAILS)[number];

export interface DiagnosticEvent {
  readonly secondsAgo: number;
  readonly kind: DiagnosticEventKind;
  readonly place: (typeof ERROR_PLACES)[number] | null;
  readonly name: (typeof ERROR_NAMES)[number] | null;
  readonly detail: EventDetail | null;
}

const ERROR_EVENT_KINDS: readonly string[] = ERROR_KINDS;
const DETAILS_OF_KIND: Readonly<Record<string, readonly string[]>> = {
  'pdf-load': PDF_LOAD_DETAILS,
  'pdf-render': PDF_RENDER_DETAILS,
  'copy-sync': SYNC_DETAILS,
};

export function sanitizedEvent(value: unknown, age?: number): DiagnosticEvent | null {
  const part = record(value);
  const secondsAgo = whole(age ?? field(part, 'secondsAgo'), MAX_SECONDS_AGO);
  const kind = oneOf<DiagnosticEventKind>(
    [...ERROR_KINDS, ...DIAGNOSTIC_ONLY_KINDS],
    field(part, 'kind'),
  );
  if (secondsAgo === null || kind === null) {
    return null;
  }
  const fromReporter = ERROR_EVENT_KINDS.includes(kind);
  return {
    secondsAgo,
    kind,
    place: fromReporter ? oneOf(ERROR_PLACES, field(part, 'place')) : null,
    name: fromReporter ? oneOf(ERROR_NAMES, field(part, 'name')) : null,
    detail: oneOf<EventDetail>(
      (DETAILS_OF_KIND[kind] ?? []) as readonly EventDetail[],
      field(part, 'detail'),
    ),
  };
}
