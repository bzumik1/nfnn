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

    expect(image.getAttribute('src')).toBe('/images/hero-1920.webp');
    expect(image.getAttribute('srcset')!.replace(/\s+/g, ' ').trim()).toBe(
      '/images/hero-1280.webp 1280w, /images/hero-1920.webp 1920w, /images/hero-2560.webp 2560w',
    );
    expect(image.getAttribute('sizes')).toBe('max(100vw, 150vh, 900px)');
    expect(image.getAttribute('fetchpriority')).toBe('high');
    expect(image.getAttribute('loading')).toBeNull();
  });
});
