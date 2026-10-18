import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrivacyPolicy } from './privacy-policy';

describe('Given the privacy policy page', () => {
  let fixture: ComponentFixture<PrivacyPolicy>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrivacyPolicy],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(PrivacyPolicy);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function texts(selector: string): string[] {
    return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll(selector)).map(
      (element) => element.textContent!.trim(),
    );
  }

  it('when it renders, then its only main heading names the policy', () => {
    expect(texts('h1')).toEqual(['Zásady ochrany osobních údajů']);
  });

  it('when it renders, then it walks through every part of the policy in order', () => {
    expect(texts('h2')).toEqual([
      'Správce osobních údajů',
      'Jaké údaje zpracováváme a proč',
      'Jak dlouho údaje uchováváme',
      'Komu údaje předáváme',
      'Cookies',
      'Vaše práva',
      'Kontakt',
      'Účinnost',
    ]);
  });

  it('when it renders, then it explains each processing purpose on its own', () => {
    expect(texts('h3')).toEqual([
      'Dárcovský účet',
      'Evidence darů a potvrzení o daru',
      'Kontaktní formulář',
    ]);
  });

  it('when it renders, then it names the controller with its company ID and seat', () => {
    expect(texts('#privacy-controller p').join(' ')).toContain(
      'Nová naděje - nadační fond, IČO 27278794, se sídlem Jiráskova 436, 473 01 Nový Bor',
    );
  });

  it('when it renders, then the contact e-mail is a mailto link', () => {
    const link = fixture.nativeElement.querySelector('a[href^="mailto:"]') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('mailto:info@nfnn.cz');
    expect(link.textContent!.trim()).toBe('info@nfnn.cz');
  });

  it('when it renders, then the contact section links to the contact form on the home page', () => {
    const link = fixture.nativeElement.querySelector('a[href="/#contact"]') as HTMLAnchorElement;

    expect(link.textContent!.trim()).toBe('kontaktní formulář');
  });
});
