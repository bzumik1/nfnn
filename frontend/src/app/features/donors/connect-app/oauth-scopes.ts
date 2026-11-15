/// <reference types="@angular/localize" />

import { OAuthScope } from '../../../core/auth/donor';

export const WRITE_SCOPE: OAuthScope = 'admin:write';

export const SCOPE_LABELS: Record<OAuthScope, string> = {
  'admin:read': $localize`:@@donor.connect.scope.read:Čtení: stav importu a verze, dary a dárci, správci, zálohy, historie správy, nastavení reportu, aktuality a příběhy, logy a diagnostika`,
  'admin:write': $localize`:@@donor.connect.scope.write:Změny: přiřazení a odpárování plateb, první potvrzení o daru, měsíční report, zálohy a jejich plán, aktuality, příběhy, O nás a pruh Přispět, lidé fondu a jejich podpisy, nastavení webu kromě tajných údajů, adresy webu a pošty, loga bank, účty dárců, načtení starších plateb, upozornění zařízení, dočasná úroveň logování`,
};

export const SCOPE_ABILITIES: Record<OAuthScope, readonly string[]> = {
  'admin:read': [
    $localize`:@@donor.connect.ability.donors:vidět dárce, jejich dary a platby z banky`,
    $localize`:@@donor.connect.ability.content:vidět aktuality a příběhy`,
    $localize`:@@donor.connect.ability.administrators:vidět správce a historii změn ve správě`,
    $localize`:@@donor.connect.ability.report:vidět nastavení měsíčního reportu`,
    $localize`:@@donor.connect.ability.operations:vidět stav záloh a provozní záznamy webu`,
  ],
  'admin:write': [
    $localize`:@@donor.connect.ability.pairing:přiřadit platbu dárci, zrušit přiřazení a spárovat platby podle účtů dárců`,
    $localize`:@@donor.connect.ability.receipts:vystavit dárci první potvrzení o daru`,
    $localize`:@@donor.connect.ability.sendReport:nastavit a odeslat měsíční report`,
    $localize`:@@donor.connect.ability.backup:vyžádat si novou zálohu a změnit plán záloh`,
    $localize`:@@donor.connect.ability.publish:psát a zveřejňovat aktuality a příběhy, upravit stránku O nás a pruh Přispět včetně odebrání fotky`,
    $localize`:@@donor.connect.ability.people:upravit lidi fondu, jejich podpis včetně podpisu na potvrzeních, a lidi i odebrat`,
    $localize`:@@donor.connect.ability.settings:měnit nastavení webu kromě tajných údajů, adresy webu, pošty a příjemců reportu`,
    $localize`:@@donor.connect.ability.bank:nastavit loga bank, odpojit a znovu připojit účet dárce a načíst starší platby z banky`,
    $localize`:@@donor.connect.ability.logLevel:dočasně zapnout podrobnější provozní záznamy a měnit upozornění na zařízeních správců`,
  ],
};

export function knownScopes(scope: string | null): OAuthScope[] {
  return (scope ?? '')
    .split(/\s+/)
    .filter((candidate): candidate is OAuthScope => Object.hasOwn(SCOPE_LABELS, candidate));
}

export function describeScopes(scopes: readonly OAuthScope[]): string[] {
  return scopes.map((scope) => SCOPE_LABELS[scope]);
}
