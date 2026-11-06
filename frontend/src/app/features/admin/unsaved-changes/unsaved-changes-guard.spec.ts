import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { GuardsUnsavedChanges, unsavedChangesGuard } from './unsaved-changes-guard';

function ask(component: GuardsUnsavedChanges | null) {
  return unsavedChangesGuard(
    component,
    {} as ActivatedRouteSnapshot,
    {} as RouterStateSnapshot,
    {} as RouterStateSnapshot,
  );
}

describe('Given a page that guards unsaved changes', () => {
  it('when it has nothing unsaved, then the navigation goes on', () => {
    expect(ask({ canLeave: () => true })).toBe(true);
  });

  it('when it asks the administrator first, then the navigation waits for the answer', async () => {
    const answer = ask({ canLeave: () => Promise.resolve(false) });

    await expect(answer).resolves.toBe(false);
  });

  it('when the page is not rendered, because the administration is locked, then the navigation goes on', () => {
    expect(ask(null)).toBe(true);
  });
});
