import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, samplePngBase64, session } from './donor-session';
import { noSignatory, signatory } from './signature-image';

const PEOPLE = '/api/admin/content/people';
const MEDIA = '/api/admin/content/media';
const PERSON_ID = '0199f3e0-0000-7000-8000-00000000c001';
const PORTRAIT_ID = '0199f3e0-0000-7000-8000-00000000c101';
const SIGNATURE_ID = '0199f3e0-0000-7000-8000-00000000c201';
const PNG = Buffer.from(samplePngBase64, 'base64');
const SIGNATORY = '/api/admin/donations/receipt-signatory';
const EVA: PersonBody = {
  name: 'Eva Vzorová',
  role: 'Zakladatelka',
  onBoard: true,
  boardNote: null,
  featured: true,
  portraitId: PORTRAIT_ID,
  personalEmail: null,
  fundEmail: null,
};

interface PersonBody {
  name: string;
  role: string | null;
  onBoard: boolean;
  boardNote: string | null;
  featured: boolean;
  portraitId: string | null;
  personalEmail: string | null;
  fundEmail: string | null;
}

function image(id: string, width: number, height: number) {
  return { id, url: `/api/content/media/${id}`, width, height };
}

function member(body: PersonBody, signature: ReturnType<typeof image> | null = null) {
  return {
    id: PERSON_ID,
    name: body.name,
    role: body.role,
    position: 0,
    onBoard: body.onBoard,
    boardNote: body.boardNote,
    featured: body.featured,
    portrait: body.portraitId ? image(body.portraitId, 640, 640) : null,
    signature,
    personalEmail: body.personalEmail,
    fundEmail: body.fundEmail,
  };
}

async function servePhotos(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/png', body: PNG }),
  );
}

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator who keeps the people of the foundation', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
    await rememberedSession(page);
  });

  test('when they add a person with a portrait and e-mails, set a signature and remove the person, then each step reaches the administration and the page says what happened', async ({
    page,
  }) => {
    const sent: unknown[] = [];
    let saved: ReturnType<typeof member> | null = null;
    const uploads = [image(PORTRAIT_ID, 640, 640), image(SIGNATURE_ID, 600, 180)];
    await page.route(
      (url) => url.pathname === MEDIA,
      (route) => route.fulfill({ status: 201, json: uploads.shift() }),
    );
    await page.route(
      (url) => url.pathname.startsWith(PEOPLE),
      (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === 'GET') {
          return route.fulfill({
            json: {
              members: saved ? [saved] : [],
              note: null,
              footnote: null,
              noteVersion: '6a0c1e3f9b2d4875',
              footnoteVersion: '1f8e2d7c4b6a9035',
            },
          });
        }
        sent.push([request.method(), path, request.postDataJSON()]);
        if (request.method() === 'POST' && path === PEOPLE) {
          saved = member(request.postDataJSON() as PersonBody);
          return route.fulfill({ status: 201, json: saved });
        }
        if (path.endsWith('/signature') && saved) {
          saved = { ...saved, signature: image(SIGNATURE_ID, 600, 180) };
          return route.fulfill({ json: saved });
        }
        saved = null;
        return route.fulfill({ status: 204 });
      },
    );

    await page.goto('/sprava/lide-fondu');
    await expect(page.getByRole('heading', { level: 1, name: 'Lidé fondu' })).toBeFocused();
    await expect(
      page.getByText('Zatím tu nikdo není, web ukazuje svůj vlastní blok „Kdo fond vede“.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Přidat osobu' }).click();
    await expect(page.getByLabel('Jméno a příjmení')).toBeFocused();
    await page.getByLabel('Jméno a příjmení').fill('Eva Vzorová');
    await page.getByLabel('Role pod jménem (nepovinné)').fill('Zakladatelka');
    await page.getByLabel('Karta s portrétem a rolí v bloku „Kdo fond vede“').check();
    await page.getByLabel('Osobní e-mail (nepovinné)').fill('eva@example.org');
    await page.getByLabel('E-mail ve fondu (nepovinné)').fill('eva@nfnn.cz');
    await page.getByLabel('Nahrát portrét').setInputFiles({
      name: 'eva.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.locator('.portrait-preview')).toBeVisible();
    await page.getByRole('button', { name: 'Přidat a ukázat na webu' }).click();

    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Přidali jsme mezi lidi fondu: Eva Vzorová. Web ukazuje změnu hned.',
    );
    await expect(page.getByRole('button', { name: 'Upravit: Eva Vzorová' })).toBeFocused();

    await page.getByRole('button', { name: 'Upravit: Eva Vzorová' }).click();
    await expect(page.getByLabel('E-mail ve fondu (nepovinné)')).toHaveValue('eva@nfnn.cz');
    await page.getByLabel('Nahrát podpis', { exact: true }).setInputFiles({
      name: 'podpis.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(
      page.locator('.signature-part').getByRole('status').filter({ hasText: /\S/ }),
    ).toHaveText('Podpis je uložený a ukáže se pod slovem zakladatelů.');

    await page.getByRole('button', { name: 'Odebrat osobu z webu' }).click();
    const confirmation = page.getByRole('group', { name: 'Odebrat osobu?' });
    await expect(confirmation).toContainText('Opravdu odebrat z webu osobu Eva Vzorová?');
    await confirmation.getByRole('button', { name: 'Odebrat a smazat' }).click();

    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Eva Vzorová už mezi lidmi fondu není; portrét a podpis jsme smazali.',
    );
    await expect(page.getByRole('button', { name: 'Přidat osobu' })).toBeFocused();
    expect(sent).toEqual([
      [
        'POST',
        PEOPLE,
        {
          name: 'Eva Vzorová',
          role: 'Zakladatelka',
          onBoard: false,
          boardNote: null,
          featured: true,
          portraitId: PORTRAIT_ID,
          personalEmail: 'eva@example.org',
          fundEmail: 'eva@nfnn.cz',
        },
      ],
      ['POST', `${PEOPLE}/${PERSON_ID}/signature`, { imageId: SIGNATURE_ID }],
      ['DELETE', `${PEOPLE}/${PERSON_ID}`, null],
    ]);
  });
});

