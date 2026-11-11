import {
  BROWSERS,
  DISPLAY_MODES,
  ERROR_KINDS,
  ERROR_NAMES,
  ERROR_PLACES,
  OPERATING_SYSTEMS,
} from '../errors/error-vocabulary';

export const DIAGNOSTICS_FORMAT = 'nfnn-diagnostics';
export const DIAGNOSTICS_VERSION = 1;
export const MAX_EVENTS = 50;
export const MAX_SECONDS_AGO = 86_400;
export const MAX_BOOT_WAIT_SECONDS = 600;
export const MAX_MAJOR = 999;
export const MAX_SERVICE_WORKERS = 9;
export const MAX_CACHES = 99;

export const DIAGNOSTIC_SOURCES = ['boot-panel', 'receipt-pdf', 'account-page'] as const;

export const DIAGNOSTIC_PAGES = [
  '/',
  '/aktuality',
  '/aktuality/:param',
  '/aplikace',
  '/darce',
  '/darce/dary',
  '/darce/potvrzeni',
  '/darce/prehled',
  '/darce/ucty',
  '/darce/udaje',
  '/donor',
  '/donor/dary',
  '/donor/potvrzeni',
  '/donor/prehled',
  '/donor/ucty',
  '/donor/udaje',
  '/o-nas',
  '/obnova-hesla',
  '/overit',
  '/potvrzeni-emailu',
  '/pripojeni',
  '/prispet',
  '/projekty',
  '/projekty/:param',
  '/prvni-nastaveni',
  '/sprava',
  '/sprava/aktuality',
  '/sprava/aktuality/:param',
  '/sprava/aktuality/nova',
  '/sprava/darci',
  '/sprava/darci/:param',
  '/sprava/darci/:param/:param',
  '/sprava/historie',
  '/sprava/hromadna-potvrzeni',
  '/sprava/lide-fondu',
  '/sprava/logy',
  '/sprava/logy/soubor',
  '/sprava/logy/soubory',
  '/sprava/logy/stav',
  '/sprava/logy/urovne',
  '/sprava/logy/vlakna',
  '/sprava/nastaveni',
  '/sprava/o-nas',
  '/sprava/platby',
  '/sprava/prehledy',
  '/sprava/prehledy/:param',
  '/sprava/projekty',
  '/sprava/projekty/:param',
  '/sprava/projekty/nova',
  '/sprava/spravci',
  '/sprava/starsi-symboly',
  '/sprava/upozorneni',
  '/sprava/vice',
  '/sprava/zalohy',
  '/sprava/zalohy/historie',
  '/zasady-ochrany-osobnich-udaju',
] as const;

export const OTHER_PAGE = 'other';
export const OFFLINE_CAUSES = ['network', 'server'] as const;
export const SUPPORT_FEATURES = [
  'serviceWorker',
  'indexedDb',
  'webLocks',
  'broadcastChannel',
  'subtleCrypto',
  'webAuthn',
  'webAssembly',
  'storageManager',
  'trustedTypes',
] as const;
export const RELOAD_REASONS = ['boot', 'chunk-load', 'update', 'unrecoverable'] as const;
export const SESSION_ACCOUNTS = ['none', 'donor', 'administrator', 'signed-in', 'unknown'] as const;
export const SESSION_KINDS = ['APP', 'REMEMBERED', 'BROWSER', 'PUBLIC'] as const;
export const COPY_MODES = ['stored', 'memory'] as const;
export const DONOR_COPY_STATES = ['none', 'open', 'locked'] as const;
export const ADMINISTRATION_COPY_STATES = ['none', 'locked', 'open'] as const;
export const AGE_BUCKETS = ['under-1h', 'under-1d', 'under-7d', 'under-30d', 'older'] as const;
export const DIAGNOSTIC_ONLY_KINDS = ['copy-sync'] as const;
export const PDF_LOAD_DETAILS = ['tools-missing', 'fonts'] as const;
export const PDF_RENDER_DETAILS = ['image', 'drawing', 'style'] as const;
export const SYNC_DETAILS = ['stored', 'failed', 'mismatch', 'no-copy'] as const;

export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number];
export type DiagnosticPage = (typeof DIAGNOSTIC_PAGES)[number] | typeof OTHER_PAGE;
export type SupportFeature = (typeof SUPPORT_FEATURES)[number];
export type ReloadReasonName = (typeof RELOAD_REASONS)[number];
export type SessionAccount = (typeof SESSION_ACCOUNTS)[number];
export type DiagnosticSessionKind = (typeof SESSION_KINDS)[number];
export type CopyMode = (typeof COPY_MODES)[number];
export type DonorCopyState = (typeof DONOR_COPY_STATES)[number];
export type AdministrationCopyState = (typeof ADMINISTRATION_COPY_STATES)[number];
export type AgeBucket = (typeof AGE_BUCKETS)[number];
export type DiagnosticEventKind =
  (typeof ERROR_KINDS)[number] | (typeof DIAGNOSTIC_ONLY_KINDS)[number];
