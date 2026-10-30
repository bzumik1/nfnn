declare const NFNN_APP_REVISION: string | undefined;

export const APP_REVISION: string =
  typeof NFNN_APP_REVISION === 'string' ? NFNN_APP_REVISION : 'dev';
