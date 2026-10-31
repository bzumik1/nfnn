/// <reference types="@angular/localize" />

import { pluralCategory } from '../../../../core/i18n/plural-category';
import { ReceiptSigningKeysResponse } from '../../admin-api';

export function unpublishedKeyIds(answer: ReceiptSigningKeysResponse): string[] {
  const ids = answer.keys.filter((key) => !key.published).map((key) => key.keyId);
  return answer.currentKeyPublished || ids.includes(answer.currentKeyId)
    ? ids
    : [...ids, answer.currentKeyId];
}

export function unpublishedKeysSentence(keyIds: readonly string[]): string {
  const keys = keyIds.join(', ');
  return pluralCategory(keyIds.length) === 'one'
    ? $localize`:@@admin.signingKey.unpublished.one:Klíč ${keys}:keys: není zveřejněný, proto se QR kódy jím podepsané neověří. Jeho záznam v databázi chybí nebo neprošel kontrolou pečeti (změna mimo web nebo záloha jiného serveru, kterou server nepřevzal); obraťte se na technika serveru.`
    : $localize`:@@admin.signingKey.unpublished.other:Klíče ${keys}:keys: nejsou zveřejněné, proto se QR kódy jimi podepsané neověří. Jejich záznamy v databázi chybí nebo neprošly kontrolou pečeti (změna mimo web nebo záloha jiného serveru, kterou server nepřevzal); obraťte se na technika serveru.`;
}
