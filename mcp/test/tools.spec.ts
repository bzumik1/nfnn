import type { Client } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DONOR_ID, PAYMENT_ID, READ_TOKEN, UNKNOWN_ID, WRITE_TOKEN } from './fake-backend.js';
import { connect, MCP_URL, startApp, textOf, type TestApp } from './support.js';

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

  it('when the tools are listed, then every reading and writing tool is there with its annotations', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
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
      'nfnn_log',
      'nfnn_log_files',
      'nfnn_log_levels',
      'nfnn_log_search',
      'nfnn_overview',
      'nfnn_pair_payment',
      'nfnn_payments',
      'nfnn_publish_news',
      'nfnn_publish_project',
      'nfnn_reconnect_bank_account',
      'nfnn_report',
      'nfnn_request_backup',
      'nfnn_reset_log_level',
      'nfnn_send_report',
      'nfnn_set_log_level',
      'nfnn_settings',
      'nfnn_status',
      'nfnn_symbol_claims',
      'nfnn_thread_dump',
      'nfnn_unpair_payment',
      'nfnn_unpublish_news',
      'nfnn_unpublish_project',
      'nfnn_update_news',
      'nfnn_update_project',
      'nfnn_update_report_settings',
    ]);
    expect(tools.find((tool) => tool.name === 'nfnn_status')?.annotations?.readOnlyHint).toBe(true);
    expect(
      tools.find((tool) => tool.name === 'nfnn_unpair_payment')?.annotations?.destructiveHint,
    ).toBe(true);
  });

  it('when the status is asked, then the version, the import state and the last backup come as text with Prague times', async () => {
    const result = await client.callTool({ name: 'nfnn_status', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain('"revision": "abc1234"');
    expect(text).toContain('"health": "UP"');
    expect(text).toContain('"lastSucceededAt": "23. 10. 2026 07:00:00"');
    expect(text).toContain('"outcome": "OK"');
  });

  it('when the payments are asked, then the administration gets the exchanged API token and amounts read in crowns', async () => {
    const result = await client.callTool({
      name: 'nfnn_payments',
      arguments: { pairing: 'unpaired' },
    });
    const call = stack.backend.requests.find((request) =>
      request.path.startsWith('/api/admin/donations/payments'),
    );
    expect(call?.path).toBe('/api/admin/donations/payments?pairing=unpaired');
    expect(call?.authorization).toBe('Bearer api-token-read');
    expect(textOf(result)).toContain('"amount": "500,00 Kč"');
    expect(textOf(result)).not.toContain('amountMinor');
  });

  it('when a year is given, then the overview and the paired payments pass it on', async () => {
    await client.callTool({ name: 'nfnn_overview', arguments: { year: 2025 } });
    await client.callTool({ name: 'nfnn_payments', arguments: { pairing: 'paired', year: 2025 } });
    const paths = stack.backend.requests.map((request) => request.path);
    expect(paths).toContain('/api/admin/donations/overview?year=2025');
    expect(paths).toContain('/api/admin/donations/payments?pairing=paired&year=2025');
  });

  it('when a donor is looked up and opened, then both halves of the card come, a missing record explained', async () => {
    const found = await client.callTool({ name: 'nfnn_find_donors', arguments: { query: 'nov' } });
    expect(textOf(found)).toContain('Jana Nováková');
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/donors?query=nov',
    );
    const card = await client.callTool({ name: 'nfnn_donor', arguments: { donorId: DONOR_ID } });
    expect(card.isError).toBeFalsy();
    expect(textOf(card)).toContain('"registeredAt": "17. 10. 2026 12:00:00"');
    expect(textOf(card)).toContain('no donation record yet');
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
    expect(textOf(await client.callTool({ name: 'nfnn_content', arguments: {} }))).toContain(
      'Koncept',
    );
    expect(textOf(await client.callTool({ name: 'nfnn_backups', arguments: {} }))).toContain(
      'nfnn-2026-10-23_0300.dump',
    );
  });

  it('when the settings are asked, then they come from the administration with secrets only as set or not', async () => {
    const result = await client.callTool({ name: 'nfnn_settings', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"value": "https://nfnn.cz"');
    expect(stack.backend.requests.map((request) => request.path)).toContain(
      '/api/admin/operations/settings',
    );
  });

  it('when the administrators and the older-symbol answers are asked, then they come from the administration', async () => {
    const administrators = textOf(
      await client.callTool({ name: 'nfnn_administrators', arguments: {} }),
    );
    expect(administrators).toContain('"secondFactorEnabled": true');
    const claims = textOf(await client.callTool({ name: 'nfnn_symbol_claims', arguments: {} }));
    expect(claims).toContain('"answer": "CONFIRMED"');
    expect(claims).toContain('"answeredAt": "22. 10. 2026 12:00:00"');
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
    expect(textOf(search)).toContain('"offset": 36');
    expect(
      stack.backend.requests.find((request) =>
        request.path.startsWith('/api/admin/operations/logs/backend.log/search'),
      )?.path,
    ).toBe('/api/admin/operations/logs/backend.log/search?pattern=fio&limit=5');

    const missing = await client.callTool({ name: 'nfnn_log', arguments: { file: 'missing.log' } });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain('404 operations/log-not-found');
  });

  it('when the log levels, the diagnostics and the thread dump are asked, then they come as text', async () => {
    const levels = textOf(await client.callTool({ name: 'nfnn_log_levels', arguments: {} }));
    expect(levels).toContain('"logger": "cz.novanadeje.app"');
    expect(levels).toContain('"until": "23. 10. 2026 08:30:00"');
    expect(textOf(await client.callTool({ name: 'nfnn_diagnostics', arguments: {} }))).toContain(
      '"reachable": true',
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
    expect(textOf(result)).toContain('"pairedBy": "MANUAL"');
    expect(stack.logLines).toContain('INFO Tool nfnn_pair_payment answered donor donor-jana');
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
    ).toContain('"month": "2026-09"');
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
    ).toContain('"publishedOn": "2026-10-23"');
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
      sections: { donors: true, donations: true, unpairedPayments: false, bankImport: true },
    };
    const result = await client.callTool({
      name: 'nfnn_update_report_settings',
      arguments: settings,
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"sendDay": 5');
    const put = stack.backend.requests.find((request) => request.method === 'PUT');
    expect(put?.path).toBe('/api/admin/donations/report/settings');
    expect(JSON.parse(put?.body ?? '{}')).toEqual(settings);
    expect(put?.authorization).toBe('Bearer api-token-write');
  });

  it('when a news article and a project are written and edited, then drafts are created and replaced', async () => {
    const article = {
      title: 'Letní tábor',
      perex: 'Krátce o táboře.',
      body: 'První odstavec.\n\nDruhý odstavec.',
      tag: 'Tábor',
    };
    const created = await client.callTool({ name: 'nfnn_create_news', arguments: article });
    expect(textOf(created)).toContain('"slug": "letni-tabor"');
    const edited = await client.callTool({
      name: 'nfnn_update_news',
      arguments: { id: UNKNOWN_ID, ...article, slug: 'tabor-2026' },
    });
    expect(edited.isError).toBeFalsy();
    const project = { title: 'Nová střecha', year: 2026, perex: 'Střecha.', body: 'Text.' };
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

  it('when the pairing from a donor account is turned off and on, then the administration gets both and a refusal comes back', async () => {
    const off = await client.callTool({
      name: 'nfnn_disconnect_bank_account',
      arguments: { donorId: DONOR_ID, linkId: PAYMENT_ID },
    });
    expect(off.isError).toBeFalsy();
    expect(textOf(off)).toContain('turned off');
    const on = await client.callTool({
      name: 'nfnn_reconnect_bank_account',
      arguments: { donorId: DONOR_ID, linkId: PAYMENT_ID },
    });
    expect(on.isError).toBe(true);
    expect(textOf(on)).toContain('409 donations/bank-account-link-active');
    expect(
      stack.backend.requests
        .filter((request) => request.path.includes('/bank-accounts/'))
        .map((request) => `${request.method} ${request.path}`),
    ).toEqual([
      `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${PAYMENT_ID}/disconnect`,
      `POST /api/admin/donations/donors/${DONOR_ID}/bank-accounts/${PAYMENT_ID}/reconnect`,
    ]);
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
    expect(textOf(changed)).toContain('"restarting": true');
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

  it('when a secret setting is passed, then the tool refuses it before calling the administration', async () => {
    const result = await client.callTool({
      name: 'nfnn_change_settings',
      arguments: { changes: [{ name: 'FIO_TOKEN', value: 'secret' }] },
    });
    expect(result.isError).toBe(true);
    expect(
      stack.backend.requests.filter((request) => request.path === '/api/admin/operations/settings'),
    ).toHaveLength(0);
  });

  it('when a log level is raised and reset, then the administration gets the PUT and DELETE and a missing override is explained', async () => {
    const raised = await client.callTool({
      name: 'nfnn_set_log_level',
      arguments: { logger: 'cz.novanadeje.app', level: 'DEBUG', minutes: 30 },
    });
    expect(textOf(raised)).toContain('"level": "DEBUG"');
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
});
