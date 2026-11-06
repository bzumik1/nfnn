import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { aboutPhoto } from '../testing/about-fixtures';
import { publicPeople } from '../testing/people-fixtures';
import { AboutPage } from './about-page';
import { HomeScreenApp } from '../../../core/layout/home-screen-app';
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

  it('when it opens, then it names the founding story as its one level-one heading and ends with the contact form', () => {
    http.expectOne('/api/content/home').flush({ news: [], projects: [] });
    fixture.detectChanges();

    expect(Array.from(root().querySelectorAll('h1')).map((h) => h.textContent?.trim())).toEqual([
      'Vznik a poslání',
    ]);
    expect(root().querySelector('#o-nas')).not.toBeNull();
    expect(root().lastElementChild?.querySelector('#kontakt')).not.toBeNull();
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

    const board = root().querySelector('#o-nas .board')!;
    expect(board.querySelector('.board-name')?.textContent?.trim()).toBe('Eva Vzorová');
    expect(board.querySelector('.founders-note')).not.toBeNull();
    expect(board.querySelector('img[src^="/images/"]')).toBeNull();
  });

  it('when the home content keeps no people of the foundation, then the block of who runs it keeps its own cards', () => {
    http
      .expectOne('/api/content/home')
      .flush({ news: [], projects: [], about: { photo: null }, people: null });
    fixture.detectChanges();

    const board = root().querySelector('#o-nas .board')!;
    expect(board.querySelectorAll('.board-person img[src^="/images/"]').length).toBe(2);
    expect(board.querySelector('.founders-note')).toBeNull();
  });

  it('when the home content has no About photo or cannot be loaded, then the About section keeps its placeholder photo', () => {
    http.expectOne('/api/content/home').flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    const section = root().querySelector('#o-nas')!;
    expect(section.querySelector('figure')).toBeNull();
    expect(section.querySelector('img')?.getAttribute('src')).toBe('/images/about-720.webp');
  });
});

describe('Given the About page', () => {
  async function openIn(onTouchScreen: boolean): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [AboutPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: HomeScreenApp, useValue: { onTouchScreen } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/content/home').flush({ news: [], projects: [] });
    http
      .match('/api/donations/payment-details')
      .forEach((request) => request.flush(foundationPaymentDetails()));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('when it opens in the app from the home screen of an iPhone or iPad, then its contact section ends with the rows of the foundation instead of a footer', async () => {
    const contact = (await openIn(true)).querySelector('#kontakt');

    expect(contact?.querySelector('.ui-container')?.lastElementChild?.localName).toBe(
      'app-foundation-links',
    );
  });

  it('when it opens in a browser, then it leaves the foundation to the footer of the site', async () => {
    expect((await openIn(false)).querySelector('app-foundation-links')).toBeNull();
  });
});
