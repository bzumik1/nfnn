import { ComponentFixture, TestBed } from '@angular/core/testing';
import { sharedCases } from '../../../../testing/shared-cases';
import { QrCode } from './qr-code';
import { byteSegment, encodeSegments, encodeText, numericSegment } from './qr-encoder';
import { isDark, QrMatrix } from './qr-matrix';
import { decodePlainQr } from './testing/plain-qr-decoder';
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

describe('Given a branded QR code whose theme names the times of its wave', () => {
  const times: Record<string, string> = {
    '--duration-qr-wave-start': '11ms',
    '--duration-qr-wave-step': '2ms',
    '--duration-qr-wave-jitter': '0ms',
    '--duration-qr-stay': '333ms',
    '--duration-qr-leave': '0.444s',
    '--duration-qr-leave-lead': '1ms',
    '--duration-qr-enter': '222ms',
    '--duration-qr-enter-lag': '3ms',
    '--duration-qr-settle': '111ms',
    '--duration-qr-settle-lag': '4ms',
    '--duration-qr-star': '777ms',
    '--duration-qr-badge': '555ms',
  };
  let durations: number[];

  beforeEach(() => {
    durations = [];
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: (_keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
        durations.push(Number(options.duration));
        return { cancel: () => undefined };
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate');
    vi.unstubAllGlobals();
  });

  it('when the matrix changes, then the wave takes its times from the theme', async () => {
    const fixture = render(checkerboard(SIZE), 'branded');
    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
    for (const [token, value] of Object.entries(times)) {
      svg.style.setProperty(token, value);
    }

    fixture.componentRef.setInput('matrix', inverseCheckerboard(SIZE));
    fixture.detectChanges();
    await fixture.whenStable();

    for (const duration of [333, 444, 222, 111, 777, 555]) {
      expect(durations).toContain(duration);
    }
    expect(durations).not.toContain(1860);
  });

  it('when the theme names no times, then the matrix changes without a wave', async () => {
    const fixture = render(checkerboard(SIZE), 'branded');

    fixture.componentRef.setInput('matrix', inverseCheckerboard(SIZE));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(durations).toEqual([]);
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

for (const sharedCase of sharedCases('qr/totp.json')) {
  describe(`Given the plain QR code the encoder draws for the authenticator case ${sharedCase.name}`, () => {
    it('when it is decoded from its SVG, then it gives the URI back behind the ECI 1 header', () => {
      const fixture = render(encodeText(sharedCase.input.uri, 'M'), 'plain');

      const decoded = decodePlainQr(fixture.nativeElement.querySelector('svg'));

      expect(decoded?.data).toBe(sharedCase.input.uri);
      expect(decoded?.version).toBe(sharedCase.expected.version);
      expect(decoded?.chunks.map((chunk) => chunk.type)).toEqual(['eci', 'byte']);
      expect(decoded?.chunks[0]).toEqual({ type: 'eci', assignmentNumber: 1 });
    });
  });
}

for (const sharedCase of sharedCases('qr/payment.json')) {
  describe(`Given the plain QR code the encoder draws for the payment case ${sharedCase.name}`, () => {
    it('when it is decoded from its SVG, then it gives the SPAYD text back in alphanumeric mode', () => {
      const fixture = render(encodeText(sharedCase.input.spayd, 'H'), 'plain');

      const decoded = decodePlainQr(fixture.nativeElement.querySelector('svg'));

      expect(decoded?.data).toBe(sharedCase.input.spayd);
      expect(decoded?.chunks.map((chunk) => chunk.type)).toEqual(['alphanumeric']);
    });
  });
}

describe('Given a verification link of a prefix in bytes and a payload in digits', () => {
  it('when the plain QR code of its symbol is decoded from its SVG, then it gives both segments back as they were written', () => {
    const prefix = 'https://nfnn.cz/overit#1';
    const digits = '720575940379279350000000000000000';
    const fixture = render(
      encodeSegments([byteSegment(prefix), numericSegment(digits)], 'L'),
      'plain',
    );

    const decoded = decodePlainQr(fixture.nativeElement.querySelector('svg'));

    expect(decoded?.data).toBe(prefix + digits);
    expect(decoded?.chunks).toEqual([
      {
        type: 'byte',
        bytes: Array.from(prefix, (character) => character.charCodeAt(0)),
        text: prefix,
      },
      { type: 'numeric', text: digits },
    ]);
  });
});
