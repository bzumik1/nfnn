import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { APP_DEPTH_KEY, BackTarget } from '../../core/navigation/back-target';
import { PageTransitions } from '../../core/navigation/page-transitions';
import { AccountReturn, APP_ACCOUNT_KEY, APP_ACCOUNT_SCROLL_KEY } from './account-return';

@Component({ template: '' })
class Blank {}

function navigated(router: Router): Promise<void> {
  return new Promise((resolve) => {
    const events = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        events.unsubscribe();
        resolve();
      }
    });
  });
}

describe('Given a page the account sheet handed its entry over to', () => {
  let router: Router;
  let back: BackTarget;
  let accountReturn: AccountReturn;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    TestBed.inject(Location).replaceState('/aktuality/clanek');
    router = TestBed.inject(Router);
    back = TestBed.inject(BackTarget);
    accountReturn = TestBed.inject(AccountReturn);
    const started = navigated(router);
    router.initialNavigation();
    await started;
  });

  async function openFromTheSheet(
    url: string,
    section: string,
    scrolled: readonly number[] = [0],
  ): Promise<void> {
    const location = TestBed.inject(Location);
    location.go(location.path(), '', { ...(location.getState() as object), nfnnDialogDepth: 1 });
    await router.navigateByUrl(url, {
      replaceUrl: true,
      state: {
        [APP_DEPTH_KEY]: back.nextDepth(),
        [APP_ACCOUNT_KEY]: section,
        [APP_ACCOUNT_SCROLL_KEY]: scrolled,
      },
    });
  }

  function stepBack(steps: () => void): Promise<void> {
    const returned = navigated(router);
    steps();
    return returned;
  }

  it('when Správa stands, then nothing asks for the account sheet', async () => {
    await openFromTheSheet('/sprava', '');

    expect(accountReturn.sectionToReopen()).toBeNull();
  });

  it('when Zpět steps back from Správa, then the account sheet is asked to open again on its list', async () => {
    await openFromTheSheet('/sprava', '');

    await stepBack(() => back.back('/'));

    expect(router.url).toBe('/aktuality/clanek');
    expect(accountReturn.sectionToReopen()).toBe('');
  });

  it('when Zpět steps back from Správa opened from the scrolled list, then the sheet is asked to open at the scroll it was left at, and only once', async () => {
    await openFromTheSheet('/sprava', '', [92]);

    await stepBack(() => back.back('/'));

    expect(accountReturn.takeScrollToReopen()).toEqual([92]);
    expect(accountReturn.takeScrollToReopen()).toEqual([]);
  });

  it('when Zpět steps back to a section opened from the scrolled list, then the sheet is asked for the scroll of the list as well as of the section', async () => {
    await openFromTheSheet('/overit', '/darce/potvrzeni', [92, 40]);

    await stepBack(() => back.back('/'));

    expect(accountReturn.takeScrollToReopen()).toEqual([92, 40]);
  });

  it('when the page was opened from a section of the sheet and Zpět steps back, then the sheet is asked to open on that section', async () => {
    await openFromTheSheet('/overit', '/darce/potvrzeni');

    await stepBack(() => back.back('/'));

    expect(accountReturn.sectionToReopen()).toBe('/darce/potvrzeni');
  });

  it('when a deeper page of Správa steps back to it, then only a step back from Správa itself asks for the sheet', async () => {
    await openFromTheSheet('/sprava', '');
    await router.navigateByUrl('/sprava/darci');

    await stepBack(() => back.back('/sprava'));

    expect(router.url).toBe('/sprava');
    expect(accountReturn.sectionToReopen()).toBeNull();

    await stepBack(() => back.back('/'));

    expect(accountReturn.sectionToReopen()).toBe('');
  });

  it('when Správa is closed with Zavřít on its own page, then the account sheet stays closed, and a later step back from a page the sheet opened asks for it again', async () => {
    await openFromTheSheet('/sprava', '');

    accountReturn.closeAdministration();
    await stepBack(() => back.backBy(1));

    expect(router.url).toBe('/aktuality/clanek');
    expect(accountReturn.sectionToReopen()).toBeNull();

    await openFromTheSheet('/sprava', '');
    await stepBack(() => back.back('/'));

    expect(accountReturn.sectionToReopen()).toBe('');
  });

  it('when Správa is closed with Zavřít a page deeper, stepping over all its pages at once, then the account sheet stays closed', async () => {
    await openFromTheSheet('/sprava', '');
    await router.navigateByUrl('/sprava/darci');

    accountReturn.closeAdministration();
    await stepBack(() => back.backBy(2));

    expect(router.url).toBe('/aktuality/clanek');
    expect(accountReturn.sectionToReopen()).toBeNull();
  });

  it('when the request is taken, then it is asked only once', async () => {
    await openFromTheSheet('/sprava', '');
    await stepBack(() => back.back('/'));

    expect(accountReturn.takeSectionToReopen()).toBe('');
    expect(accountReturn.sectionToReopen()).toBeNull();
    expect(accountReturn.takeSectionToReopen()).toBeNull();
  });

  describe('when the sheet kept copies of its screens for a finger', () => {
    let forget: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      forget = vi.spyOn(TestBed.inject(PageTransitions), 'forgetSheetsOf');
    });

    it('and handed its entry over to a page, then the copies stay while that page stands', async () => {
      await openFromTheSheet('/overit', '/darce/potvrzeni');

      expect(forget).not.toHaveBeenCalled();
    });

    it('and Zpět opens it again on its section, then the copies stay for the sheet to take', async () => {
      await openFromTheSheet('/overit', '/darce/potvrzeni');

      await stepBack(() => back.back('/'));

      expect(forget).not.toHaveBeenCalled();
    });

    it('and Zpět steps back without opening it again, then the copies go', async () => {
      await openFromTheSheet('/sprava', '');

      accountReturn.closeAdministration();
      await stepBack(() => back.backBy(1));

      expect(forget).toHaveBeenCalledWith(accountReturn);
    });

    it('and another page opens from the page it handed over to, then the copies go', async () => {
      await openFromTheSheet('/overit', '/darce/potvrzeni');

      await router.navigateByUrl('/aktuality/druhy');

      expect(forget).toHaveBeenCalledWith(accountReturn);
    });
  });

  it('when another page opens before the request is taken, then the request is dropped', async () => {
    await openFromTheSheet('/sprava', '');
    await stepBack(() => back.back('/'));

    await router.navigateByUrl('/aktuality/druhy');

    expect(accountReturn.sectionToReopen()).toBeNull();
  });
});
