import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CompactLayout } from '../../../../../core/layout/compact-layout';
import { ShortViewport } from '../../../../../core/layout/short-viewport';
import { Hero } from './hero';
import { withOrdinarySpaces } from '../../../../../../testing/ordinary-spaces';

describe('Given the hero', () => {
  let fixture: ComponentFixture<Hero>;
  const compact = signal(false);
  const short = signal(false);

  beforeEach(async () => {
    compact.set(false);
    short.set(false);
    await TestBed.configureTestingModule({
      imports: [Hero],
      providers: [
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
        { provide: ShortViewport, useValue: { isShort: short.asReadonly() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Hero);
    fixture.detectChanges();
  });

  it('when it renders, then its photo loads first, in the width the screen needs', () => {
    const image = (fixture.nativeElement as HTMLElement).querySelector('img')!;

    expect(image.getAttribute('src')).toBe('/images/hero-1536.webp');
    expect(image.getAttribute('srcset')!.replace(/\s+/g, ' ').trim()).toBe(
      '/images/hero-1024.webp 1024w, /images/hero-1536.webp 1536w',
    );
    expect(image.getAttribute('sizes')).toBe('max(100vw, 150vh, 900px)');
    expect(image.getAttribute('fetchpriority')).toBe('high');
    expect(image.getAttribute('loading')).toBeNull();
  });

  it('when it renders, then its main action says Přispět and leads to the donate section', () => {
    const action = (fixture.nativeElement as HTMLElement).querySelector('.hero-btns a')!;

    expect(withOrdinarySpaces(action.textContent)?.trim()).toBe('Přispět');
    expect(action.getAttribute('href')).toBe('/prispet');
  });

  it('when it renders, then its second action says where the foundation helps and leads to the projects', () => {
    const action = (fixture.nativeElement as HTMLElement).querySelectorAll('.hero-btns a')[1];

    expect(withOrdinarySpaces(action.textContent)?.trim()).toBe('Kde pomáháme');
    expect(action.getAttribute('href')).toBe('/projekty');
  });

  it('when the layout is compact, then it shows Přispět alone, because the tab bar under it offers Pomáháme', async () => {
    compact.set(true);
    await fixture.whenStable();
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('a');

    expect(links).toHaveLength(1);
    expect(withOrdinarySpaces(links[0].textContent)?.trim()).toBe('Přispět');
    expect(links[0].getAttribute('href')).toBe('/prispet');
  });

  it('when a wide phone lies on its side, so the window is short, then it shows no actions either, because the tab bar under it offers them and they would not fit', async () => {
    short.set(true);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('a')).toHaveLength(0);
    expect(withOrdinarySpaces(host.querySelector('h1')?.textContent)?.trim()).toBe('Nová naděje');
  });

  it('when the window is short, then the lead stays in the page for screen readers', async () => {
    short.set(true);
    await fixture.whenStable();

    expect(withOrdinarySpaces((fixture.nativeElement as HTMLElement).textContent)).toContain(
      'Pomáháme zdravotně postiženým dětem',
    );
  });

  it('when its lead wraps, then the preposition „k“ stays with the next word instead of ending a line alone', () => {
    const lead = (fixture.nativeElement as HTMLElement).querySelector('.hero-lead')!;

    expect(withOrdinarySpaces(lead.textContent)).toContain('k lepšímu');
  });
  it('when the layout is wide, then the figures of O nás stand under its actions, read with their final values', () => {
    const host = fixture.nativeElement as HTMLElement;
    const figures = host.querySelector('.hero-btns + app-stats-bar');

    expect(figures).not.toBeNull();
    expect(
      [...figures!.querySelectorAll('.stat')].map((stat) =>
        [
          withOrdinarySpaces(stat.querySelector('.visually-hidden')?.textContent)?.trim(),
          withOrdinarySpaces(stat.querySelector('.stat-label')?.textContent)?.trim(),
        ].join(' '),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\d+ let pomáháme$/),
        '200+ podpořených dětí',
        '2005 rok vzniku',
      ]),
    );
  });

  it('when motion is allowed, then the figures stand at their values at once, so they enter with the rest of the hero instead of on their own', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly observe = vi.fn();
        readonly disconnect = vi.fn();
      },
    );
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    try {
      const again = TestBed.createComponent(Hero);
      again.detectChanges();
      await again.whenStable();
      const stats = [...(again.nativeElement as HTMLElement).querySelectorAll('.stat')];

      expect(
        stats.map((stat) =>
          withOrdinarySpaces(stat.querySelector('[aria-hidden="true"]')?.textContent),
        ),
      ).toEqual(
        stats.map((stat) =>
          withOrdinarySpaces(stat.querySelector('.visually-hidden')?.textContent),
        ),
      );
      expect(stats.some((stat) => stat.classList.contains('is-waiting'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('when the layout is compact, then it shows no figures, because the first screen of a phone has no room for them', async () => {
    compact.set(true);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-stats-bar')).toBeNull();
  });

  it('when the window is short, then it shows no figures either', async () => {
    short.set(true);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-stats-bar')).toBeNull();
  });
});
