/// <reference types="@angular/localize" />

import { pluralCategory } from '../../../../core/i18n/plural-category';

export function unpublishedKeysSentence(keyIds: readonly string[]): string {
  const keys = keyIds.join(', ');
  return pluralCategory(keyIds.length) === 'one'
    ? $localize`:@@admin.signingKey.unpublished.one:Klíč ${keys}:keys: neprošel kontrolou pečeti, proto ho web nezveřejňuje a QR kódy jím podepsané se neověří. Záznam v databázi se změnil mimo web; obraťte se na technika serveru.`
    : $localize`:@@admin.signingKey.unpublished.other:Klíče ${keys}:keys: neprošly kontrolou pečeti, proto je web nezveřejňuje a QR kódy jimi podepsané se neověří. Záznam v databázi se změnil mimo web; obraťte se na technika serveru.`;
}
