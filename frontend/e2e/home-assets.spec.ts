import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';

const PNG_TRUECOLOUR_WITHOUT_ALPHA = 2;

function pngSize(png: Buffer): [number, number] {
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

function pngColourType(png: Buffer): number {
  return png[25];
}

test.describe("Given the site's SVG tab icon", () => {
  async function drawn(page: Page, svg: string, size: number): Promise<Buffer> {
    const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(`<img width="${size}" height="${size}" src="${source}">`);
    await page.locator('img').evaluate((image: HTMLImageElement) => image.decode());
    return page.locator('img').screenshot({ omitBackground: true });
  }

  for (const size of [16, 32]) {
    test(`when it is drawn at ${size} px, then it shows the face of the star`, async ({
      page,
      request,
    }) => {
      const svg = await (await request.get('/favicon.svg')).text();
      const withoutFace = svg.replace(/<g class="face"[^>]*>[\s\S]*?<\/g>/, '');
      expect(withoutFace).not.toEqual(svg);

      expect(await drawn(page, svg, size)).not.toEqual(await drawn(page, withoutFace, size));
    });
  }
});

test.describe('Given a visitor on the home page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test("when it loads, then nothing is fetched from another site and the fonts are the site's own", async ({
    page,
    baseURL,
  }) => {
    const elsewhere: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(baseURL!) && !request.url().startsWith('data:')) {
        elsewhere.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForFunction(() => {
      const loaded = [...document.fonts].filter((face) => face.status === 'loaded');
      return (
        loaded.some(
          (face) => face.family.includes('Playfair Display') && face.style === 'italic',
        ) && loaded.some((face) => face.family.includes('Inter'))
      );
    });

    expect(elsewhere).toEqual([]);
  });

  test('when it loads, then it links a tab icon only as SVG and an opaque 180 px home-screen icon, all served by the site', async ({
    page,
    request,
  }) => {
    await page.goto('/');

    const links = await page
      .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const link = element as HTMLLinkElement;
          return {
            rel: link.rel,
            path: new URL(link.href).pathname,
            type: link.type,
            sizes: link.sizes.value,
          };
        }),
      );
    expect(links).toEqual([
      { rel: 'icon', path: '/favicon.svg', type: 'image/svg+xml', sizes: '' },
      { rel: 'apple-touch-icon', path: '/apple-touch-icon.png', type: '', sizes: '' },
    ]);

    expect((await request.get('/favicon.ico')).status()).toBe(404);

    const svg = await request.get('/favicon.svg');
    expect(svg.ok()).toBe(true);
    expect(await svg.text()).toContain('<svg');

    const touch = await request.get('/apple-touch-icon.png');
    expect(touch.ok()).toBe(true);
    const png = await touch.body();
    expect(pngSize(png)).toEqual([180, 180]);
    expect(pngColourType(png)).toBe(PNG_TRUECOLOUR_WITHOUT_ALPHA);
  });

  test('when a server dashboard asks for the app icon, then the site serves it as a 512 px PNG', async ({
    request,
  }) => {
    const icon = await request.get('/app-icon.png');

    expect(icon.ok()).toBe(true);
    expect(icon.headers()['content-type']).toBe('image/png');
    expect(pngSize(await icon.body())).toEqual([512, 512]);
  });

  test('when a server dashboard asks for the app icon as SVG, then the site serves the white tile with the star', async ({
    request,
  }) => {
    const icon = await request.get('/app-icon.svg');

    expect(icon.ok()).toBe(true);
    expect(icon.headers()['content-type']).toContain('image/svg+xml');
    const svg = await icon.text();
    expect(svg).toContain('<rect width="1024" height="1024" rx="230" fill="#fff"/>');
    expect(svg).toContain('fill="#005dab"');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('when it loads, then the photos the phone layout hides are never downloaded', async ({
      page,
    }) => {
      const images: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'image') {
          images.push(new URL(request.url()).pathname);
        }
      });

      await page.goto('/');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState('networkidle');

      expect(
        images.filter(
          (path) => path.startsWith('/images/about-') || path.startsWith('/images/donate-'),
        ),
      ).toEqual([]);
      expect(images.some((path) => path.startsWith('/images/hero-'))).toBe(true);
    });
  });
});
