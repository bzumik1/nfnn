import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Hero } from './hero';

describe('Given the hero', () => {
  let fixture: ComponentFixture<Hero>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Hero],
      providers: [provideRouter([])],
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
    expect(action.getAttribute('href')).toBe('/#prispet');
  });

  it('when it renders, then its second action says where the foundation helps and leads to the projects', () => {
    const action = (fixture.nativeElement as HTMLElement).querySelectorAll('.hero-btns a')[1];

    expect(action.textContent?.trim()).toBe('Kde pomáháme');
    expect(action.getAttribute('href')).toBe('/#projekty');
  });
});
