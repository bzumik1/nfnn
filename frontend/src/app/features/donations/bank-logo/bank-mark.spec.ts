import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BankMark } from './bank-mark';

function render(inputs: Record<string, unknown>): ComponentFixture<BankMark> {
  const fixture = TestBed.createComponent(BankMark);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<BankMark>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function monogram(fixture: ComponentFixture<BankMark>): string | null {
  return host(fixture).querySelector('.bank-monogram')?.getAttribute('data-monogram') ?? null;
}

describe('Given a bank with a logo', () => {
  it('when the mark renders, then it shows the logo at its size, late, and stays out of the screen reader', () => {
    const fixture = render({
      src: '/api/donations/bank-logos/images/a',
      name: 'Česká spořitelna',
      size: 40,
    });
    const image = host(fixture).querySelector('img')!;

    expect(host(fixture).getAttribute('aria-hidden')).toBe('true');
    expect(image.getAttribute('src')).toBe('/api/donations/bank-logos/images/a');
    expect(image.getAttribute('width')).toBe('40');
    expect(image.getAttribute('height')).toBe('40');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('alt')).toBe('');
    expect(monogram(fixture)).toBeNull();
    expect(host(fixture).textContent?.trim()).toBe('');
  });

  it('when the logo cannot be loaded, then the monogram of the bank takes its place until another logo comes', () => {
    const fixture = render({
      src: '/api/donations/bank-logos/images/a',
      name: 'Česká spořitelna',
      size: 24,
    });

    host(fixture).querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(host(fixture).querySelector('img')).toBeNull();
    expect(monogram(fixture)).toBe('ČS');

    fixture.componentRef.setInput('src', '/api/donations/bank-logos/images/b');
    fixture.detectChanges();

    expect(host(fixture).querySelector('img')?.getAttribute('src')).toBe(
      '/api/donations/bank-logos/images/b',
    );
  });
});

describe('Given a bank without a logo', () => {
  it('when its name is known, then the mark shows its monogram, drawn and not read as text', () => {
    const fixture = render({ src: null, name: 'Komerční banka', size: 40 });

    expect(host(fixture).querySelector('img')).toBeNull();
    expect(monogram(fixture)).toBe('KB');
    expect(host(fixture).textContent?.trim()).toBe('');
  });

  it('when its name is not known either, then the mark shows a plain bank sign', () => {
    const fixture = render({ src: null, name: null, size: 24 });

    expect(host(fixture).querySelector('img')).toBeNull();
    expect(monogram(fixture)).toBeNull();
    expect(host(fixture).querySelector('svg.bank-sign')).not.toBeNull();
  });
});
