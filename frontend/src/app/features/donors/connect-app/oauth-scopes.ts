/// <reference types="@angular/localize" />

import { OAuthScope } from '../../../core/auth/donor';

export const WRITE_SCOPE: OAuthScope = 'admin:write';

export const SCOPE_LABELS: Record<OAuthScope, string> = {
  'admin:read': $localize`:@@donor.connect.scope.read:Čtení: stav importu a verze, dary a dárci, správci, zálohy, historie správy, nastavení reportu, aktuality a projekty, logy a diagnostika`,
  'admin:write': $localize`:@@donor.connect.scope.write:Změny: přiřazení platby dárci, nastavení a odeslání měsíčního reportu, vyžádání zálohy, psaní a zveřejnění aktualit a projektů, párování z účtů dárců, dočasná úroveň logování`,
};

export const SCOPE_ABILITIES: Record<OAuthScope, readonly string[]> = {
  'admin:read': [
    $localize`:@@donor.connect.ability.donors:vidět dárce, jejich dary a platby z banky`,
    $localize`:@@donor.connect.ability.content:vidět aktuality a projekty`,
    $localize`:@@donor.connect.ability.administrators:vidět správce a historii změn ve správě`,
    $localize`:@@donor.connect.ability.report:vidět nastavení měsíčního reportu`,
    $localize`:@@donor.connect.ability.operations:vidět stav záloh a provozní záznamy webu`,
  ],
  'admin:write': [
    $localize`:@@donor.connect.ability.pairing:přiřadit platbu dárci a spárovat platby podle účtů dárců`,
    $localize`:@@donor.connect.ability.sendReport:nastavit a odeslat měsíční report`,
    $localize`:@@donor.connect.ability.backup:vyžádat si novou zálohu`,
    $localize`:@@donor.connect.ability.publish:psát a zveřejňovat aktuality a projekty`,
    $localize`:@@donor.connect.ability.logLevel:dočasně zapnout podrobnější provozní záznamy`,
  ],
};

export function knownScopes(scope: string | null): OAuthScope[] {
  return (scope ?? '')
    .split(/\s+/)
    .filter((candidate): candidate is OAuthScope => candidate in SCOPE_LABELS);
}

export function describeScopes(scopes: readonly OAuthScope[]): string[] {
  return scopes.map((scope) => SCOPE_LABELS[scope]);
}
