/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReceiptSignatureResponse, SignatureVectorPath } from '../admin-api';

const HEX_FILL = /^#[0-9a-f]{6}$/;
const BLACK = '#000000';

@Component({
  selector: 'app-signature-artwork',
  templateUrl: './signature-artwork.html',
  styleUrl: './signature-artwork.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignatureArtwork {
  readonly signature = input.required<ReceiptSignatureResponse>();
  readonly label = input($localize`:@@admin.signature.alt:Nahraný podpis`);

  protected viewBox(viewBox: number[]): string {
    return viewBox.join(' ');
  }

  protected fill(path: SignatureVectorPath): string {
    return HEX_FILL.test(path.fill) ? path.fill : BLACK;
  }
}
