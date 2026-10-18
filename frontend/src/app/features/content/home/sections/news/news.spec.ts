import { ComponentFixture, TestBed } from '@angular/core/testing';
import { News } from './news';

describe('Given the news section', () => {
  let fixture: ComponentFixture<News>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [News] }).compileComponents();
    fixture = TestBed.createComponent(News);
    fixture.detectChanges();
  });

  const root = () => fixture.nativeElement as HTMLElement;

  it('when it renders, then no link leads nowhere', () => {
    expect(root().querySelector('a[href="#"]')).toBeNull();
  });

  it('when it renders, then the photos are decorative because each title follows them', () => {
    const alts = Array.from(root().querySelectorAll('img')).map((image) => image.getAttribute('alt'));

    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((alt) => alt === '')).toBe(true);
  });
});
