import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, samplePngBase64, session } from './donor-session';
import {
  noSignature,
  noSignatory,
  refusedVector,
  signatory,
  uploadedSignature,
  vectorSignature,
} from './signature-image';

const PEOPLE = '/api/admin/content/people';
const MEDIA = '/api/admin/content/media';
const PERSON_ID = '0199f3e0-0000-7000-8000-00000000c001';
const PORTRAIT_ID = '0199f3e0-0000-7000-8000-00000000c101';
const SIGNATURE_ID = '0199f3e0-0000-7000-8000-00000000c201';
const PNG = Buffer.from(samplePngBase64, 'base64');
const SIGNATORY = '/api/admin/donations/receipt-signatory';
const RECEIPT_SIGNATURE = `/api/admin/donations/receipt-signatures/${PERSON_ID}`;
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

function member(body: PersonBody, webSignature: ReturnType<typeof image> | null = null) {
  return {
    id: PERSON_ID,
    name: body.name,
    role: body.role,
    position: 0,
    onBoard: body.onBoard,
    boardNote: body.boardNote,
    featured: body.featured,
    portrait: body.portraitId ? image(body.portraitId, 640, 640) : null,
    webSignature,
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

  test('when they add a person with a portrait and e-mails, set a web signature and remove the person, then each step reaches the administration and the page says what happened', async ({
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
          return route.fulfill({ json: { members: saved ? [saved] : [], note: null } });
        }
        sent.push([request.method(), path, request.postDataJSON()]);
        if (request.method() === 'POST' && path === PEOPLE) {
          saved = member(request.postDataJSON() as PersonBody);
          return route.fulfill({ status: 201, json: saved });
        }
        if (path.endsWith('/web-signature') && saved) {
          saved = { ...saved, webSignature: image(SIGNATURE_ID, 600, 180) };
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
      ['POST', `${PEOPLE}/${PERSON_ID}/web-signature`, { imageId: SIGNATURE_ID }],
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
      (route) => route.fulfill({ json: { members: [member(EVA)], note: null } }),
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

  test('when they upload a scan of the receipt signature and remove it again, then the part shows it and asks before removing', async ({
    page,
  }) => {
    let current: object = noSignature;
    const methods: string[] = [];
    await page.route(
      (url) => url.pathname === SIGNATORY,
      (route) => route.fulfill({ json: signatory({ personId: PERSON_ID, name: 'Eva Vzorová' }) }),
    );
    await page.route(
      (url) => url.pathname === RECEIPT_SIGNATURE,
      (route) => {
        const method = route.request().method();
        methods.push(method);
        if (method === 'POST') {
          current = uploadedSignature;
        }
        if (method === 'DELETE') {
          current = noSignature;
          return route.fulfill({ status: 204, body: '' });
        }
        return route.fulfill({ json: current });
      },
    );

    await page.goto('/sprava/lide-fondu');
    await page.getByRole('button', { name: 'Upravit: Eva Vzorová' }).click();
    const part = page.locator('app-receipt-signature');
    await expect(part).toContainText('Podpis není nahraný.');

    await part.getByLabel('Nahrát podpis na potvrzení').setInputFiles({
      name: 'podpis.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('JPEG'),
    });

    await expect(part.getByRole('img', { name: 'Nahraný podpis' })).toBeVisible();
    await expect(part.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Podpis je uložený. Ponesou ho potvrzení vystavená od teď.',
    );
    await expect(part).toContainText('Nahráno 23. 10. 2026 21:30, 600 × 200 px.');

    await part.getByRole('button', { name: 'Odebrat podpis z potvrzení' }).click();
    const confirmation = part.getByRole('group', { name: 'Odebrat podpis z potvrzení?' });
    await expect(confirmation).toContainText('bez podpisu');
    await confirmation.getByRole('button', { name: 'Odebrat podpis z potvrzení' }).click();

    await expect(part.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Podpis je odebraný. Potvrzení vystavená od teď ho nebudou mít.',
    );
    await expect(part.getByRole('img', { name: 'Nahraný podpis' })).toHaveCount(0);
    expect(methods.filter((method) => method !== 'GET')).toEqual(['POST', 'DELETE']);
  });

  test('when they upload a vector receipt signature, then the part draws it, a refused SVG keeps it with the reason first, and a scan and an SVG replace each other', async ({
    page,
  }) => {
    let current: object = noSignature;
    let uploads = 0;
    await page.route(
      (url) => url.pathname === SIGNATORY,
      (route) => route.fulfill({ json: signatory({ personId: PERSON_ID, name: 'Eva Vzorová' }) }),
    );
    const answers: object[] = [vectorSignature, refusedVector, uploadedSignature, vectorSignature];
    await page.route(
      (url) => url.pathname === RECEIPT_SIGNATURE,
      (route) => {
        if (route.request().method() !== 'POST') {
          return route.fulfill({ json: current });
        }
        const answer = answers[uploads++];
        if (answer === refusedVector) {
          return route.fulfill({
            status: 400,
            contentType: 'application/problem+json',
            body: JSON.stringify(refusedVector),
          });
        }
        current = answer;
        return route.fulfill({ json: current });
      },
    );

    await page.goto('/sprava/lide-fondu');
    await page.getByRole('button', { name: 'Upravit: Eva Vzorová' }).click();
    const part = page.locator('app-receipt-signature');
    const saved = part.getByRole('status').filter({ hasText: /\S/ });
    const alert = part.getByRole('alert').filter({ hasText: /\S/ });
    await expect(part).toContainText('Podpis není nahraný.');

    await part.getByLabel('Nahrát podpis na potvrzení').setInputFiles({
      name: 'podpis.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"/>'),
    });

    const drawing = part.locator('svg.signature-artwork');
    await expect(drawing).toBeVisible();
    await expect(drawing).toHaveAccessibleName('Nahraný podpis');
    await expect(drawing.locator('path')).toHaveCount(2);
    await expect(part).toContainText('Nahráno 23. 10. 2026 21:30, vektorový podpis (SVG).');
    await expect(saved).toHaveText('Podpis je uložený. Ponesou ho potvrzení vystavená od teď.');

    await part.getByLabel('Nahrát jiný podpis na potvrzení').setInputFiles({
      name: 'jiny.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg><script/></svg>'),
    });

    await expect(alert).toHaveText(
      'SVG nejde použít jako podpis. Soubor obsahuje nepovolený prvek. Ručně psaný podpis v SVG jde, když jsou jeho tahy převedené na vyplněné tvary (path); obrysy s nastavenou tloušťkou čáry (stroke) a efekty web nepřijme a soubor smí mít nejvýš 200 kB. Místo něj můžete nahrát sken JPEG, PNG nebo WebP.',
    );
    await expect(drawing.locator('path')).toHaveCount(2);

    await part.getByLabel('Nahrát jiný podpis na potvrzení').setInputFiles({
      name: 'podpis.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    });

    const scan = part.locator('img.signature-artwork');
    await expect(scan).toBeVisible();
    await expect(drawing).toHaveCount(0);
    await expect(part).toContainText('Nahráno 23. 10. 2026 21:30, 600 × 200 px.');
    await expect(saved).toHaveText('Podpis je uložený. Ponesou ho potvrzení vystavená od teď.');
    await expect(alert).toHaveCount(0);

    await part.getByLabel('Nahrát jiný podpis na potvrzení').setInputFiles({
      name: 'podpis.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"/>'),
    });

    await expect(drawing.locator('path')).toHaveCount(2);
    await expect(scan).toHaveCount(0);
    await expect(part).toContainText('Nahráno 23. 10. 2026 21:30, vektorový podpis (SVG).');
    expect(uploads).toBe(4);
  });

  test('when the vector receipt signature is shown in a dark forced-colours mode, then its frame keeps the paper and the ink keeps its colour', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await page.route(
      (url) => url.pathname === RECEIPT_SIGNATURE,
      (route) => route.fulfill({ json: vectorSignature }),
    );

    await page.goto('/sprava/lide-fondu');
    await page.getByRole('button', { name: 'Upravit: Eva Vzorová' }).click();
    const frame = page.locator('app-receipt-signature .signature-frame');
    await expect(frame.locator('path')).toHaveCount(2);

    const colours = await frame.evaluate((element) => ({
      adjust: getComputedStyle(element).forcedColorAdjust,
      paper: getComputedStyle(element).backgroundColor,
      ink: getComputedStyle(element.querySelector('path') as Element).fill,
    }));
    expect(colours.adjust).toBe('none');
    expect(colours.paper).not.toBe('rgb(0, 0, 0)');
    expect(colours.ink).toBe('rgb(29, 42, 92)');
  });
});

test.describe('Given a visitor and people of the foundation kept in the administration', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await servePhotos(page);
  });

  test('when they open the home page, then "Kdo fond vede" shows the cards, the founders note with the signature and the board line instead of the built-in block', async ({
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
                signatures: [{ ...image(SIGNATURE_ID, 600, 180), name: 'Eva Vzorová' }],
              },
            },
          },
        }),
    );

    await page.goto('/');
    const board = page.locator('#o-nas .board');
    await board.scrollIntoViewIfNeeded();

    await expect(board.locator('.board-name')).toHaveText(['Eva Vzorová', 'Adam Vzor']);
    await expect(board.locator('.board-photo img').first()).toHaveAttribute(
      'src',
      `/api/content/media/${PORTRAIT_ID}?w=480`,
    );
    await expect(board.locator('.founders-note-text')).toHaveText([
      'Fond jsme založili, abychom pomáhali.',
      'Děkujeme.',
    ]);
    await expect(board.locator('.signature-ink')).toHaveAttribute(
      'src',
      `/api/content/media/${SIGNATURE_ID}?w=480`,
    );
    await expect(board.locator('.signature-name')).toHaveText('Eva Vzorová');
    await expect(board.locator('.board-members')).toHaveText(
      'Správní rada: Eva Vzorová (předsedkyně), Adam Vzor.',
    );
  });
});
