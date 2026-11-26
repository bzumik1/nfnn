import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PagePlacement } from '../../core/navigation/page-placement';
import { ACCOUNT_SECTION_PAGES, AccountSection } from './account-section';

@Component({ selector: 'app-loaded-section', template: '<h2>Moje dary</h2>' })
class LoadedSection {}

describe('Given a section of the account sheet whose page’s code is still loading', () => {
  let loaded: (page: typeof LoadedSection) => void;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ACCOUNT_SECTION_PAGES,
          useValue: {
            '/darce/dary': () =>
              new Promise<typeof LoadedSection>((done) => {
                loaded = done;
              }),
          },
        },
      ],
    });
  });

  it('when it opens, then the page is not placed until its page has come and been drawn, so a step of the sheet waits for it (round 42)', async () => {
    const placement = TestBed.inject(PagePlacement);
    const fixture = TestBed.createComponent(AccountSection);
    fixture.componentRef.setInput('path', '/darce/dary');
    fixture.detectChanges();
    expect(placement.isSettled(), 'placed before its page came').toBe(false);

    loaded(LoadedSection);
    await vi.waitFor(() => {
      TestBed.inject(ApplicationRef).tick();
      expect(placement.isSettled()).toBe(true);
    });

    expect(fixture.nativeElement.textContent).toContain('Moje dary');
  });

  it('when it closes before its page came, then the page is placed all the same, so no step waits on it', () => {
    const placement = TestBed.inject(PagePlacement);
    const fixture = TestBed.createComponent(AccountSection);
    fixture.componentRef.setInput('path', '/darce/dary');
    fixture.detectChanges();

    fixture.destroy();

    expect(placement.isSettled()).toBe(true);
  });
});
