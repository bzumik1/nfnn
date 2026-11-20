/// <reference types="@angular/localize" />

import { OAuthScope } from '../../../core/auth/donor';

export const WRITE_SCOPE: OAuthScope = 'admin:write';

export const SCOPE_LABELS: Record<OAuthScope, string> = {
  'admin:read': $localize`:@@donor.connect.scope.read:Čtení: stav importu a\u00a0verze, dary a\u00a0dárci, správci, zálohy, historie správy, nastavení reportu, aktuality a\u00a0příběhy, logy a\u00a0diagnostika`,
  'admin:write': $localize`:@@donor.connect.scope.write:Změny: přiřazení a\u00a0odpárování plateb, první potvrzení o\u00a0daru, měsíční report, zálohy a\u00a0jejich plán, aktuality, příběhy, O\u00a0nás a\u00a0pruh Přispět, lidé fondu a\u00a0jejich podpisy, nastavení webu kromě tajných údajů, adresy webu a\u00a0pošty, loga bank, účty dárců, načtení starších plateb, upozornění zařízení, dočasná úroveň logování`,
};

export const SCOPE_ABILITIES: Record<OAuthScope, readonly string[]> = {
  'admin:read': [
    $localize`:@@donor.connect.ability.donors:vidět dárce, jejich dary a\u00a0platby z\u00a0banky`,
    $localize`:@@donor.connect.ability.content:vidět aktuality a\u00a0příběhy`,
    $localize`:@@donor.connect.ability.administrators:vidět správce a\u00a0historii změn ve správě`,
    $localize`:@@donor.connect.ability.report:vidět nastavení měsíčního reportu`,
    $localize`:@@donor.connect.ability.operations:vidět stav záloh a\u00a0provozní záznamy webu`,
  ],
  'admin:write': [
    $localize`:@@donor.connect.ability.pairing:přiřadit platbu dárci, zrušit přiřazení a\u00a0spárovat platby podle účtů dárců`,
    $localize`:@@donor.connect.ability.receipts:vystavit dárci první potvrzení o\u00a0daru`,
    $localize`:@@donor.connect.ability.sendReport:nastavit a\u00a0odeslat měsíční report`,
    $localize`:@@donor.connect.ability.backup:vyžádat si novou zálohu a\u00a0změnit plán záloh`,
    $localize`:@@donor.connect.ability.publish:psát a\u00a0zveřejňovat aktuality a\u00a0příběhy, upravit stránku O\u00a0nás a\u00a0pruh Přispět včetně odebrání fotky`,
    $localize`:@@donor.connect.ability.people:upravit lidi fondu, jejich podpis včetně podpisu na potvrzeních, a\u00a0lidi i\u00a0odebrat`,
    $localize`:@@donor.connect.ability.settings:měnit nastavení webu kromě tajných údajů, adresy webu, pošty a\u00a0příjemců reportu`,
    $localize`:@@donor.connect.ability.bank:nastavit loga bank, odpojit a\u00a0znovu připojit účet dárce a\u00a0načíst starší platby z\u00a0banky`,
    $localize`:@@donor.connect.ability.logLevel:dočasně zapnout podrobnější provozní záznamy a\u00a0měnit upozornění na zařízeních správců`,
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