export type EventDetail =
  | (typeof PDF_LOAD_DETAILS)[number]
  | (typeof PDF_RENDER_DETAILS)[number]
  | (typeof SYNC_DETAILS)[number];

type Nullable<T> = { readonly [K in keyof T]: T[K] | null };

export interface DiagnosticEvent {
  readonly secondsAgo: number;
  readonly kind: DiagnosticEventKind;
  readonly place: (typeof ERROR_PLACES)[number] | null;
  readonly name: (typeof ERROR_NAMES)[number] | null;
  readonly detail: EventDetail | null;
}

export interface BootAttempt {
  readonly panelShown: boolean;
  readonly codeArrived: boolean;
  readonly waitedSeconds: number;
  readonly secondsAgo: number;
}

export interface DiagnosticsFile {
  readonly format: typeof DIAGNOSTICS_FORMAT;
  readonly version: typeof DIAGNOSTICS_VERSION;
  readonly createdAt: string | null;
  readonly source: DiagnosticSource | null;
  readonly app: Nullable<{
    revision: string;
    bundle: string;
    started: boolean;
    codeArrived: boolean;
  }> | null;
  readonly platform: Nullable<{
    browser: (typeof BROWSERS)[number];
    browserMajor: number;
    os: (typeof OPERATING_SYSTEMS)[number];
    display: (typeof DISPLAY_MODES)[number];
  }> | null;
  readonly page: DiagnosticPage;
  readonly network: Nullable<{
    browserOnline: boolean;
    appOffline: boolean;
    offlineCause: (typeof OFFLINE_CAUSES)[number];
  }> | null;
  readonly support: Readonly<Record<SupportFeature, boolean | null>> | null;
  readonly storage: Nullable<{ persisted: boolean; nearlyFull: boolean }> | null;
  readonly serviceWorker: Nullable<{
    controlled: boolean;
    registrations: number;
    active: number;
    waiting: number;
    installing: number;
    caches: number;
  }> | null;
  readonly reloads: Readonly<Record<ReloadReasonName, number | null>> | null;
  readonly boot: {
    readonly recovered: boolean | null;
    readonly previous: BootAttempt | null;
  } | null;
  readonly session: Nullable<{
    account: SessionAccount;
    kind: DiagnosticSessionKind;
    administrationUnlocked: boolean;
  }> | null;
  readonly deviceCopy: Nullable<{
    mode: CopyMode;
    donor: DonorCopyState;
    storedAge: AgeBucket;
    administration: AdministrationCopyState;
  }> | null;
  readonly events: readonly DiagnosticEvent[];
}

const REVISION = /^(?:[0-9a-f]{7,40}|dev|unknown)$/;
const BUNDLE = /^main-[A-Z0-9]{8}\.js$/;
const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
const ERROR_EVENT_KINDS: readonly string[] = ERROR_KINDS;
const DETAILS_OF_KIND: Readonly<Record<string, readonly string[]>> = {
  'pdf-load': PDF_LOAD_DETAILS,
  'pdf-render': PDF_RENDER_DETAILS,
  'copy-sync': SYNC_DETAILS,
};
const PAGE_PATTERNS = DIAGNOSTIC_PAGES.map(
  (page) => [page, new RegExp(`^${page.replaceAll(':param', '[^/]+')}$`)] as const,
);
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

type Reading = Readonly<Record<string, unknown>>;

function record(value: unknown): Reading | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Reading;
}

function field(from: Reading | null, key: string): unknown {
  return from !== null && Object.prototype.hasOwnProperty.call(from, key) ? from[key] : undefined;
}

function section(from: Reading | null, key: string): Reading | null {
  return record(field(from, key));
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function whole(value: unknown, max: number, min = 0): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function matching(pattern: RegExp, value: unknown): string | null {
  return typeof value === 'string' && pattern.test(value) ? value : null;
}

function sectionOrNull<T>(from: Reading | null, key: string, read: (part: Reading) => T): T | null {
  const part = section(from, key);
  return part === null ? null : read(part);
}

function bootAttempt(part: Reading | null): BootAttempt | null {
  if (part === null) {
    return null;
  }
  const panelShown = bool(field(part, 'panelShown'));
  const codeArrived = bool(field(part, 'codeArrived'));
  const waitedSeconds = whole(field(part, 'waitedSeconds'), MAX_BOOT_WAIT_SECONDS);
  const secondsAgo = whole(field(part, 'secondsAgo'), MAX_SECONDS_AGO);
  if (
    panelShown === null ||
    codeArrived === null ||
    waitedSeconds === null ||
    secondsAgo === null
  ) {
    return null;
  }
  return { panelShown, codeArrived, waitedSeconds, secondsAgo };
}

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

function events(value: unknown): DiagnosticEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(-MAX_EVENTS)
    .map((event) => sanitizedEvent(event))
    .filter((event): event is DiagnosticEvent => event !== null);
}

