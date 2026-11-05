import { TrustedTypesFactory, installScriptUrlPolicy } from './trusted-types';

installScriptUrlPolicy(
  (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes,
  document.baseURI,
);
