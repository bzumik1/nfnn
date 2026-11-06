import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SideNav, SideNavGroup } from './side-nav';

@Component({ template: '<h1>Stránka</h1>' })
class Page {}

const GROUPS: SideNavGroup[] = [
  { id: 'nav-home', label: null, items: [{ path: '/oblast', label: 'Přehled', exact: true }] },
  {
    id: 'nav-things',
    label: 'Věci',
    items: [
      { path: '/oblast/prvni', label: 'První' },
      { path: '/oblast/druha', label: 'Druhá' },
    ],
  },
];

@Component({
  imports: [SideNav],
  template: `<app-side-nav navId="test-nav" [groups]="groups()" label="Oblast" [panel]="panel()"
    ><p class="projected">Obsah</p></app-side-nav
  >`,
})
class Host {
  readonly groups = signal<readonly SideNavGroup[]>(GROUPS);
  readonly panel = signal(true);
}

function withBadge(count: number, description: string): SideNavGroup[] {
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.path === '/oblast/druha' ? { ...item, badge: { count, description } } : item,
    ),
  }));
}

describe('Given a side panel of an area', () => {
  let fixture: ComponentFixture<Host>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRouter([
          { path: 'oblast', component: Page },
          { path: 'oblast/prvni', component: Page },
          { path: 'oblast/prvni/:id', component: Page },
          { path: 'oblast/druha', component: Page },
        ]),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(Host);
    await router.navigateByUrl('/oblast');
    await settle();
  });

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function nav(): HTMLElement {
    return fixture.nativeElement.querySelector('nav');
  }

  function clean(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  function currentLinks(): string[] {
    return Array.from(nav().querySelectorAll('a[aria-current="page"]')).map((link) =>
      clean(link.textContent),
    );
  }

  it('when it is shown, then the navigation carries its label, the group names its list and the content is projected beside it', () => {
    const list = nav().querySelectorAll('ul')[1];

    expect(nav().getAttribute('aria-label')).toBe('Oblast');
    expect(nav().querySelectorAll('ul')[0].hasAttribute('aria-labelledby')).toBe(false);
    expect(clean(document.getElementById(list.getAttribute('aria-labelledby')!)?.textContent)).toBe(
      'Věci',
    );
    expect(clean(fixture.nativeElement.querySelector('.projected')?.textContent)).toBe('Obsah');
  });

  it('when the area asks for no panel, then only the content stays, in the same main landmark, and is not made again when the panel returns', async () => {
    const projected = fixture.nativeElement.querySelector('.projected');

    fixture.componentInstance.panel.set(false);
    await settle();

    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.querySelector('main#obsah .projected')).toBe(projected);

    fixture.componentInstance.panel.set(true);
    await settle();

    expect(nav()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('main#obsah .projected')).toBe(projected);
  });

  it('when the area home is open, then only the exact link is the current page', () => {
    expect(currentLinks()).toEqual(['Přehled']);
  });

  it('when a page below an item is open, then that item is the current page', async () => {
    await router.navigateByUrl('/oblast/prvni/42');
    await settle();

    expect(currentLinks()).toEqual(['První']);
  });

  it('when it is shown, then it holds only links and no menu button, since phones reach the sections from elsewhere', () => {
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(nav().id).toBe('test-nav');
  });

  describe('when an item carries a badge', () => {
    async function showBadge(count: number): Promise<void> {
      fixture.componentInstance.groups.set(withBadge(count, `${count} věci čekají`));
      await settle();
    }

    function badgeOf(container: Element): string[] {
      return [
        clean(container.querySelector('.side-nav-badge')?.textContent),
        container.querySelector('.side-nav-badge')?.getAttribute('aria-hidden') ?? '',
        clean(container.querySelector('.visually-hidden')?.textContent),
      ];
    }

    it('then its link shows the count to sighted users and says what waits to screen readers', async () => {
      await showBadge(2);

      const link = nav().querySelector('a[href="/oblast/druha"]')!;
      expect(badgeOf(link)).toEqual(['2', 'true', '2 věci čekají']);
      expect(nav().querySelectorAll('.side-nav-badge')).toHaveLength(1);
    });

    it('then a count of zero shows no badge anywhere', async () => {
      await showBadge(0);

      expect(fixture.nativeElement.querySelector('.side-nav-badge')).toBeNull();
      expect(fixture.nativeElement.querySelector('.visually-hidden')).toBeNull();
    });
  });
});
