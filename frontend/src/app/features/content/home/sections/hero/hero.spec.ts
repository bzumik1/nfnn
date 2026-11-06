import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CompactLayout } from '../../../../../core/layout/compact-layout';
import { Hero } from './hero';

describe('Given the hero', () => {
  let fixture: ComponentFixture<Hero>;
  const compact = signal(false);

  beforeEach(async () => {
    compact.set(false);
    await TestBed.configureTestingModule({
      imports: [Hero],
      providers: [
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
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

    expect(action.textContent?.trim()).toBe('Přispět');
    expect(action.getAttribute('href')).toBe('/prispet');
  });

  it('when it renders, then its second action says where the foundation helps and leads to the projects', () => {
    const action = (fixture.nativeElement as HTMLElement).querySelectorAll('.hero-btns a')[1];

    expect(action.textContent?.trim()).toBe('Kde pomáháme');
    expect(action.getAttribute('href')).toBe('/projekty');
  });

  it('when the layout is compact, then it shows no actions, because the tab bar under it offers Přispět and Pomáháme', async () => {
    compact.set(true);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('a')).toHaveLength(0);
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Nová naděje');
  });
});