export function sanitizedDiagnostics(raw: unknown): DiagnosticsFile {
  const file = record(raw);
  return {
    format: DIAGNOSTICS_FORMAT,
    version: DIAGNOSTICS_VERSION,
    createdAt: matching(CREATED_AT, field(file, 'createdAt')),
    source: oneOf(DIAGNOSTIC_SOURCES, field(file, 'source')),
    app: sectionOrNull(file, 'app', (app) => ({
      revision: matching(REVISION, field(app, 'revision')),
      bundle: matching(BUNDLE, field(app, 'bundle')),
      started: bool(field(app, 'started')),
      codeArrived: bool(field(app, 'codeArrived')),
    })),
    platform: sectionOrNull(file, 'platform', (platform) => ({
      browser: oneOf(BROWSERS, field(platform, 'browser')),
      browserMajor: whole(field(platform, 'browserMajor'), MAX_MAJOR, 1),
      os: oneOf(OPERATING_SYSTEMS, field(platform, 'os')),
      display: oneOf(DISPLAY_MODES, field(platform, 'display')),
    })),
    page: oneOf(DIAGNOSTIC_PAGES, field(file, 'page')) ?? OTHER_PAGE,
    network: sectionOrNull(file, 'network', (network) => ({
      browserOnline: bool(field(network, 'browserOnline')),
      appOffline: bool(field(network, 'appOffline')),
      offlineCause: oneOf(OFFLINE_CAUSES, field(network, 'offlineCause')),
    })),
    support: sectionOrNull(
      file,
      'support',
      (support) =>
        Object.fromEntries(
          SUPPORT_FEATURES.map((feature) => [feature, bool(field(support, feature))]),
        ) as Readonly<Record<SupportFeature, boolean | null>>,
    ),
    storage: sectionOrNull(file, 'storage', (storage) => ({
      persisted: bool(field(storage, 'persisted')),
      nearlyFull: bool(field(storage, 'nearlyFull')),
    })),
    serviceWorker: sectionOrNull(file, 'serviceWorker', (workers) => ({
      controlled: bool(field(workers, 'controlled')),
      registrations: whole(field(workers, 'registrations'), MAX_SERVICE_WORKERS),
      active: whole(field(workers, 'active'), MAX_SERVICE_WORKERS),
      waiting: whole(field(workers, 'waiting'), MAX_SERVICE_WORKERS),
      installing: whole(field(workers, 'installing'), MAX_SERVICE_WORKERS),
      caches: whole(field(workers, 'caches'), MAX_CACHES),
    })),
    reloads: sectionOrNull(
      file,
      'reloads',
      (reloads) =>
        Object.fromEntries(
          RELOAD_REASONS.map((reason) => [reason, whole(field(reloads, reason), MAX_SECONDS_AGO)]),
        ) as Readonly<Record<ReloadReasonName, number | null>>,
    ),
    boot: sectionOrNull(file, 'boot', (boot) => ({
      recovered: bool(field(boot, 'recovered')),
      previous: bootAttempt(section(boot, 'previous')),
    })),
    session: sectionOrNull(file, 'session', (session) => ({
      account: oneOf(SESSION_ACCOUNTS, field(session, 'account')),
      kind: oneOf(SESSION_KINDS, field(session, 'kind')),
      administrationUnlocked: bool(field(session, 'administrationUnlocked')),
    })),
    deviceCopy: sectionOrNull(file, 'deviceCopy', (copy) => ({
      mode: oneOf(COPY_MODES, field(copy, 'mode')),
      donor: oneOf(DONOR_COPY_STATES, field(copy, 'donor')),
      storedAge: oneOf(AGE_BUCKETS, field(copy, 'storedAge')),
      administration: oneOf(ADMINISTRATION_COPY_STATES, field(copy, 'administration')),
    })),
    events: events(field(file, 'events')),
  };
}

export function pageOf(path: string): DiagnosticPage {
  return PAGE_PATTERNS.find(([, pattern]) => pattern.test(path))?.[0] ?? OTHER_PAGE;
}

export function ageBucket(ageMs: number | null): AgeBucket | null {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) {
    return null;
  }
  if (ageMs < HOUR_MS) {
    return 'under-1h';
  }
  if (ageMs < DAY_MS) {
    return 'under-1d';
  }
  if (ageMs < 7 * DAY_MS) {
    return 'under-7d';
  }
  if (ageMs < 30 * DAY_MS) {
    return 'under-30d';
  }
  return 'older';
}

export function createdAtOf(now: Date): string {
  return `${now.toISOString().slice(0, 16)}Z`;
}

export function diagnosticsFileName(now: Date): string {
  const minute = now.toISOString().slice(0, 16);
  return `nfnn-diagnostika-${minute.slice(0, 10)}-${minute.slice(11, 13)}${minute.slice(14, 16)}.json`;
}
