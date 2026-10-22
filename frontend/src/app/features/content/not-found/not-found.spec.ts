import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NotFound } from './not-found';

describe('Given an address the site does not know', () => {
  let fixture: ComponentFixture<NotFound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFound],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('when the page opens, then it says the page does not exist and leads home', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Tuhle stránku jsme nenašli');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/');
  });

  it('when the page opens, then search engines are asked not to index it, and leaving it lifts that', () => {
    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="robots"')?.content).toBe('noindex');

    fixture.destroy();

    expect(meta.getTag('name="robots"')).toBeNull();
  });
});
