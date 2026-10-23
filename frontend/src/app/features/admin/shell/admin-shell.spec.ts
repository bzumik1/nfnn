import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AdminShell } from './admin-shell';

@Component({ template: '<h1>Stránka</h1>' })
class Page {}

describe('Given an administrator anywhere in the administration', () => {
  let fixture: ComponentFixture<AdminShell>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminShell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'sprava', component: Page },
          { path: 'sprava/darci', component: Page },
          { path: 'sprava/darci/:id', component: Page },
          { path: 'sprava/platby', component: Page },
        ]),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AdminShell);
    await router.navigateByUrl('/sprava');
    await settle();
  });

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function nav(): HTMLElement {
    return fixture.nativeElement.querySelector('nav.side-nav-panel');
  }

  function toggle(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button.side-nav-toggle');
  }

  function clean(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  function currentLinks(): string[] {
    return Array.from(nav().querySelectorAll('a[aria-current="page"]')).map((link) =>
      clean(link.textContent),
    );
  }

  it('when the panel is shown, then it lists the overview and the sections grouped into money, people, web and operations', () => {
    const groups = Array.from(nav().querySelectorAll('ul')).map((list) => ({
      label: clean(
        list.hasAttribute('aria-labelledby')
          ? fixture.nativeElement.querySelector(`#${list.getAttribute('aria-labelledby')}`)
              ?.textContent
          : '',
      ),
      links: Array.from(list.querySelectorAll('a')).map((link) => [
        clean(link.textContent),
        link.getAttribute('href'),
      ]),
    }));

    expect(nav().getAttribute('aria-label')).toBe('Správa');
    expect(groups).toEqual([
      { label: '', links: [['Přehled', '/sprava']] },
      {
        label: 'Peníze',
        links: [
          ['Platby z banky', '/sprava/platby'],
          ['Starší symboly', '/sprava/starsi-symboly'],
          ['Měsíční přehled', '/sprava/prehledy'],
        ],
      },
      {
        label: 'Lidé',
        links: [
          ['Dárci', '/sprava/darci'],
          ['Správci', '/sprava/spravci'],
        ],
      },
      {
        label: 'Web',
        links: [
          ['Aktuality', '/sprava/aktuality'],
          ['Projekty', '/sprava/projekty'],
        ],
      },
      {
        label: 'Provoz',
        links: [
          ['Zálohy', '/sprava/zalohy'],
          ['Logy a diagnostika', '/sprava/logy'],
          ['Nastavení', '/sprava/nastaveni'],
          ['Historie správy', '/sprava/historie'],
        ],
      },
    ]);
  });

  it('when the overview is open, then only the overview is marked as the current page', () => {
    expect(currentLinks()).toEqual(['Přehled']);
  });

  it('when a donor of the donors section is open, then the donors link is the current page', async () => {
    await router.navigateByUrl('/sprava/darci/019a1c00-0000-7000-8000-000000000001');
    await settle();

    expect(currentLinks()).toEqual(['Dárci']);
  });

  it('when the menu button is shown, then it names the administration and controls the panel', () => {
    expect(clean(toggle().textContent)).toBe('Menu správy');
    expect(toggle().getAttribute('aria-controls')).toBe('admin-nav');
    expect(nav().id).toBe('admin-nav');
  });
});
