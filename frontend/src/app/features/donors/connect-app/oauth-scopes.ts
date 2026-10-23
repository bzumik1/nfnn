/// <reference types="@angular/localize" />

import { OAuthScope } from '../../../core/auth/donor';

export const WRITE_SCOPE: OAuthScope = 'admin:write';

export const SCOPE_LABELS: Record<OAuthScope, string> = {
  'admin:read': $localize`:@@donor.connect.scope.read:Čtení: stav importu a verze, dary a dárci, správci, zálohy, historie správy, nastavení reportu, aktuality a projekty, logy a diagnostika`,
  'admin:write': $localize`:@@donor.connect.scope.write:Změny: přiřazení platby dárci, nastavení a odeslání měsíčního reportu, vyžádání zálohy, psaní a zveřejnění aktualit a projektů, párování z účtů dárců, dočasná úroveň logování`,
};

export function knownScopes(scope: string | null): OAuthScope[] {
  return (scope ?? '')
    .split(/\s+/)
    .filter((candidate): candidate is OAuthScope => candidate in SCOPE_LABELS);
}

export function describeScopes(scopes: readonly OAuthScope[]): string[] {
  return scopes.map((scope) => SCOPE_LABELS[scope]);
}
