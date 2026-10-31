/// <reference types="@angular/localize" />

import { ReceiptSigningKeyMismatch, ReceiptSigningKeysResponse } from '../../admin-api';

export function withdrawnCurrentKeyId(answer: ReceiptSigningKeysResponse): string | null {
  const current = answer.keys.find((key) => key.current);
  return current?.status === 'revoked' ? current.keyId : null;
}

export function withdrawnCurrentKeySentence(keyId: string): string {
  return $localize`:@@admin.signingKey.currentWithdrawn:Klíč serveru ${keyId}:key: je stažený a server zatím nemá nový, takže se potvrzení o daru teď nestáhnou. Nový klíč si server vytvoří při startu; když se to nestane do pár minut, obraťte se na technika serveru.`;
}

export function mismatchSentence(mismatch: ReceiptSigningKeyMismatch): string {
  return mismatch.kind === 'reverted'
    ? $localize`:@@admin.signingKey.mismatch.reverted:Klíč ${mismatch.keyId}:key: byl ve správě stažený, ale jeho záznam v databázi je znovu aktivní (změna mimo web nebo obnova starší zálohy). Web ho dál zveřejňuje jako stažený; stáhněte ho prosím znovu a obraťte se na technika serveru.`
    : $localize`:@@admin.signingKey.mismatch.missing:Klíč ${mismatch.keyId}:key: je v historii správy, ale jeho záznam v databázi chybí (změna mimo web). QR kódy jím podepsané se neověří; obraťte se na technika serveru.`;
}

export function signingKeyWarnings(answer: ReceiptSigningKeysResponse): string[] {
  const withdrawn = withdrawnCurrentKeyId(answer);
  return [
    ...(withdrawn === null ? [] : [withdrawnCurrentKeySentence(withdrawn)]),
    ...answer.auditMismatches.map(mismatchSentence),
  ];
}