test.describe('Given an administrator who chooses who signs the receipts', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
    await rememberedSession(page);
    await page.route(
      (url) => url.pathname === PEOPLE,
      (route) =>
        route.fulfill({
          json: {
            members: [member(EVA)],
            note: null,
            footnote: null,
            noteVersion: '6a0c1e3f9b2d4875',
            footnoteVersion: '1f8e2d7c4b6a9035',
          },
        }),
    );
  });

  test('when they let a person sign the receipts with a role of their own, then the choice reaches the administration and the person is marked as the signatory', async ({
    page,
  }) => {
    const chosen: unknown[] = [];
    let current: object = noSignatory;
    await page.route(
      (url) => url.pathname === SIGNATORY,
      (route) => {
        if (route.request().method() === 'PUT') {
          chosen.push(route.request().postDataJSON());
          const view = signatory({
            personId: PERSON_ID,
            name: 'Eva Vzorová',
            receiptRole: 'předsedkyně správní rady',
            portrait: true,
          });
          current = view;
          return route.fulfill({ json: view.signatory });
        }
        return route.fulfill({ json: current });
      },
    );

    await page.goto('/sprava/lide-fondu');
    await page.getByRole('button', { name: 'Upravit: Eva Vzorová' }).click();
    const part = page.locator('.receipt-part');
    await expect(part).toContainText(
      'Potvrzení teď nikdo nepodepisuje, a tak je web dárcům nevystaví.',
    );

    await part.getByLabel('Podepisuje potvrzení').check();
    await part.getByLabel('Funkce na potvrzení').fill('předsedkyně správní rady');
    await part.getByRole('button', { name: 'Uložit pro potvrzení' }).click();

    await expect(part.getByRole('status').filter({ hasText: /\S/ }).first()).toHaveText(
      'Potvrzení vystavená od teď podepisuje Eva Vzorová s funkcí předsedkyně správní rady.',
    );
    await expect(part).toContainText('Tato osoba podepisuje potvrzení o daru.');
    expect(chosen).toEqual([{ personId: PERSON_ID, receiptRole: 'předsedkyně správní rady' }]);
  });

  test('when they upload the signature of the person who signs the receipts, then the page says the receipts print it from now on and the administrators are told', async ({
    page,
  }) => {
    const sent: unknown[] = [];
    await page.route(
      (url) => url.pathname === SIGNATORY,
      (route) => route.fulfill({ json: signatory({ personId: PERSON_ID, name: 'Eva Vzorová' }) }),
    );
    await page.route(
      (url) => url.pathname === MEDIA,
      (route) => route.fulfill({ status: 201, json: image(SIGNATURE_ID, 600, 180) }),
    );
    await page.route(
      (url) => url.pathname === `${PEOPLE}/${PERSON_ID}/signature`,
      (route) => {
        sent.push([route.request().method(), route.request().postDataJSON()]);
        return route.fulfill({ json: member(EVA, image(SIGNATURE_ID, 600, 180)) });
      },
    );

    await page.goto('/sprava/lide-fondu');
    await page.getByRole('button', { name: 'Upravit: Eva Vzorová' }).click();
    const part = page.locator('.signature-part');
    await expect(part).toContainText('vytiskne se na potvrzeních o daru, která osoba podepisuje');
    await part.getByLabel('Nahrát podpis', { exact: true }).setInputFiles({
      name: 'podpis.png',
      mimeType: 'image/png',
      buffer: PNG,
    });

    await expect(part.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Podpis je uložený. Ukáže se pod slovem zakladatelů a vytiskne se na potvrzeních o daru vystavených od teď; správci o změně dostanou e-mail.',
    );
    await expect(page.locator('app-receipt-signature')).toHaveCount(0);
    await expect(
      page.locator('.ui-person-list').getByRole('img', { name: 'Podpis: Eva Vzorová' }),
    ).toBeVisible();
    expect(sent).toEqual([['POST', { imageId: SIGNATURE_ID }]]);
  });
});

