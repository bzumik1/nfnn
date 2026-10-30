export const ERROR_KINDS = [
  'unexpected',
  'chunk-load',
  'pdf-render',
  'pdf-load',
  'qr-encode',
  'verify-parse',
  'verify-signature',
] as const;

export const ERROR_PLACES = ['global', 'navigation'] as const;

export const ERROR_NAMES = [
  'Error',
  'AggregateError',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'AbortError',
  'DataCloneError',
  'DataError',
  'EncodingError',
  'InvalidAccessError',
  'InvalidCharacterError',
  'InvalidStateError',
  'NetworkError',
  'NotAllowedError',
  'NotFoundError',
  'NotReadableError',
  'NotSupportedError',
  'OperationError',
  'QuotaExceededError',
  'SecurityError',
  'TimeoutError',
  'UnknownError',
  'HttpErrorResponse',
  'Other',
] as const;

export const BROWSERS = ['chrome', 'edge', 'firefox', 'safari', 'samsung', 'opera', 'other'] as const;

export const OPERATING_SYSTEMS = [
  'android',
  'ios',
  'ipados',
  'macos',
  'windows',
  'linux',
  'other',
] as const;

export const DISPLAY_MODES = ['browser', 'standalone'] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];
export type ErrorPlace = (typeof ERROR_PLACES)[number];
export type ErrorName = (typeof ERROR_NAMES)[number];
export type Browser = (typeof BROWSERS)[number];
export type OperatingSystem = (typeof OPERATING_SYSTEMS)[number];
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const ERROR_VOCABULARY = {
  kinds: ERROR_KINDS,
  places: ERROR_PLACES,
  names: ERROR_NAMES,
  browsers: BROWSERS,
  operatingSystems: OPERATING_SYSTEMS,
  displayModes: DISPLAY_MODES,
} as const;
