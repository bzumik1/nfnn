import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Projects } from './projects';

describe('Given the projects section', () => {
  let fixture: ComponentFixture<Projects>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Projects] }).compileComponents();
    fixture = TestBed.createComponent(Projects);
    fixture.detectChanges();
  });

  const root = () => fixture.nativeElement as HTMLElement;

  it('when it renders, then every child has a plain card that offers nothing to click', () => {
    const cards = Array.from(root().querySelectorAll('app-project-card article'));

    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.getAttribute('role')).toBeNull();
      expect(card.getAttribute('tabindex')).toBeNull();
    }
    expect(root().querySelector('.card-toggle')).toBeNull();
    expect(root().textContent).not.toContain('Kliknutím na kartu');
  });

  it('when it renders, then the photos are decorative and the card titles name the children', () => {
    const alts = Array.from(root().querySelectorAll('img')).map((image) => image.getAttribute('alt'));

    expect(alts).toEqual(['', '', '', '', '']);
    expect(Array.from(root().querySelectorAll('.card-title')).map((title) => title.textContent?.trim())).toEqual([
      'Dominik, 7 let',
      'Anička, 5 let',
      'Tomáš, 9 let',
      'Eliška, 6 let',
      'Martin, 11 let',
    ]);
  });
});
