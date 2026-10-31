import { QrSymbol } from '../../../shared/ui/qr-code/qr-encoder';

export const VERIFICATION_ADDRESS = 'https://nfnn.cz/overit#';
export const LAST_VERSION_AT_MEDIUM = 13;
export const INLINE_SYMBOL_MM = 35;
export const MINIMUM_INLINE_MODULE_MM = 0.5;
export const MINIMUM_OWN_AREA_MODULE_MM = 0.6;

export interface QrPlacement {
  readonly area: 'inline' | 'own';
  readonly moduleMm: number;
  readonly symbolMm: number;
}

export function verificationSymbol(qrText: string): QrSymbol {
  throw new Error(`not implemented ${qrText}`);
}

export function qrPlacement(symbol: QrSymbol): QrPlacement {
  throw new Error(`not implemented ${symbol.version}`);
}