test.describe('Given a visitor and people of the foundation kept in the administration', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
  });

  test('when they open the About page, then the founders’ note shows as a quote signed with the web signature, portrait and role, with the board line, instead of the built-in block', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/api/content/home',
      (route) =>
        route.fulfill({
          json: {
            news: [],
            projects: [],
            about: { photo: null },
            people: {
              featured: [
                {
                  name: 'Eva Vzorová',
                  role: 'Zakladatelka',
                  portrait: image(PORTRAIT_ID, 640, 640),
                },
                { name: 'Adam Vzor', role: null, portrait: null },
              ],
              board: [
                { name: 'Eva Vzorová', note: 'předsedkyně' },
                { name: 'Adam Vzor', note: null },
              ],
              note: {
                text: 'Fond jsme založili, abychom pomáhali.\n\nDěkujeme.',
                signatures: [
                  {
                    ...image(SIGNATURE_ID, 600, 180),
                    name: 'Eva Vzorová',
                    role: 'Zakladatelka',
                    portrait: image(PORTRAIT_ID, 640, 640),
                  },
                ],
              },
            },
          },
        }),
    );

    await page.goto('/o-nas');
    const founders = page.locator('#o-nas .founders');
    await expect(founders.locator('.signer-name')).toHaveText(['Eva Vzorová']);
    await founders.scrollIntoViewIfNeeded();

    await expect(founders.locator('.quote-text p')).toHaveText([
      'Fond jsme založili, abychom pomáhali.',
      'Děkujeme.',
    ]);
    await expect(founders.locator('.signer-ink')).toHaveAttribute(
      'src',
      `/api/content/media/${SIGNATURE_ID}?w=480`,
    );
    await expect(founders.locator('.signer-photo img')).toHaveAttribute(
      'src',
      `/api/content/media/${PORTRAIT_ID}?w=480`,
    );
    await expect(founders.locator('.signer-name')).toHaveText('Eva Vzorová');
    await expect(founders.locator('.signer-role')).toHaveText('Zakladatelka');
    await expect(founders.locator('.board-members')).toHaveText(
      'Správní rada: Eva Vzorová (předsedkyně), Adam Vzor.',
    );
  });
});
