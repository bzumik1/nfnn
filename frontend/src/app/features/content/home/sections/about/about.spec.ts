import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { About } from './about';

describe('Given the about section', () => {
  let fixture: ComponentFixture<About>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [About],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(About);
    fixture.detectChanges();
  });

  it('when it renders, then its photo waits until it is near and comes in two widths', () => {
    const image = (fixture.nativeElement as HTMLElement).querySelector('img')!;

    expect(image.getAttribute('srcset')).toBe(
      '/images/about-720.webp 720w, /images/about-1440.webp 1440w',
    );
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('width')).toBe('720');
    expect(image.getAttribute('height')).toBe('480');
  });

  it('when it renders, then it opens with what the foundation does, then the work with FOD and then its founding', () => {
    const paragraphs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.paragraph'),
    ).map((paragraph) => paragraph.textContent?.trim());

    expect(paragraphs[0]).toMatch(/^Nejsme velká organizace/);
    expect(paragraphs[1]).toMatch(/^Od svého počátku úzce spolupracujeme/);
    expect(paragraphs[2]).toMatch(/^Nová naděje – nadační fond byl zřízen/);
  });
});
