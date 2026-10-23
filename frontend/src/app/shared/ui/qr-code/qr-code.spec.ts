import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QrCode } from './qr-code';
import { isDark, QrMatrix } from './qr-matrix';
import { checkerboard, inverseCheckerboard } from './testing/qr-matrices';

const SIZE = 25;

function render(matrix: QrMatrix, variant: 'branded' | 'plain'): ComponentFixture<QrCode> {
  const fixture = TestBed.createComponent(QrCode);
  fixture.componentRef.setInput('matrix', matrix);
  fixture.componentRef.setInput('variant', variant);
  fixture.componentRef.setInput('label', 'QR platba na 500 Kč');
  fixture.detectChanges();
  return fixture;
}

describe('Given a branded QR code', () => {
  let fixture: ComponentFixture<QrCode>;

  beforeEach(() => {
    fixture = render(checkerboard(SIZE), 'branded');
  });

  const svg = () => fixture.nativeElement.querySelector('svg') as SVGSVGElement;
  const shownDots = () =>
    Array.from(
      fixture.nativeElement.querySelectorAll('.qr-dot:not(.is-off)'),
    ) as SVGCircleElement[];

  it('when it renders, then it is one image named by its label', () => {
    expect(svg().getAttribute('role')).toBe('img');
    expect(svg().getAttribute('aria-label')).toBe('QR platba na 500 Kč');
    expect(svg().getAttribute('viewBox')).toBe(`0 0 ${SIZE + 8} ${SIZE + 8}`);
  });

  it('when it renders, then the three finder marks and the star badge are drawn instead of their modules', () => {
    expect(fixture.nativeElement.querySelectorAll('.qr-finder')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.qr-star')).not.toBeNull();
    const dotAt = (column: number, row: number) =>
      shownDots().some(
        (dot) =>
          dot.getAttribute('cx') === `${column + 4.5}` && dot.getAttribute('cy') === `${row + 4.5}`,
      );
    expect(dotAt(0, 0)).toBe(false);
    expect(dotAt(12, 12)).toBe(false);
    expect(dotAt(8, 0)).toBe(true);
  });

  it('when it renders, then every dot it shows is a dark module', () => {
    const matrix = checkerboard(SIZE);
    for (const dot of shownDots()) {
      const column = Number(dot.getAttribute('cx')) - 4.5;
      const row = Number(dot.getAttribute('cy')) - 4.5;
      expect(isDark(matrix, column, row)).toBe(true);
    }
  });

  describe('when the matrix changes to another of the same size', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('matrix', inverseCheckerboard(SIZE));
      fixture.detectChanges();
    });

    it('then the dots follow the new modules', () => {
      const matrix = inverseCheckerboard(SIZE);
      expect(shownDots().length).toBeGreaterThan(0);
      for (const dot of shownDots()) {
        const column = Number(dot.getAttribute('cx')) - 4.5;
        const row = Number(dot.getAttribute('cy')) - 4.5;
        expect(isDark(matrix, column, row)).toBe(true);
      }
    });
  });
});

describe('Given a plain QR code', () => {
  it('when it renders, then it draws one square per dark module and no badge', () => {
    const matrix = checkerboard(SIZE);
    const fixture = render(matrix, 'plain');

    const path = fixture.nativeElement.querySelector('.qr-plain') as SVGPathElement;
    const squares = path.getAttribute('d')?.match(/h1v1h-1z/g) ?? [];
    expect(squares).toHaveLength(Math.ceil((SIZE * SIZE) / 2));
    expect(fixture.nativeElement.querySelector('.qr-star')).toBeNull();
  });
});
