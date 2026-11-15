/// <reference types="@angular/localize" />

import { formatBankTime } from '../../../donations/donation-date';
import {
  ReceiptSigningKeyMismatch,
  ReceiptSigningKeysResponse,
  ReceiptSigningKeyUnreadableEntry,
} from '../../admin-api';

export function withdrawnCurrentKeyId(answer: ReceiptSigningKeysResponse): string | null {
  const current = answer.keys.find((key) => key.current);
  return current?.status === 'revoked' ? current.keyId : null;
}

export function withdrawnCurrentKeySentence(keyId: string): string {
  return $localize`:@@admin.signingKey.currentWithdrawn:Klíč serveru ${keyId}:key: je zneplatněný a server zatím nemá nový, takže se potvrzení o daru teď nestáhnou. Nový klíč si server vytvoří při startu; když se to nestane do pár minut, obraťte se na technika serveru.`;
}

export function mismatchSentence(mismatch: ReceiptSigningKeyMismatch): string {
  return mismatch.kind === 'reverted'
    ? $localize`:@@admin.signingKey.mismatch.reverted:Klíč ${mismatch.keyId}:key: byl ve správě zneplatněný, ale jeho záznam v databázi je znovu aktivní (změna mimo web nebo obnova starší zálohy). Web ho dál zveřejňuje jako zneplatněný; zneplatněte ho prosím znovu a obraťte se na technika serveru.`
    : $localize`:@@admin.signingKey.mismatch.missing:Klíč ${mismatch.keyId}:key: je v historii správy, ale jeho záznam v databázi chybí (změna mimo web). QR kódy jím podepsané se neověří; obraťte se na technika serveru.`;
}

export function unreadableEntrySentence(entry: ReceiptSigningKeyUnreadableEntry): string {
  const performedAt = formatBankTime(entry.performedAt);
  return $localize`:@@admin.signingKey.unreadableEntry:Záznam „${keyActionName(entry.action)}:action:“ z ${performedAt}:performedAt: v Historii změn neodpovídá žádnému známému znění, takže podle něj web nemůže zkontrolovat klíče k ověřovacím QR kódům. Obraťte se na technika serveru.`;
}

export function auditSentences(answer: ReceiptSigningKeysResponse): string[] {
  return [
    ...answer.auditMismatches.map(mismatchSentence),
    ...(answer.unreadableAuditEntries ?? []).map(unreadableEntrySentence),
  ];
}

export function signingKeyWarnings(answer: ReceiptSigningKeysResponse): string[] {
  const withdrawn = withdrawnCurrentKeyId(answer);
  return [
    ...(withdrawn === null ? [] : [withdrawnCurrentKeySentence(withdrawn)]),
    ...auditSentences(answer),
  ];
}

function keyActionName(action: string): string {
  switch (action) {
    case 'REGISTER_RECEIPT_SIGNING_KEY':
      return $localize`:@@admin.signingKey.unreadableEntry.register:Registrace klíče`;
    case 'ADOPT_RECEIPT_SIGNING_KEY':
      return $localize`:@@admin.signingKey.unreadableEntry.adopt:Převzetí klíče ze zálohy`;
    case 'WITHDRAW_RECEIPT_SIGNING_KEY':
      return $localize`:@@admin.signingKey.unreadableEntry.withdraw:Zneplatnění klíče`;
    default:
      return $localize`:@@admin.signingKey.unreadableEntry.other:Klíč k ověřovacím QR kódům`;
  }
}
