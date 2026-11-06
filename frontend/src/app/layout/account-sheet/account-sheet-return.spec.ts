import { BrowserPlatformLocation, PlatformLocation } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ACCOUNT_SHEET_STEP, AccountSheetReturn } from './account-sheet-return';

@Component({ template: '' })
class Page {}

describe('Given the step of the account sheet a section was opened from', () => {
  let router: Router;
  let sheetReturn: AccountSheetReturn;

  const settled = async (): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      TestBed.tick();
    }
  };

  const markStep = (): void =>
    window.history.replaceState(
      { ...(window.history.state as Record<string, unknown>), [ACCOUNT_SHEET_STEP]: true },
      '',
    );

  beforeEach(async () => {
    window.history.pushState(null, '', '/');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'prispet', component: Page },
          { path: 'darce/prehled', component: Page },
        ]),
        { provide: PlatformLocation, useClass: BrowserPlatformLocation },
      ],
    });
    router = TestBed.inject(Router);
    sheetReturn = TestBed.inject(AccountSheetReturn);
    router.initialNavigation();
    await router.navigateByUrl('/prispet');
    await settled();
  });

  it('when the visitor goes back from the section onto that step, then the account sheet is asked to open again', async () => {
    markStep();
    await router.navigateByUrl('/darce/prehled');
    await settled();

    window.history.back();
    await settled();

    expect(router.url).toBe('/prispet');
    expect(sheetReturn.wanted()).toBe(true);
  });

  it('when the sheet has opened again, then nothing more is asked', async () => {
    markStep();
    await router.navigateByUrl('/darce/prehled');
    await settled();
    window.history.back();
    await settled();

    sheetReturn.taken();

    expect(sheetReturn.wanted()).toBe(false);
  });

  it('when the visitor goes back onto a step that no sheet left, then nothing is asked', async () => {
    await router.navigateByUrl('/darce/prehled');
    await settled();

    window.history.back();
    await settled();

    expect(sheetReturn.wanted()).toBe(false);
  });

  it('when the visitor opens another page after going back onto the step, then nothing is asked any more', async () => {
    markStep();
    await router.navigateByUrl('/darce/prehled');
    await settled();
    window.history.back();
    await settled();

    await router.navigateByUrl('/darce/prehled');
    await settled();

    expect(sheetReturn.wanted()).toBe(false);
  });
});
