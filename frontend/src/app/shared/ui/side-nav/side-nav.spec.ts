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
  template: `<app-side-nav
    navId="test-nav"
    [groups]="groups()"
    label="Oblast"
    menuLabel="Menu oblasti"
    ><p class="projected">Obsah</p></app-side-nav
  >`,
})
class Host {
  readonly groups = signal<readonly SideNavGroup[]>(GROUPS);
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

  function toggle(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
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

  it('when the area home is open, then only the exact link is the current page', () => {
    expect(currentLinks()).toEqual(['Přehled']);
  });

  it('when a page below an item is open, then that item is the current page', async () => {
    await router.navigateByUrl('/oblast/prvni/42');
    await settle();

    expect(currentLinks()).toEqual(['První']);
  });

  it('when a page is open, then the current section is named beside the menu button for sighted users', async () => {
    const current = () => fixture.nativeElement.querySelector('.side-nav-current') as HTMLElement;
    expect(clean(current().textContent)).toBe('Přehled');
    expect(current().getAttribute('aria-hidden')).toBe('true');
    expect(toggle().nextElementSibling).toBe(current());

    await router.navigateByUrl('/oblast/prvni/42?strana=2');
    await settle();

    expect(clean(current().textContent)).toBe('První');
  });

  it('when the menu button is shown, then it controls the panel and starts collapsed', () => {
    expect(clean(toggle().textContent)).toBe('Menu oblasti');
    expect(toggle().getAttribute('aria-controls')).toBe('test-nav');
    expect(nav().id).toBe('test-nav');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(nav().classList).not.toContain('side-nav-panel--open');
  });

  describe('when the menu is opened', () => {
    beforeEach(async () => {
      toggle().click();
      await settle();
    });

    it('then the panel opens', () => {
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(nav().classList).toContain('side-nav-panel--open');
    });

    it('then picking an item navigates there and closes it', async () => {
      (nav().querySelector('a[href="/oblast/druha"]') as HTMLAnchorElement).click();
      await settle();

      expect(router.url).toBe('/oblast/druha');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(currentLinks()).toEqual(['Druhá']);
    });

    it('then Escape closes it and returns focus to the button', async () => {
      const focus = vi.spyOn(toggle(), 'focus');
      nav()
        .querySelector('a')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();

      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(focus).toHaveBeenCalled();
    });
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

    it('then the menu button shows it too while another section is open', async () => {
      await showBadge(2);

      expect(badgeOf(toggle())).toEqual(['2', 'true', '2 věci čekají']);
      expect(clean(toggle().textContent)).toBe('Menu oblasti 2 2 věci čekají');
    });

    it('then the menu button leaves it out while its own section is open', async () => {
      await showBadge(2);
      await router.navigateByUrl('/oblast/druha');
      await settle();

      expect(toggle().querySelector('.side-nav-badge')).toBeNull();
      expect(clean(toggle().textContent)).toBe('Menu oblasti');
    });

    it('then a count of zero shows no badge anywhere', async () => {
      await showBadge(0);

      expect(fixture.nativeElement.querySelector('.side-nav-badge')).toBeNull();
      expect(fixture.nativeElement.querySelector('.visually-hidden')).toBeNull();
    });
  });
});
