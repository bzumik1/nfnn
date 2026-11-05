import { QrMatrix } from '../qr-code/qr-matrix';

export interface ZoomPhoto {
  readonly kind: 'photo';
  readonly src: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ZoomQr {
  readonly kind: 'qr';
  readonly matrix: QrMatrix;
  readonly label: string;
}

export type ZoomContent = ZoomPhoto | ZoomQr;
