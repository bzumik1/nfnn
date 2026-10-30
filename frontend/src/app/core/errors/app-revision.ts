declare const NFNN_APP_REVISION: string | undefined;

const ACCEPTED_REVISION = /^(?:[0-9a-f]{7,40}|dev)$/;

export function revisionOf(value: unknown): string {
  return typeof value === 'string' && ACCEPTED_REVISION.test(value) ? value : 'dev';
}

export const APP_REVISION: string = revisionOf(
  typeof NFNN_APP_REVISION === 'undefined' ? undefined : NFNN_APP_REVISION,
);
