import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { aboutPhoto } from '../testing/about-fixtures';
import { publicPeople } from '../testing/people-fixtures';
import { DONATE_BAND_PHOTO_ID, donateBandPhoto } from '../testing/donate-band-fixtures';
import { AboutPage } from './about-page';
import { foundationPaymentDetails } from '../../donations/testing/payment-details-fixtures';

describe('Given the About page', () => {
  let fixture: ComponentFixture<AboutPage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AboutPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http
      .match('/api/donations/payment-details')
      .forEach((request) => request.flush(foundationPaymentDetails()));
    http.verify();
  });

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('when it opens, then it names the founding story as its one level-one heading, then asks for a gift and ends with the contact form', () => {
    http.expectOne('/api/content/home').flush({ news: [], projects: [] });
    fixture.detectChanges();

    expect(Array.from(root().querySelectorAll('h1')).map((h) => h.textContent?.trim())).toEqual([
      'Vznik a poslání',
    ]);
    expect(root().querySelector('#o-nas')).not.toBeNull();
    const band = root().querySelector('app-donate-band')!;
    expect(band.querySelector('h2')?.textContent).toBe('Pomozte nám napsat další příběh');
    expect(Array.from(band.querySelectorAll('a')).map((link) => link.textContent?.trim())).toEqual([
      'Přispět',
      'Kde pomáháme',
    ]);
    expect(band.querySelector('img')?.getAttribute('src')).toBe('/images/donate-720.webp');
    expect(root().lastElementChild?.querySelector('#kontakt')).not.toBeNull();
  });

  it('when the home content carries a photo for the Přispět band, then the band shows it', () => {
    http.expectOne('/api/content/home').flush({
      news: [],
      projects: [],
      donateBand: { photo: donateBandPhoto() },
    });
    fixture.detectChanges();

    expect(root().querySelector('app-donate-band img')?.getAttribute('src')).toBe(
      `/api/content/media/${DONATE_BAND_PHOTO_ID}?w=480`,
    );
  });

  it('when the home content carries a photo for the About section, then the section shows it instead of the placeholder', () => {
    http
      .expectOne('/api/content/home')
      .flush({ news: [], projects: [], about: { photo: aboutPhoto() } });
    fixture.detectChanges();

    const section = root().querySelector('#o-nas')!;
    expect(section.querySelector('figure img')?.getAttribute('alt')).toBe(
      'Malý chlapec v náručí dvou dospělých',
    );
    expect(section.querySelector('img[src^="/images/about-"]')).toBeNull();
  });

  it('when the home content carries the people of the foundation, then the block of who runs it shows them instead of its own cards', () => {
    http
      .expectOne('/api/content/home')
      .flush({ news: [], projects: [], about: { photo: null }, people: publicPeople() });
    fixture.detectChanges();

    const board = root().querySelector('#o-nas .founders')!;
    expect(board.querySelector('.signer-name')?.textContent?.trim()).toBe('Eva Vzorová');
    expect(board.querySelector('blockquote')).not.toBeNull();
    expect(board.querySelector('img[src^="/images/"]')).toBeNull();
  });

  it('when the home content keeps no people of the foundation, then the block of who runs it keeps its own cards', () => {
    http
      .expectOne('/api/content/home')
      .flush({ news: [], projects: [], about: { photo: null }, people: null });
    fixture.detectChanges();

    const board = root().querySelector('#o-nas .founders')!;
    expect(board.querySelectorAll('.signer img[src^="/images/"]').length).toBe(2);
    expect(board.querySelector('blockquote')).toBeNull();
  });

  it('when the home content has no About photo or cannot be loaded, then the About section keeps its placeholder photo', () => {
    http.expectOne('/api/content/home').flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    const section = root().querySelector('#o-nas')!;
    expect(section.querySelector('figure img')?.getAttribute('src')).toBe('/images/about-720.webp');
    expect(section.querySelector('figure app-zoomable')).toBeNull();
  });
});
