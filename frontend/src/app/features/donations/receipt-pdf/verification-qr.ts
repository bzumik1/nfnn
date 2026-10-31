import {
  byteSegment,
  encodeSegments,
  numericSegment,
  QrSymbol,
  smallestVersion,
} from '../../../shared/ui/qr-code/qr-encoder';

export const VERIFICATION_ADDRESS = 'https://nfnn.cz/overit#';
export const LAST_VERSION_AT_MEDIUM = 13;
export const INLINE_SYMBOL_MM = 35;
export const MINIMUM_INLINE_MODULE_MM = 0.5;
export const MINIMUM_OWN_AREA_MODULE_MM = 0.6;
export const OWN_AREA_MODULE_MM = 0.8;
export const OWN_AREA_SYMBOL_MM = 100;

export interface QrPlacement {
  readonly area: 'inline' | 'own';
  readonly moduleMm: number;
  readonly symbolMm: number;
}

export function verificationSymbol(qrText: string): QrSymbol {
  const digits = qrText.slice(VERIFICATION_ADDRESS.length);
  if (!qrText.startsWith(VERIFICATION_ADDRESS) || !/^\d+$/.test(digits)) {
    throw new Error('The text is not a verification proof of the foundation.');
  }
  const segments = [byteSegment(VERIFICATION_ADDRESS), numericSegment(digits)];
  const medium = smallestVersion(segments, 'M');
  return medium !== null && medium <= LAST_VERSION_AT_MEDIUM
    ? encodeSegments(segments, 'M')
    : encodeSegments(segments, 'L', LAST_VERSION_AT_MEDIUM + 1);
}

export function qrPlacement(symbol: QrSymbol): QrPlacement {
  if (symbol.version <= LAST_VERSION_AT_MEDIUM) {
    return { area: 'inline', moduleMm: INLINE_SYMBOL_MM / symbol.size, symbolMm: INLINE_SYMBOL_MM };
  }
  const moduleMm = Math.max(
    MINIMUM_OWN_AREA_MODULE_MM,
    Math.min(OWN_AREA_MODULE_MM, OWN_AREA_SYMBOL_MM / symbol.size),
  );
  return { area: 'own', moduleMm, symbolMm: moduleMm * symbol.size };
}
