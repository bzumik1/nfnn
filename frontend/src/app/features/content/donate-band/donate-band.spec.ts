import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DonateBandPhotoResponse } from '../donate-band-api';
import { DONATE_BAND_PHOTO_ID, donateBandPhoto } from '../testing/donate-band-fixtures';
import { DonateBand } from './donate-band';

describe('Given the Přispět band that ends a tab', () => {
  let fixture: ComponentFixture<DonateBand>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(DonateBand);
    fixture.componentRef.setInput('heading', 'Pomozte nám napsat další příběh');
    fixture.componentRef.setInput(
      'lead',
      'Každý příspěvek jde do poslední koruny konkrétnímu dítěti nebo rodině.',
    );
  });

  async function render(photo: DonateBandPhotoResponse | null = null): Promise<HTMLElement> {
    fixture.componentRef.setInput('photo', photo);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('when it shows, then it is a region named by its heading with the way to give and the way to the projects', async () => {
    const band = await render();

    const region = band.querySelector('section');
    const heading = band.querySelector('h2');
    expect(region?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(heading?.textContent).toBe('Pomozte nám napsat další příběh');
    expect(band.textContent).toContain('do poslední koruny');
    const links = [...band.querySelectorAll('a')].map((link) => [
      link.textContent?.trim(),
      link.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Přispět', '/prispet'],
      ['Kde pomáháme', '/projekty'],
    ]);
  });

  it('when it ends the projects themselves, then it leaves out the way to the projects', async () => {
    fixture.componentRef.setInput('showsProjects', false);
    const band = await render();

    expect([...band.querySelectorAll('a')].map((link) => link.textContent?.trim())).toEqual([
      'Přispět',
    ]);
  });

  it('when the administration set no photo, then it shows the photo the site always had, as decoration', async () => {
    const image = (await render()).querySelector('img')!;

    expect(image.getAttribute('src')).toBe('/images/donate-720.webp');
    expect(image.getAttribute('alt')).toBe('');
    expect(image.style.objectPosition).toBe('50% 30%');
  });

  it('when the administration set a photo, then it shows it in the widths the site stores, described and cropped around its focal point', async () => {
    const image = (await render(donateBandPhoto({ width: 1600 }))).querySelector('img')!;

    expect(image.getAttribute('src')).toBe(`/api/content/media/${DONATE_BAND_PHOTO_ID}?w=480`);
    expect(image.getAttribute('srcset')).toBe(
      `/api/content/media/${DONATE_BAND_PHOTO_ID}?w=480 480w, ` +
        `/api/content/media/${DONATE_BAND_PHOTO_ID}?w=960 960w, ` +
        `/api/content/media/${DONATE_BAND_PHOTO_ID}?w=1440 1440w`,
    );
    expect(image.getAttribute('alt')).toBe('Usměvavá dívka na zahradě');
    expect(image.style.objectPosition).toBe('62% 28%');
  });
});
