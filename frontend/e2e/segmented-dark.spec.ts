import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { rememberedAdministrator, routeLogsApi } from './admin-logs-api';
import { mockDonorApi, openSignInDialog } from './donor-session';
import { segmentContrasts, wrapSegments } from './segmented';

const THUMB_ON_TRACK = 2;
const TEXT_ON_THUMB = 4.5;
const EDGE_ON_TRACK = 3;

interface Choice {
  name: string;
  shot: string;
  width: number;
  open: (page: Page) => Promise<Locator>;
}

async function signInChoice(page: Page): Promise<Locator> {
  await mockDonorApi(page);
  await openSignInDialog(page);
  return page.getByRole('dialog').locator('.tab-switch');
}

const CHOICES: Choice[] = [
  {
    name: 'Přihlášení or Registrace in the sign-in dialog',
    shot: 'sign-in-dialog',
    width: 390,
    open: signInChoice,
  },
  {
    name: 'Člověk or Firma in the registration dialog',
    shot: 'registration-dialog',
    width: 390,
    open: async (page) => {
      await mockDonorApi(page);
      await openSignInDialog(page);
      await page.getByRole('dialog').getByRole('button', { name: 'Registrace' }).click();
      return page.getByRole('dialog').getByRole('radiogroup', { name: 'Registruji se jako' });
    },
  },
  {
    name: 'what Platby shows',
    shot: 'admin-payments',
    width: 1280,
    open: async (page) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/admin/donations/payments',
        (route) => route.fulfill({ json: { year: null, availableYears: [], items: [], total: 0 } }),
      );
      await rememberedAdministrator(page);
      await page.goto('/sprava/platby');
      return page.getByRole('group', { name: 'Zobrazit' });
    },
  },
  {
    name: 'Vše, Varování or Chyby in the log reader',
    shot: 'admin-log-reader',
    width: 1280,
    open: async (page) => {
      await mockDonorApi(page);
      await routeLogsApi(page);
      await rememberedAdministrator(page);
      await page.goto('/sprava/logy/soubor?nazev=backend.log');
      return page.getByRole('radiogroup', { name: 'Které záznamy ukázat' });
    },
  },
];

async function openAt(page: Page, choice: Choice): Promise<Locator> {
  await page.setViewportSize({ width: choice.width, height: 844 });
  const group = await choice.open(page);
  await expect(group).toBeVisible();
  await expect(group.locator('.ui-segmented__thumb')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return group;
}

async function attachCrop(group: Locator, name: string): Promise<void> {
  await test.info().attach(name, {
    body: await group.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

test.describe('Given a visitor whose device shows the dark appearance at a segmented choice', () => {
  test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

  for (const choice of CHOICES) {
    test(`when ${choice.name} is shown ${choice.width} px wide, then the thumb stands at least 2 : 1 against its track and the chosen label at least 4.5 : 1 on it`, async ({
      page,
    }) => {
      const group = await openAt(page, choice);

      const measured = await segmentContrasts(group);

      await attachCrop(group, `${choice.shot}-dark-${choice.width}.png`);
      expect(measured.thumbRests).toBe(true);
      expect(measured.thumbOnTrack).toBeGreaterThanOrEqual(THUMB_ON_TRACK);
      expect(measured.textOnThumb).toBeGreaterThanOrEqual(TEXT_ON_THUMB);
    });

    test(`when ${choice.name} is shown ${choice.width} px wide and the system asks for more contrast, then the thumb's edge stands at least 3 : 1 against its track while the thumb keeps its size and place`, async ({
      page,
    }) => {
      const group = await openAt(page, choice);
      const ordinary = await segmentContrasts(group);

      await page.emulateMedia({ contrast: 'more' });

      const more = await segmentContrasts(group);
      await attachCrop(group, `${choice.shot}-dark-more-contrast-${choice.width}.png`);
      expect(more.thumbRests).toBe(true);
      expect(more.edgeOnTrack).toBeGreaterThanOrEqual(EDGE_ON_TRACK);
      expect(more.textOnThumb).toBeGreaterThanOrEqual(TEXT_ON_THUMB);
      expect(more.pill).toEqual(ordinary.pill);
    });
  }

  test('when the segments of the sign-in dialog wrap and the thumb steps out, then the chosen segment stands at least 2 : 1 against the track with its label at least 4.5 : 1 on it', async ({
    page,
  }) => {
    const group = await openAt(page, CHOICES[0]);

    await wrapSegments(group);

    const measured = await segmentContrasts(group);
    await attachCrop(group, 'sign-in-dialog-wrapped-dark-390.png');
    expect(measured.thumbRests).toBe(false);
    expect(measured.thumbOnTrack).toBeGreaterThanOrEqual(THUMB_ON_TRACK);
    expect(measured.textOnThumb).toBeGreaterThanOrEqual(TEXT_ON_THUMB);
  });

  test('when the segments of the sign-in dialog wrap and the system asks for more contrast, then the chosen segment carries the same edge at least 3 : 1 against the track while it keeps its size and place', async ({
    page,
  }) => {
    const group = await openAt(page, CHOICES[0]);
    await wrapSegments(group);
    const ordinary = await segmentContrasts(group);

    await page.emulateMedia({ contrast: 'more' });

    const more = await segmentContrasts(group);
    await attachCrop(group, 'sign-in-dialog-wrapped-dark-more-contrast-390.png');
    expect(more.thumbRests).toBe(false);
    expect(more.edgeOnTrack).toBeGreaterThanOrEqual(EDGE_ON_TRACK);
    expect(more.pill).toEqual(ordinary.pill);
  });
});

test.describe('Given a visitor whose device shows the light appearance at a segmented choice', () => {
  test.use({ colorScheme: 'light', reducedMotion: 'reduce' });

  test('when the system asks for more contrast, then the thumb of the sign-in dialog draws no edge of its own', async ({
    page,
  }) => {
    const group = await openAt(page, CHOICES[0]);
    const ordinary = await segmentContrasts(group);

    await page.emulateMedia({ contrast: 'more' });

    const more = await segmentContrasts(group);
    expect(more.edgeOnTrack).toBeCloseTo(more.thumbOnTrack, 5);
    expect(more.thumbOnTrack).toBeCloseTo(ordinary.thumbOnTrack, 5);
    expect(more.pill).toEqual(ordinary.pill);
  });
});
