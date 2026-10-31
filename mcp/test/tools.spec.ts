import type { Client } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DONATION_ID,
  DONOR_ID,
  ERASED_RECEIPT_ID,
  GIVING_DONOR_ID,
  LINK_ID,
  MEDIA_ID,
  PAYMENT_ID,
  PERSON_ID,
  READ_TOKEN,
  RECEIPT_ID,
  REPLACING_DONOR_ID,
  SIGNED_PERSON_ID,
  UNKNOWN_ID,
  VERIFICATION_LINK,
  WRITE_TOKEN,
} from './fake-backend.js';
import { BROKEN_PHOTO_URL, connect, PHOTO_URL, startApp, textOf, type TestApp } from './support.js';

describe('Given an administrator connected with the reading permission only', () => {
  let stack: TestApp;
  let client: Client;

  beforeEach(async () => {
    stack = await startApp();
    client = await connect(stack.app, READ_TOKEN);
  });

  afterEach(async () => {
    await client.close();
    await stack.stop();
  });

  it('when the tools are listed, then the content tools say that live tells whether the site shows an item today', async () => {
    const { tools } = await client.listTools();
    const description = (name: string) => tools.find((tool) => tool.name === name)?.description;
    expect(description('nfnn_content')).toContain('live');
    expect(description('nfnn_news_article')).toContain('live');
    expect(description('nfnn_project')).toContain('live');
  });

  it('when the tools are listed, then every reading and writing tool is there with its annotations', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      'nfnn_about',
      'nfnn_add_person',
      'nfnn_admin_actions',
      'nfnn_administrators',
      'nfnn_backups',
      'nfnn_change_settings',
      'nfnn_content',
      'nfnn_create_news',
      'nfnn_create_project',
      'nfnn_diagnostics',
      'nfnn_disconnect_bank_account',
      'nfnn_donor',
      'nfnn_find_donors',
      'nfnn_issue_receipt',
      'nfnn_log',
      'nfnn_log_files',
      'nfnn_log_levels',
      'nfnn_log_search',
      'nfnn_news_article',
      'nfnn_order_people',
      'nfnn_overview',
      'nfnn_pair_payment',
      'nfnn_payments',
      'nfnn_people',
      'nfnn_photo_upload_link',
      'nfnn_project',
      'nfnn_project_order',
      'nfnn_publish_news',
      'nfnn_publish_project',
      'nfnn_receipt',
      'nfnn_receipt_signature',
      'nfnn_receipts',
      'nfnn_reconnect_bank_account',
      'nfnn_remove_person',
      'nfnn_remove_web_signature',
      'nfnn_report',
      'nfnn_request_backup',
      'nfnn_reset_log_level',
      'nfnn_send_report',
      'nfnn_send_test_email',
      'nfnn_set_log_level',
      'nfnn_set_project_order',
      'nfnn_set_web_signature',
      'nfnn_settings',
      'nfnn_since_last_sign_in',
      'nfnn_status',
      'nfnn_symbol_claims',
      'nfnn_thread_dump',
      'nfnn_unpair_payment',
      'nfnn_unpublish_news',
      'nfnn_unpublish_project',
      'nfnn_update_about',
      'nfnn_update_backup_schedule',
      'nfnn_update_founders_note',
      'nfnn_update_news',
      'nfnn_update_person',
      'nfnn_update_project',
      'nfnn_update_report_settings',
      'nfnn_upload_photo',
    ]);
    expect(tools.find((tool) => tool.name === 'nfnn_status')?.annotations?.readOnlyHint).toBe(true);
    expect(
      tools.find((tool) => tool.name === 'nfnn_unpair_payment')?.annotations?.destructiveHint,
    ).toBe(true);
    expect(
      tools.find((tool) => tool.name === 'nfnn_remove_web_signature')?.annotations?.destructiveHint,
    ).toBe(true);
  });

  it('when the tools are listed, then the web signature tools say the image goes up only as a file and is never the receipt signature', async () => {
    const { tools } = await client.listTools();
    for (const name of ['nfnn_set_web_signature', 'nfnn_remove_web_signature']) {
      const description = tools.find((tool) => tool.name === name)?.description;
      expect(description).toContain('never the receipt signature');
    }
    const setting = tools.find((tool) => tool.name === 'nfnn_set_web_signature')?.description;
    expect(setting).toContain('nfnn_photo_upload_link');
    expect(setting).toContain('never from a public address');
    expect(setting).toContain('CHANGE_WEB_SIGNATURE');
  });

  it('when the order of the projects is asked, then the chosen order comes with a description of every way of ordering', async () => {
    const result = await client.callTool({ name: 'nfnn_project_order', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"order":"YEAR_THEN_CATEGORY"');
    const { tools } = await client.listTools();
    const description = tools.find((tool) => tool.name === 'nfnn_project_order')?.description;
    expect(description).toContain('YEAR_THEN_CATEGORY');
    expect(description).toContain('YEAR');
    expect(description).toContain('CATEGORY_THEN_YEAR');
  });

  it('when the status is asked, then the version, the import state and the last backup come as compact JSON with Prague offsets', async () => {
    const result = await client.callTool({ name: 'nfnn_status', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain('"revision":"abc1234"');
    expect(text).toContain('"health":"UP"');
    expect(text).toContain('"lastSucceededAt":"2026-10-23T07:00:00+02:00"');
    expect(text).toContain('"outcome":"OK"');
  });

  it('when the status is asked, then it names the receipt signing key with its registration time and flags a key that fails its seal', async () => {
    const result = await client.callTool({ name: 'nfnn_status', arguments: {} });
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/donations/receipt-signing-keys',
    );
    expect(textOf(result)).toContain(
      '"receiptSigningKeys":{"currentKeyId":"21fe31df","currentKeyRegisteredAt":"2026-11-13T12:00:00+01:00","currentKeyPublished":true,"unpublishedKeyIds":["39f713d0"],"attention":true}',
    );
  });

  it('when the status is asked of a backend without the receipt signing keys, then the rest still comes and the key part says it is unavailable', async () => {
    stack.backend.receiptSigningKeysAvailable = false;
    try {
      const result = await client.callTool({ name: 'nfnn_status', arguments: {} });
      expect(result.isError).toBeFalsy();
      const text = textOf(result);
      expect(text).toContain('"revision":"abc1234"');
      expect(text).toContain('"outcome":"OK"');
      expect(text).toContain(
        '"receiptSigningKeys":{"unavailable":"404 not-found: Nenalezeno","attention":true}',
      );
    } finally {
      stack.backend.receiptSigningKeysAvailable = true;
    }
  });

  it('when the tools are listed, then the overview says it counts the donors who gave in each month', async () => {
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === 'nfnn_overview')?.description).toContain(
      'givingDonors',
    );
  });

  it('when what came in since the last sign-in is asked, then the previous sign-in sets the moment and the amounts come in crowns with Prague offsets', async () => {
    const result = await client.callTool({ name: 'nfnn_since_last_sign_in', arguments: {} });
    expect(result.isError).toBeFalsy();
    const paths = stack.backend.requests.map((request) => request.path);
    expect(paths).toContain('/api/admin/donors/me/previous-sign-in');
    expect(paths).toContain('/api/admin/donations/overview/since?from=2026-10-28T20%3A14%3A00Z');
    const text = textOf(result);
    expect(text).toContain('"previousSignInAt":"2026-10-28T21:14:00+01:00"');
    expect(text).toContain('"total":12500');
    expect(text).toContain('"unpaired":{"count":2,"total":5000');
    expect(text).toContain('"newDonors":3');
  });

  it('when a moment is given, then it is asked for instead of the previous sign-in', async () => {
    await client.callTool({
      name: 'nfnn_since_last_sign_in',
      arguments: { from: '2026-10-01T00:00:00+02:00' },
    });
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/donations/overview/since?from=2026-10-01T00%3A00%3A00%2B02%3A00',
    );
  });

  it('when the administrator never signed in before and no moment is given, then the tool says so and asks nothing more', async () => {
    stack.backend.previousSignInAt = null;

    const result = await client.callTool({ name: 'nfnn_since_last_sign_in', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('no earlier sign-in');
    expect(stack.backend.requests.some((request) => request.path.includes('/overview/since'))).toBe(
      false,
    );
  });

  it('when the payments are asked, then the administration gets the exchanged API token, a first page of 50, and amounts come as crowns with the next page named', async () => {
    const result = await client.callTool({
      name: 'nfnn_payments',
      arguments: { pairing: 'unpaired' },
    });
    const call = stack.backend.requests.find((request) =>
      request.path.startsWith('/api/admin/donations/payments'),
    );
    expect(call?.path).toBe('/api/admin/donations/payments?pairing=unpaired&offset=0&limit=50');
    expect(call?.authorization).toBe('Bearer api-token-read');
    expect(textOf(result)).toContain('"amount":500');
    expect(textOf(result)).toContain('"total":3');
    expect(textOf(result)).not.toContain('amountMinor');
    expect(textOf(result)).toContain(
      'Showing 1–1 of 3: call nfnn_payments again with offset 1 for more.',
    );
  });

  it('when a year, a text, a period, a donor and a page are given, then the payments pass them on and the donor is logged', async () => {
    await client.callTool({ name: 'nfnn_overview', arguments: { year: 2025 } });
    await client.callTool({
      name: 'nfnn_payments',
      arguments: {
        pairing: 'paired',
        year: 2025,
        query: 'novák',
        from: '2025-01-01',
        to: '2025-06-30',
        donorId: DONOR_ID,
        offset: 50,
        limit: 10,
      },
    });
    const paths = stack.backend.requests.map((request) => request.path);
    expect(paths).toContain('/api/admin/donations/overview?year=2025');
    expect(paths).toContain(
      `/api/admin/donations/payments?pairing=paired&year=2025&query=nov%C3%A1k&from=2025-01-01&to=2025-06-30&donorId=${DONOR_ID}&offset=50&limit=10`,
    );
    expect(stack.logLines).toContain(
      `INFO Tool nfnn_payments answered donor donor-jana about donor ${DONOR_ID}`,
    );
  });

  it('when a donor is looked up and opened, then both halves of the card come, a missing record explained', async () => {
    const found = await client.callTool({ name: 'nfnn_find_donors', arguments: { query: 'nov' } });
    expect(textOf(found)).toContain('Jana Nováková');
    expect(textOf(found)).toContain('More donors: call nfnn_find_donors again with page 1.');
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/donors?page=0&limit=20&query=nov',
    );
    const card = await client.callTool({ name: 'nfnn_donor', arguments: { donorId: DONOR_ID } });
    expect(card.isError).toBeFalsy();
    expect(textOf(card)).toContain('"registeredAt":"2026-10-17T12:00:00+02:00"');
    expect(textOf(card)).toContain('no donation record yet');
    expect(stack.logLines).toContain(
      `INFO Tool nfnn_donor answered donor donor-jana about donor ${DONOR_ID}`,
    );
  });

  it('when every donor is listed a page later, then no query is sent and the last page names no next one', async () => {
    const page = await client.callTool({
      name: 'nfnn_find_donors',
      arguments: { page: 2, limit: 5 },
    });
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/donors?page=2&limit=5',
    );
    expect(textOf(page)).not.toContain('More donors');
  });

  it('when the card of a donor with many gifts is opened, then the donor data come once and only the newest donations with the count of all', async () => {
    const card = JSON.parse(
      textOf(
        await client.callTool({ name: 'nfnn_donor', arguments: { donorId: GIVING_DONOR_ID } }),
      ),
    ) as {
      account: Record<string, unknown>;
      donations: { donor: Record<string, unknown>; donations: Record<string, unknown> };
    };
    expect(card.account['name']).toBe('Petr Svoboda');
    expect(card.donations.donor).toEqual({ variableSymbol: '1234567890', erasedAt: null });
    expect(card.donations.donations['count']).toBe(25);
    expect(card.donations.donations['totalAmount']).toBe(2500);
    expect(card.donations.donations['shown']).toBe(20);
    expect((card.donations.donations['items'] as { id: string }[]).map((item) => item.id)[0]).toBe(
      'donation-25',
    );
    expect(card.donations.donations['items']).toHaveLength(20);
  });

  it('when the issued receipts are listed, then the donor, the year of issue and the page pass on, amounts come in crowns and the next page is named', async () => {
    const first = await client.callTool({ name: 'nfnn_receipts', arguments: {} });
    const filtered = await client.callTool({
      name: 'nfnn_receipts',
      arguments: { donorId: DONOR_ID, issuedIn: 2027, page: 1, limit: 1 },
    });
    const paths = stack.backend.requests
      .map((request) => request.path)
      .filter((path) => path.startsWith('/api/admin/donations/receipts'));
    expect(paths).toEqual([
      '/api/admin/donations/receipts?page=0&limit=50',
      `/api/admin/donations/receipts?donorId=${DONOR_ID}&issuedIn=2027&page=1&limit=1`,
    ]);
    expect(textOf(first)).toContain('"totalAmount":3500');
    expect(textOf(first)).not.toContain('totalAmountMinor');
    expect(textOf(first)).toContain('"issuedAt":"2027-01-15T12:00:00+01:00"');
    expect(textOf(first)).not.toContain('More receipts');
    expect(textOf(filtered)).toContain(
      'More receipts (3 in all): call nfnn_receipts again with page 2.',
    );
    expect(stack.logLines).toContain(
      `INFO Tool nfnn_receipts answered donor donor-jana about donor ${DONOR_ID}`,
    );
  });

  it('when one issued receipt is read, then its frozen data come with the verification link and without the texts of the PDF', async () => {
    const result = await client.callTool({
      name: 'nfnn_receipt',
      arguments: { receiptId: RECEIPT_ID },
    });
    expect(result.isError).toBeFalsy();
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      `/api/admin/donations/receipts/${RECEIPT_ID}`,
    );
    const receipt = JSON.parse(textOf(result)) as {
      number: string;
      verificationLink: string;
      receipt: Record<string, unknown>;
    };
    expect(receipt.number).toBe('2027-000001');
    expect(receipt.verificationLink).toBe(VERIFICATION_LINK);
    expect(receipt.receipt['total']).toEqual({ amount: 3500, currency: 'CZK' });
    expect(receipt.receipt['donor']).toMatchObject({ name: 'Jana Nováková' });
    expect(receipt.receipt).not.toHaveProperty('texts');
    expect(textOf(result)).not.toContain('pdf');
    expect(stack.logLines).toContain(
      `INFO Tool nfnn_receipt answered donor donor-jana about receipt ${RECEIPT_ID}`,
    );
  });

  it('when the receipt of an erased donor is read, then it comes without the name, the address and a verification link, as the administration sends it to a connection', async () => {
    const result = await client.callTool({
      name: 'nfnn_receipt',
      arguments: { receiptId: ERASED_RECEIPT_ID },
    });
    expect(result.isError).toBeFalsy();
    const receipt = JSON.parse(textOf(result)) as {
      donorErased: boolean;
      verificationLink: string | null;
      receipt: Record<string, unknown>;
    };
    expect(receipt.donorErased).toBe(true);
    expect(receipt.verificationLink).toBeNull();
    expect(receipt.receipt['donor']).toMatchObject({
      name: 'Vymazaný dárce',
      address: { street: 'Vymazáno', city: 'Vymazáno', postalCode: '00000' },
    });
    expect(textOf(result)).not.toContain('Jana Nováková');
    expect(textOf(result)).not.toContain('Dlouhá 12');
  });

  it('when an unknown receipt is read, then the refusal of the administration comes back', async () => {
    const result = await client.callTool({
      name: 'nfnn_receipt',
      arguments: { receiptId: UNKNOWN_ID },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('404 donations/receipt-not-found');
  });

  it('when a receipt is issued with the reading permission only, then nothing reaches the administration and the answer says how to allow changes', async () => {
    const result = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: DONOR_ID, year: 2026 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('This connection may only read');
    expect(
      stack.backend.requests.filter((request) => request.path.endsWith('/receipts')),
    ).toHaveLength(0);
  });

  it('when the history, the report and the content are asked, then they come from the administration', async () => {
    const actions = await client.callTool({
      name: 'nfnn_admin_actions',
      arguments: { limit: 10, before: '2026-10-23T07:00:00Z' },
    });
    expect(textOf(actions)).toContain('PAIR_PAYMENT');
    expect(textOf(actions)).toContain(
      'Older actions: call nfnn_admin_actions again with before "2026-10-23T06:00:00.654321Z".',
    );
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/donors/actions?limit=10&before=2026-10-23T07%3A00%3A00Z',
    );
    expect(textOf(await client.callTool({ name: 'nfnn_report', arguments: {} }))).toContain(
      'info@nfnn.cz',
    );
    const content = textOf(await client.callTool({ name: 'nfnn_content', arguments: {} }));
    expect(content).toContain('"title":"Koncept"');
    expect(content).toContain('"bodyLength":22');
    expect(content).toContain('"publishedOn":"2026-11-01","live":false');
    expect(content).not.toContain('Dlouhý text');
    expect(
      textOf(await client.callTool({ name: 'nfnn_news_article', arguments: { id: UNKNOWN_ID } })),
    ).toContain('"body":"Dlouhý text aktuality."');
    expect(
      textOf(await client.callTool({ name: 'nfnn_project', arguments: { id: UNKNOWN_ID } })),
    ).toContain('"body":"Text projektu."');
    expect(textOf(await client.callTool({ name: 'nfnn_backups', arguments: {} }))).toContain(
      'nfnn-2026-10-23_0300.dump',
    );
  });

  it('when the About section is asked, then its photo comes with its size, description and caption', async () => {
    const result = await client.callTool({ name: 'nfnn_about', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain(`"id":"${MEDIA_ID}"`);
    expect(text).toContain('"width":1200,"height":1600');
    expect(text).toContain('"caption":"Kde to všechno začalo"');
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/content/about',
    );
  });

  it('when the About photo is changed with the reading permission only, then nothing reaches the administration and the answer says how to allow changes', async () => {
    const result = await client.callTool({
      name: 'nfnn_update_about',
      arguments: { photoId: null },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('may only read, so nothing was changed');
    expect(
      stack.backend.requests.some((request) => request.path === '/api/admin/content/about'),
    ).toBe(false);
  });

  it('when the people of the foundation are asked, then they come in order with their portraits, web signatures and the founders note', async () => {
    const result = await client.callTool({ name: 'nfnn_people', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain('"name":"Eva Vzorová"');
    expect(text).toContain('"boardNote":"předsedkyně"');
    expect(text).toContain('"fundEmail":"eva@nfnn.cz"');
    expect(text).toContain('"note":"Děkujeme všem, kdo pomáhají s námi."');
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/content/people',
    );
  });

  it('when a person is added with the reading permission only, then nothing reaches the administration and the answer says how to allow changes', async () => {
    const result = await client.callTool({
      name: 'nfnn_add_person',
      arguments: { name: 'Adam Vzor', onBoard: true, featured: false },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('may only read, so nothing was changed');
    expect(
      stack.backend.requests.some((request) =>
        request.path.startsWith('/api/admin/content/people'),
      ),
    ).toBe(false);
  });

  it('when a web signature is set or removed with the reading permission only, then nothing reaches the administration and the answer says how to allow changes', async () => {
    const set = await client.callTool({
      name: 'nfnn_set_web_signature',
      arguments: { id: PERSON_ID, imageId: MEDIA_ID },
    });
    const removed = await client.callTool({
      name: 'nfnn_remove_web_signature',
      arguments: { id: SIGNED_PERSON_ID },
    });
    for (const result of [set, removed]) {
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('may only read, so nothing was changed');
    }
    expect(stack.backend.requests.some((request) => request.path.endsWith('/web-signature'))).toBe(
      false,
    );
  });

  it('when the settings are asked, then they come from the administration with secrets only as set or not', async () => {
    const result = await client.callTool({ name: 'nfnn_settings', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"value":"https://nfnn.cz"');
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/operations/settings',
    );
  });

  it('when the receipt signature is asked, then it says whether one is uploaded, its size and when, without the image itself', async () => {
    const result = await client.callTool({ name: 'nfnn_receipt_signature', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain('"configured":true');
    expect(text).toContain('"width":1200');
    expect(text).toContain('"uploadedAt":"2026-10-23T21:30:00+02:00"');
    expect(text).not.toContain('base64');
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/donations/receipt-signature',
    );
  });

  it('when the administrators and the older-symbol answers are asked, then they come from the administration', async () => {
    const administrators = textOf(
      await client.callTool({ name: 'nfnn_administrators', arguments: {} }),
    );
    expect(administrators).toContain('"secondFactorEnabled":true');
    const claims = textOf(await client.callTool({ name: 'nfnn_symbol_claims', arguments: {} }));
    expect(claims).toContain('"answer":"CONFIRMED"');
    expect(claims).toContain('"answeredAt":"2026-10-22T12:00:00+02:00"');
    const paths = stack.backend.requests.map((request) => request.path);
    expect(paths).toContain('/api/admin/donors/administrators');
    expect(paths).toContain('/api/admin/donations/symbol-claims');
  });

  it('when the logs are read, then the files, a window with its position and a search come from the administration', async () => {
    expect(textOf(await client.callTool({ name: 'nfnn_log_files', arguments: {} }))).toContain(
      'backend.log.2026-10-22.0.gz',
    );

    const window = textOf(
      await client.callTool({ name: 'nfnn_log', arguments: { from: 83, bytes: 500 } }),
    );
    expect(window).toContain('backend.log: bytes 83–119 of 119 (older: true, newer: false)');
    expect(window).toContain('third line');
    expect(
      stack.backend.requests.find((request) =>
        request.path.startsWith('/api/admin/operations/logs/backend.log?'),
      )?.path,
    ).toBe('/api/admin/operations/logs/backend.log?from=83&bytes=500');

    const search = await client.callTool({
      name: 'nfnn_log_search',
      arguments: { pattern: 'fio', limit: 5 },
    });
    expect(textOf(search)).toContain('{"file":"backend.log","offset":36');
    expect(textOf(search)).toContain('"continueWith":null');
    expect(
      stack.backend.requests.find((request) =>
        request.path.startsWith('/api/admin/operations/logs/backend.log/search'),
      )?.path,
    ).toBe('/api/admin/operations/logs/backend.log/search?pattern=fio&limit=5');
  });

  it('when a log name is not one of the files, then the tool lists the files and asks the administration for no window', async () => {
    for (const file of ['missing.log', '../etc/passwd']) {
      const missing = await client.callTool({ name: 'nfnn_log', arguments: { file } });
      expect(missing.isError).toBe(true);
      expect(textOf(missing)).toBe(
        `There is no log file "${file}". The files are: backend.log, backend.log.2026-10-22.0.gz, backend.log.2026-10-21.0.gz, nginx-access.log.`,
      );
    }
    expect(
      stack.backend.requests.filter((request) =>
        request.path.startsWith('/api/admin/operations/logs/'),
      ),
    ).toHaveLength(0);
  });

  it('when a search goes on into the rotated copies, then it reads them newest first and names where to continue', async () => {
    const first = await client.callTool({
      name: 'nfnn_log_search',
      arguments: { pattern: 'fio', limit: 3, rotated: true },
    });
    const page = JSON.parse(textOf(first).split('\n')[0] ?? '{}') as {
      matches: { file: string; offset: number }[];
      continueWith: unknown;
    };
    expect(page.matches.map((match) => `${match.file}@${match.offset}`)).toEqual([
      'backend.log@36',
      'backend.log.2026-10-22.0.gz@70',
      'backend.log.2026-10-22.0.gz@50',
    ]);
    expect(page.continueWith).toEqual({ file: 'backend.log.2026-10-22.0.gz', before: 50 });
    expect(textOf(first)).toContain(
      'Older matches: call nfnn_log_search again with file "backend.log.2026-10-22.0.gz" and before 50, rotated true and series "backend.log".',
    );

    const second = JSON.parse(
      textOf(
        await client.callTool({
          name: 'nfnn_log_search',
          arguments: {
            pattern: 'fio',
            limit: 3,
            rotated: true,
            series: 'backend.log',
            file: 'backend.log.2026-10-22.0.gz',
            before: 50,
          },
        }),
      ),
    ) as { searched: string[]; matches: { file: string; offset: number }[]; continueWith: unknown };
    expect(second.searched).toEqual(['backend.log.2026-10-22.0.gz', 'backend.log.2026-10-21.0.gz']);
    expect(second.matches.map((match) => `${match.file}@${match.offset}`)).toEqual([
      'backend.log.2026-10-22.0.gz@10',
      'backend.log.2026-10-21.0.gz@5',
    ]);
    expect(second.continueWith).toBeNull();
  });

  it('when the log levels, the diagnostics and the thread dump are asked, then they come as text', async () => {
    const levels = textOf(await client.callTool({ name: 'nfnn_log_levels', arguments: {} }));
    expect(levels).toContain('"logger":"cz.novanadeje.app"');
    expect(levels).toContain('"until":"2026-10-23T08:30:00+02:00"');
    expect(textOf(await client.callTool({ name: 'nfnn_diagnostics', arguments: {} }))).toContain(
      '"reachable":true',
    );
    expect(textOf(await client.callTool({ name: 'nfnn_thread_dump', arguments: {} }))).toContain(
      'state=RUNNABLE',
    );
  });

  it('when a writing tool is called, then it explains how to allow changes and the administration is not called', async () => {
    const result = await client.callTool({
      name: 'nfnn_pair_payment',
      arguments: { paymentId: PAYMENT_ID, donorId: DONOR_ID },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('This connection may only read');
    expect(textOf(result)).toContain('„Změny“');
    expect(
      stack.backend.requests.filter(
        (request) => request.method === 'POST' && request.path.includes('/pair'),
      ),
    ).toHaveLength(0);
    expect(stack.logLines).toContain(
      'INFO Tool nfnn_pair_payment refused for donor donor-jana: the connection may only read',
    );
  });

  it('when a test e-mail is asked for, then it is refused like every change and nothing is sent', async () => {
    const result = await client.callTool({ name: 'nfnn_send_test_email', arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('This connection may only read');
    expect(
      stack.backend.requests.filter((request) => request.path.endsWith('/test-email')),
    ).toHaveLength(0);
  });

  it('when a photo upload is asked, then it is refused like every change and nothing is fetched', async () => {
    const fromUrl = await client.callTool({
      name: 'nfnn_upload_photo',
      arguments: { url: PHOTO_URL },
    });
    const link = await client.callTool({ name: 'nfnn_photo_upload_link', arguments: {} });
    expect(fromUrl.isError).toBe(true);
    expect(link.isError).toBe(true);
    expect(textOf(link)).toContain('This connection may only read');
    expect(stack.photos.fetched).toHaveLength(0);
  });
});

describe('Given an administrator connected with the writing permission', () => {
  let stack: TestApp;
  let client: Client;

  beforeEach(async () => {
    stack = await startApp();
    client = await connect(stack.app, WRITE_TOKEN);
  });

  afterEach(async () => {
    await client.close();
    await stack.stop();
  });

  it('when a payment is paired, then the administration receives the donor and the result comes back', async () => {
    const result = await client.callTool({
      name: 'nfnn_pair_payment',
      arguments: { paymentId: PAYMENT_ID, donorId: DONOR_ID },
    });
    expect(result.isError).toBeFalsy();
    const call = stack.backend.requests.find((request) => request.path.endsWith('/pair'));
    expect(call?.method).toBe('POST');
    expect(call?.authorization).toBe('Bearer api-token-write');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ donorId: DONOR_ID });
    expect(textOf(result)).toContain(`"donationId":"${DONATION_ID}"`);
    expect(stack.logLines).toContain(
      `INFO Tool nfnn_pair_payment answered donor donor-jana about payment ${PAYMENT_ID}, donor ${DONOR_ID}`,
    );
  });

  it('when the administration refuses, then the tool answers an error with the Czech title and detail', async () => {
    const unknown = await client.callTool({
      name: 'nfnn_pair_payment',
      arguments: { paymentId: UNKNOWN_ID, donorId: DONOR_ID },
    });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toBe(
      'The administration refused the request (404 donations/bank-payment-not-found): Platba nenalezena – Platba s tímto id neexistuje.',
    );
    const receipt = await client.callTool({
      name: 'nfnn_unpair_payment',
      arguments: { paymentId: PAYMENT_ID },
    });
    expect(receipt.isError).toBe(true);
    expect(textOf(receipt)).toContain('409 donations/donation-has-receipt');
  });

  it('when the report, a backup and a news article are requested, then each reaches its endpoint', async () => {
    expect(
      textOf(await client.callTool({ name: 'nfnn_send_report', arguments: { month: '2026-09' } })),
    ).toContain('"month":"2026-09"');
    expect(
      textOf(
        await client.callTool({ name: 'nfnn_request_backup', arguments: { kind: 'TEST_RESTORE' } }),
      ),
    ).toContain('TEST_RESTORE');
    expect(
      textOf(
        await client.callTool({
          name: 'nfnn_publish_news',
          arguments: { id: UNKNOWN_ID, publishedOn: '2026-10-23' },
        }),
      ),
    ).toContain('"publishedOn":"2026-10-23"');
    const bodies = stack.backend.requests
      .filter((request) => request.method === 'POST' && request.path.startsWith('/api/admin'))
      .map((request) => request.body);
    expect(bodies).toContain('{"month":"2026-09"}');
    expect(bodies).toContain('{"kind":"TEST_RESTORE"}');
  });

  it('when the report settings change, then the whole settings reach the administration', async () => {
    const settings = {
      recipients: ['info@nfnn.cz', 'pavel@example.cz'],
      sendDay: 5,
      sendHour: 9,
      sections: { donors: true, donations: true, unpairedPayments: false, bankImport: true },
    };
    const result = await client.callTool({
      name: 'nfnn_update_report_settings',
      arguments: settings,
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"sendDay":5');
    expect(textOf(result)).toContain('"sendHour":9');
    const put = stack.backend.requests.find((request) => request.method === 'PUT');
    expect(put?.path).toBe('/api/admin/donations/report/settings');
    expect(JSON.parse(put?.body ?? '{}')).toEqual(settings);
    expect(put?.authorization).toBe('Bearer api-token-write');
  });

  it('when the order of the projects is set, then the chosen order reaches the administration under the writing token', async () => {
    const result = await client.callTool({
      name: 'nfnn_set_project_order',
      arguments: { order: 'CATEGORY_THEN_YEAR' },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"order":"CATEGORY_THEN_YEAR"');
    const put = stack.backend.requests.find(
      (request) => request.method === 'PUT' && request.path === '/api/admin/content/project-order',
    );
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ order: 'CATEGORY_THEN_YEAR' });
    expect(put?.authorization).toBe('Bearer api-token-write');
  });

  it('when the order of the projects is not one of the three, then the tool refuses it before the administration', async () => {
    const result = await client.callTool({
      name: 'nfnn_set_project_order',
      arguments: { order: 'TITLE' },
    });
    expect(result.isError).toBe(true);
    expect(
      stack.backend.requests.some((request) => request.path === '/api/admin/content/project-order'),
    ).toBe(false);
  });

  it('when the backup plan changes, then the plan reaches the administration and the answer names the plan still applied', async () => {
    const plan = { backupTime: '02:30', testRestoreDay: 6, testRestoreTime: '05:15' };
    const result = await client.callTool({ name: 'nfnn_update_backup_schedule', arguments: plan });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"applied":{"backupTime":"03:00"');
    const put = stack.backend.requests.find(
      (request) =>
        request.method === 'PUT' && request.path === '/api/admin/operations/backups/schedule',
    );
    expect(JSON.parse(put?.body ?? '{}')).toEqual(plan);
    expect(put?.authorization).toBe('Bearer api-token-write');
  });

  it('when the backup plan names a time that does not exist, then the tool refuses it before the administration', async () => {
    const result = await client.callTool({
      name: 'nfnn_update_backup_schedule',
      arguments: { backupTime: '24:00', testRestoreDay: 7, testRestoreTime: '04:00' },
    });
    expect(result.isError).toBe(true);
    expect(
      stack.backend.requests.some(
        (request) => request.path === '/api/admin/operations/backups/schedule',
      ),
    ).toBe(false);
  });

  it('when a news article and a project are written and edited, then drafts are created and replaced', async () => {
    const article = {
      title: 'Letní tábor',
      perex: 'Krátce o táboře.',
      body: 'První odstavec.\n\nDruhý odstavec.',
      tag: 'Tábor',
    };
    const created = await client.callTool({ name: 'nfnn_create_news', arguments: article });
    expect(textOf(created)).toContain('"slug":"letni-tabor"');
    const edited = await client.callTool({
      name: 'nfnn_update_news',
      arguments: { id: UNKNOWN_ID, ...article, slug: 'tabor-2026' },
    });
    expect(edited.isError).toBeFalsy();
    const project = {
      title: 'Nová střecha',
      year: 2026,
      perex: 'Střecha.',
      body: '## Co se stalo\n\n**Nová** střecha.',
      category: 'CHILDREN',
      coverImageId: MEDIA_ID,
      coverImageAlt: 'Nová střecha nad dílnou',
    };
    await client.callTool({ name: 'nfnn_create_project', arguments: project });
    await client.callTool({
      name: 'nfnn_update_project',
      arguments: { id: UNKNOWN_ID, ...project },
    });

    const writes = stack.backend.requests
      .filter((request) => request.path.startsWith('/api/admin/content'))
      .map((request) => [request.method, request.path, JSON.parse(request.body)]);
    expect(writes).toEqual([
      ['POST', '/api/admin/content/news', article],
      ['PUT', `/api/admin/content/news/${UNKNOWN_ID}`, { ...article, slug: 'tabor-2026' }],
      ['POST', '/api/admin/content/projects', project],
      ['PUT', `/api/admin/content/projects/${UNKNOWN_ID}`, project],
    ]);
  });

  it('when a project comes without a category or with an unknown one, then the tool refuses it and the administration gets nothing', async () => {
    const project = { title: 'Nová střecha', year: 2026, perex: 'Střecha.', body: 'Text.' };
    const missing = await client.callTool({ name: 'nfnn_create_project', arguments: project });
    const unknown = await client.callTool({
      name: 'nfnn_update_project',
      arguments: { id: UNKNOWN_ID, ...project, category: 'PLANTS' },
    });

    expect(missing.isError).toBe(true);
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('category');
    expect(
      stack.backend.requests.filter((request) => request.path.startsWith('/api/admin/content')),
    ).toEqual([]);
  });

  it('when the About photo is set and then removed, then the administration gets the photo with its texts and then no photo and no texts', async () => {
    const set = await client.callTool({
      name: 'nfnn_update_about',
      arguments: {
        photoId: MEDIA_ID,
        photoAlt: 'Malý chlapec v náručí dvou dospělých',
        caption: 'Kde to všechno začalo',
      },
    });
    expect(set.isError).toBeFalsy();
    expect(textOf(set)).toContain('"caption":"Kde to všechno začalo"');
    const removed = await client.callTool({
      name: 'nfnn_update_about',
      arguments: { photoId: null, caption: 'Zůstane?' },
    });
    expect(removed.isError).toBeFalsy();
    expect(textOf(removed)).toContain('"photo":null');

    const writes = stack.backend.requests
      .filter((request) => request.path === '/api/admin/content/about')
      .map((request) => [request.method, JSON.parse(request.body), request.authorization]);
    expect(writes).toEqual([
      [
        'PUT',
        {
          photoId: MEDIA_ID,
          photoAlt: 'Malý chlapec v náručí dvou dospělých',
          caption: 'Kde to všechno začalo',
        },
        'Bearer api-token-write',
      ],
      ['PUT', { photoId: null, photoAlt: null, caption: null }, 'Bearer api-token-write'],
    ]);
  });

  it('when the About photo is set without texts, then they go as empty', async () => {
    await client.callTool({ name: 'nfnn_update_about', arguments: { photoId: MEDIA_ID } });

    const put = stack.backend.requests.find(
      (request) => request.path === '/api/admin/content/about',
    );
    expect(JSON.parse(put?.body ?? '{}')).toEqual({
      photoId: MEDIA_ID,
      photoAlt: null,
      caption: null,
    });
  });

  it('when a person is added and updated, then the administration gets every field with the missing ones as empty', async () => {
    const added = await client.callTool({
      name: 'nfnn_add_person',
      arguments: { name: 'Adam Vzor', onBoard: true, featured: false },
    });
    expect(added.isError).toBeFalsy();
    expect(textOf(added)).toContain(`"id":"${PERSON_ID}"`);
    const updated = await client.callTool({
      name: 'nfnn_update_person',
      arguments: {
        id: PERSON_ID,
        name: 'Adam Vzor',
        role: 'Zakladatel a člen rady',
        onBoard: true,
        boardNote: 'místopředseda',
        featured: true,
        portraitId: MEDIA_ID,
        personalEmail: 'adam.vzor@example.org',
        fundEmail: 'adam@nfnn.cz',
      },
    });
    expect(updated.isError).toBeFalsy();
    expect(textOf(updated)).toContain('"fundEmail":"adam@nfnn.cz"');

    const writes = stack.backend.requests
      .filter((request) => request.path.startsWith('/api/admin/content/people'))
      .map((request) => [
        request.method,
        request.path,
        JSON.parse(request.body),
        request.authorization,
      ]);
    expect(writes).toEqual([
      [
        'POST',
        '/api/admin/content/people',
        {
          name: 'Adam Vzor',
          role: null,
          onBoard: true,
          boardNote: null,
          featured: false,
          portraitId: null,
          personalEmail: null,
          fundEmail: null,
        },
        'Bearer api-token-write',
      ],
      [
        'PUT',
        `/api/admin/content/people/${PERSON_ID}`,
        {
          name: 'Adam Vzor',
          role: 'Zakladatel a člen rady',
          onBoard: true,
          boardNote: 'místopředseda',
          featured: true,
          portraitId: MEDIA_ID,
          personalEmail: 'adam.vzor@example.org',
          fundEmail: 'adam@nfnn.cz',
        },
        'Bearer api-token-write',
      ],
    ]);
  });

  it('when people are removed, then a person goes whether or not they have a web signature', async () => {
    for (const id of [PERSON_ID, SIGNED_PERSON_ID]) {
      const removed = await client.callTool({ name: 'nfnn_remove_person', arguments: { id } });
      expect(removed.isError).toBeFalsy();
      expect(textOf(removed)).toContain('removed from the people of the foundation');
    }
    expect(
      stack.backend.requests
        .filter((request) => request.path.startsWith('/api/admin/content/people'))
        .map((request) => `${request.method} ${request.path}`),
    ).toEqual([
      `DELETE /api/admin/content/people/${PERSON_ID}`,
      `DELETE /api/admin/content/people/${SIGNED_PERSON_ID}`,
    ]);
  });

  it('when a web signature is set and removed, then the administration gets the image for the person and the removal, and each answer carries the person', async () => {
    const set = await client.callTool({
      name: 'nfnn_set_web_signature',
      arguments: { id: PERSON_ID, imageId: MEDIA_ID },
    });
    expect(set.isError).toBeFalsy();
    expect(textOf(set)).toContain(`"webSignature":{"id":"${MEDIA_ID}"`);
    const removed = await client.callTool({
      name: 'nfnn_remove_web_signature',
      arguments: { id: SIGNED_PERSON_ID },
    });
    expect(removed.isError).toBeFalsy();
    expect(textOf(removed)).toContain('"webSignature":null');

    expect(
      stack.backend.requests
        .filter((request) => request.path.endsWith('/web-signature'))
        .map((request) => [
          request.method,
          request.path,
          request.body === '' ? undefined : JSON.parse(request.body),
          request.authorization,
        ]),
    ).toEqual([
      [
        'POST',
        `/api/admin/content/people/${PERSON_ID}/web-signature`,
        { imageId: MEDIA_ID },
        'Bearer api-token-write',
      ],
      [
        'DELETE',
        `/api/admin/content/people/${SIGNED_PERSON_ID}/web-signature`,
        undefined,
        'Bearer api-token-write',
      ],
    ]);
  });

  it('when a web signature names an image that is no id, then the tool refuses it before the administration', async () => {
    const result = await client.callTool({
      name: 'nfnn_set_web_signature',
      arguments: { id: PERSON_ID, imageId: 'https://example.org/podpis.png' },
    });
    expect(result.isError).toBe(true);
    expect(stack.backend.requests.some((request) => request.path.endsWith('/web-signature'))).toBe(
      false,
    );
  });

  it('when the people are ordered and the founders note is written and emptied, then the administration gets the order and the text, an empty one as none', async () => {
    const ordered = await client.callTool({
      name: 'nfnn_order_people',
      arguments: { memberIds: [PERSON_ID, SIGNED_PERSON_ID] },
    });
    expect(ordered.isError).toBeFalsy();
    await client.callTool({ name: 'nfnn_update_founders_note', arguments: { text: 'Děkujeme.' } });
    const emptied = await client.callTool({
      name: 'nfnn_update_founders_note',
      arguments: { text: '  ' },
    });
    expect(textOf(emptied)).toContain('"text":null');

    const writes = stack.backend.requests
      .filter((request) => request.path.startsWith('/api/admin/content/people'))
      .map((request) => [request.method, request.path, JSON.parse(request.body)]);
    expect(writes).toEqual([
      ['PUT', '/api/admin/content/people/order', { memberIds: [PERSON_ID, SIGNED_PERSON_ID] }],
      ['PUT', '/api/admin/content/people/note', { text: 'Děkujeme.' }],
      ['PUT', '/api/admin/content/people/note', { text: null }],
    ]);
  });

  it('when the pairing from a donor account is turned off and on, then the administration gets both and a refusal comes back', async () => {
    const off = await client.callTool({
      name: 'nfnn_disconnect_bank_account',
      arguments: { donorId: DONOR_ID, linkId: LINK_ID },
    });
    expect(off.isError).toBeFalsy();
    expect(textOf(off)).toContain('turned off');
    const again = await client.callTool({
      name: 'nfnn_disconnect_bank_account',
      arguments: { donorId: DONOR_ID, linkId: PAYMENT_ID },
    });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain('409 donations/bank-account-already-disconnected');
    const on = await client.callTool({
      name: 'nfnn_reconnect_bank_account',
      arguments: { donorId: DONOR_ID, linkId: PAYMENT_ID },
    });
    expect(on.isError).toBeFalsy();
    expect(textOf(on)).toContain('on again');
    expect(
      stack.backend.requests
        .filter((request) => request.path.includes('/bank-accounts/'))
        .map((request) => `${request.method} ${request.path}`),
    ).toEqual([
      `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${LINK_ID}/disconnect`,
      `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${PAYMENT_ID}/disconnect`,
      `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${PAYMENT_ID}/reconnect`,
    ]);
  });

  it('when a yearly receipt and the receipt of one donation are issued, then each asks for its own subject and the issued receipt comes back with its verification link', async () => {
    const yearly = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: DONOR_ID, year: 2026 },
    });
    const single = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: DONOR_ID, donationId: DONATION_ID },
    });
    expect(yearly.isError).toBeFalsy();
    expect(single.isError).toBeFalsy();
    const calls = stack.backend.requests.filter((request) => request.path.endsWith('/receipts'));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST /api/admin/donations/donors/${DONOR_ID}/receipts`,
      `POST /api/admin/donations/donors/${DONOR_ID}/receipts`,
    ]);
    expect(calls.map((call) => JSON.parse(call.body) as unknown)).toEqual([
      { year: 2026 },
      { donationId: DONATION_ID },
    ]);
    expect(calls[0]?.authorization).toBe('Bearer api-token-write');
    const issued = JSON.parse(textOf(yearly)) as Record<string, unknown>;
    expect(issued['kind']).toBe('YEARLY');
    expect(issued['verificationLink']).toBe(VERIFICATION_LINK);
    expect(asObject(issued['receipt'])).not.toHaveProperty('texts');
    expect(asObject(JSON.parse(textOf(single)))['kind']).toBe('SINGLE');
    expect(stack.logLines).toContain(
      `INFO Tool nfnn_issue_receipt answered donor donor-jana about donor ${DONOR_ID}`,
    );
  });

  it('when a receipt is issued naming both a year and a donation or neither, then the tool refuses it before the administration', async () => {
    const both = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: DONOR_ID, year: 2026, donationId: DONATION_ID },
    });
    const neither = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: DONOR_ID },
    });
    expect(both.isError).toBe(true);
    expect(neither.isError).toBe(true);
    expect(textOf(both)).toContain('either `year`');
    expect(textOf(neither)).toContain('either `year`');
    expect(
      stack.backend.requests.filter((request) => request.path.endsWith('/receipts')),
    ).toHaveLength(0);
    expect(stack.logLines).toContain(
      `INFO Tool nfnn_issue_receipt refused for donor donor-jana about donor ${DONOR_ID}: receipt-subject`,
    );
  });

  it('when a donation id is written in capitals, then the administration gets it in the lowercase it accepts', async () => {
    const result = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: DONOR_ID.toUpperCase(), donationId: DONATION_ID.toUpperCase() },
    });
    expect(result.isError).toBeFalsy();
    const calls = stack.backend.requests.filter((request) => request.path.endsWith('/receipts'));
    expect(calls.map((call) => call.path)).toEqual([
      `/api/admin/donations/donors/${DONOR_ID}/receipts`,
    ]);
    expect(calls.map((call) => JSON.parse(call.body) as unknown)).toEqual([
      { donationId: DONATION_ID },
    ]);
  });

  it('when issuing would replace a receipt the donor already holds, then the refusal says it is done only on the web, not that a permission is missing', async () => {
    const result = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: REPLACING_DONOR_ID, year: 2026 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('403 donations/receipt-replacement-in-browser-only');
    expect(textOf(result)).toContain('only on the web at /sprava');
    expect(textOf(result)).not.toContain('connect the application again');
  });

  it('when the administration refuses to issue a receipt, then the unknown donor and the replacement cap come back as refusals', async () => {
    const unknown = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: UNKNOWN_ID, year: 2026 },
    });
    const capped = await client.callTool({
      name: 'nfnn_issue_receipt',
      arguments: { donorId: GIVING_DONOR_ID, year: 2026 },
    });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('404 donations/donor-not-found');
    expect(capped.isError).toBe(true);
    expect(textOf(capped)).toContain('409 donations/receipt-issue-limit');
  });

  it('when the tools are listed, then issuing a receipt is a change that can be repeated and the receipt tools never name a PDF to download', async () => {
    const { tools } = await client.listTools();
    const issue = tools.find((tool) => tool.name === 'nfnn_issue_receipt');
    expect(issue?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(tools.find((tool) => tool.name === 'nfnn_receipt')?.annotations?.readOnlyHint).toBe(
      true,
    );
    expect(tools.find((tool) => tool.name === 'nfnn_receipts')?.description).toContain(
      'no name or address',
    );
    expect(tools.find((tool) => tool.name === 'nfnn_receipts')?.description).toContain('WITHDRAWN');
    expect(issue?.description).toContain('only the first receipt');
    expect(issue?.description).toContain('403 donations/receipt-replacement-in-browser-only');
    const read = tools.find((tool) => tool.name === 'nfnn_receipt')?.description ?? '';
    expect(read).toContain('erased');
    expect(read).not.toContain('anyone can open');
  });

  it('when an argument is malformed, then the tool refuses it before calling the administration', async () => {
    const result = await client.callTool({
      name: 'nfnn_send_report',
      arguments: { month: 'září' },
    });
    expect(result.isError).toBe(true);
    expect(
      stack.backend.requests.filter((request) => request.path.includes('/report/send')),
    ).toHaveLength(0);
  });

  it('when plain settings are changed, then the administration gets them and a refused value comes back with its reason', async () => {
    const changed = await client.callTool({
      name: 'nfnn_change_settings',
      arguments: { changes: [{ name: 'RECEIPT_FIRST_YEAR', value: '2025' }] },
    });
    expect(textOf(changed)).toContain('"restarting":true');
    const put = stack.backend.requests.find((request) => request.method === 'PUT');
    expect(put?.path).toBe('/api/admin/operations/settings');
    expect(put?.body).toBe('{"changes":[{"name":"RECEIPT_FIRST_YEAR","value":"2025"}]}');

    const refused = await client.callTool({
      name: 'nfnn_change_settings',
      arguments: { changes: [{ name: 'RECEIPT_FIRST_YEAR', value: '26' }] },
    });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toContain('RECEIPT_FIRST_YEAR: Rok musí být mezi 2000 a 2100.');
  });

  it('when a test e-mail is asked for, then it goes through the running mail settings without a password to the administrator', async () => {
    const result = await client.callTool({ name: 'nfnn_send_test_email', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"outcome":"SENT"');
    expect(textOf(result)).toContain('"recipient":"jana@example.cz"');
    const post = stack.backend.requests.find(
      (request) =>
        request.method === 'POST' && request.path === '/api/admin/operations/settings/test-email',
    );
    expect(post?.authorization).toBe('Bearer api-token-write');
    expect(JSON.parse(post?.body ?? '{}')).toEqual({
      host: 'smtp-relay.brevo.com',
      port: 587,
      username: 'abc@smtp-brevo.com',
      auth: true,
      startTls: true,
      sender: 'info@nfnn.cz',
    });
  });

  it.each(['FIO_TOKEN', 'PUBLIC_URL'])(
    'when %s is passed, then the tool refuses it before calling the administration',
    async (name) => {
      const result = await client.callTool({
        name: 'nfnn_change_settings',
        arguments: { changes: [{ name, value: 'https://attacker.example' }] },
      });
      expect(result.isError).toBe(true);
      expect(
        stack.backend.requests.filter(
          (request) => request.path === '/api/admin/operations/settings',
        ),
      ).toHaveLength(0);
    },
  );

  it('when a log level is raised and reset, then the administration gets the PUT and DELETE and a missing override is explained', async () => {
    const raised = await client.callTool({
      name: 'nfnn_set_log_level',
      arguments: { logger: 'cz.novanadeje.app', level: 'DEBUG', minutes: 30 },
    });
    expect(textOf(raised)).toContain('"level":"DEBUG"');
    const put = stack.backend.requests.find((request) => request.method === 'PUT');
    expect(put?.path).toBe('/api/admin/operations/loggers/cz.novanadeje.app');
    expect(put?.body).toBe('{"level":"DEBUG","minutes":30}');
    expect(put?.authorization).toBe('Bearer api-token-write');

    const reset = await client.callTool({
      name: 'nfnn_reset_log_level',
      arguments: { logger: 'cz.novanadeje.app' },
    });
    expect(reset.isError).toBeFalsy();
    expect(textOf(reset)).toContain('back at its configured level');

    const none = await client.callTool({
      name: 'nfnn_reset_log_level',
      arguments: { logger: 'org.hibernate.SQL' },
    });
    expect(none.isError).toBe(true);
    expect(textOf(none)).toContain('404 operations/log-override-not-found');
  });

  it('when a photo is uploaded from an address, then its bytes reach the administration as a file and the id comes back for the cover', async () => {
    const result = await client.callTool({
      name: 'nfnn_upload_photo',
      arguments: { url: PHOTO_URL },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain(`"id":"${MEDIA_ID}"`);
    expect(textOf(result)).toContain(`Use coverImageId "${MEDIA_ID}"`);
    const upload = stack.backend.requests.find(
      (request) => request.path === '/api/admin/content/media',
    );
    expect(upload?.method).toBe('POST');
    expect(upload?.authorization).toBe('Bearer api-token-write');
    expect(upload?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(upload?.body).toContain('Content-Type: image/jpeg');
    expect(upload?.body).toContain('jpeg-bytes');
  });

  it('when the photo address is refused or the image is unusable, then the tool says why', async () => {
    const privateAddress = await client.callTool({
      name: 'nfnn_upload_photo',
      arguments: { url: 'https://192.168.1.10/photo.jpg' },
    });
    expect(privateAddress.isError).toBe(true);
    expect(textOf(privateAddress)).toBe(
      'The photo was not uploaded: the address points into a private network.',
    );
    expect(stack.logLines).toContain(
      'INFO Tool nfnn_upload_photo refused for donor donor-jana: photo-refused',
    );
    const broken = await client.callTool({
      name: 'nfnn_upload_photo',
      arguments: { url: BROKEN_PHOTO_URL },
    });
    expect(broken.isError).toBe(true);
    expect(textOf(broken)).toContain('400 content/unsupported-image');
  });

  it('when an upload link is asked, then it names the address on the site, a ticket and a curl line', async () => {
    const link = JSON.parse(
      textOf(await client.callTool({ name: 'nfnn_photo_upload_link', arguments: {} })),
    ) as { method: string; url: string; headers: Record<string, string>; example: string };
    expect(link.method).toBe('PUT');
    expect(link.url).toBe('https://nfnn.example/mcp-photos');
    expect(link.headers['X-Upload-Ticket']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link.example).toContain(`X-Upload-Ticket: ${link.headers['X-Upload-Ticket']}`);
  });
});

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
