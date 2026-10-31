import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BackendProblem } from '../backend.js';
import {
  answer,
  asRecord,
  plain,
  PROJECT_ORDERS,
  text,
  ToolRefusal,
  withHint,
  type Caller,
  type ToolDependencies,
} from './support.js';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const YEAR = z.number().int().min(2000).max(2100);
const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const LOG_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DONATIONS_SHOWN = 20;
const LOG_TIMES =
  'Times in backend.log carry the Prague offset (+01:00 or +02:00); nginx-access.log, backup.log and mcp.log are in UTC.';

export function registerReadingTools(server: McpServer, deps: ToolDependencies): void {
  const { backend } = deps;

  server.registerTool(
    'nfnn_status',
    {
      title: 'Stav serveru',
      description:
        'The running backend version and health, the Fio bank import state (covered period, last attempt and success, failures, reported outage), the last backup and test restore, and the key that signs the verification QR codes on receipts (its id, when the server registered it, whether it is published; attention is true when a key fails its seal and is not published, and when that part is unavailable, which leaves the rest of the status as it is).',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_status', async ({ apiToken }) => {
        const [info, health, importState, backups, signingKeys] = await Promise.all([
          backend.get('/actuator/info'),
          backend.get('/actuator/health'),
          backend.get('/api/admin/donations/import-state', apiToken),
          backend.get('/api/admin/operations/backups', apiToken),
          backend
            .get('/api/admin/donations/receipt-signing-keys', apiToken)
            .then(receiptSigningKeys, unavailableReceiptSigningKeys),
        ]);
        const backupView = asRecord(backups);
        return text({
          build: asRecord(info)['build'],
          health: asRecord(health)['status'],
          bankImport: importState,
          lastBackup: backupView['lastBackup'],
          lastTestRestore: backupView['lastTestRestore'],
          backupProblems: backupView['problems'],
          receiptSigningKeys: signingKeys,
        });
      }),
  );

  server.registerTool(
    'nfnn_overview',
    {
      title: 'Roční přehled',
      description:
        'Donations and donors of a year, month by month (newest first): everything received (received = paired + unpaired), new donors (registrations), givingDonors (the distinct donors with a received donation, so only paired ones count), the part paired with a registered donor and the unpaired part, with the years that have a donation or a bank payment.',
      inputSchema: z.object({
        year: YEAR.optional().describe('The calendar year; the current one when omitted.'),
      }),
      annotations: READ_ONLY,
    },
    async ({ year }, ctx) =>
      answer(deps, ctx, 'nfnn_overview', async ({ apiToken }) =>
        text(
          await backend.get(
            `/api/admin/donations/overview${year === undefined ? '' : `?year=${year}`}`,
            apiToken,
          ),
        ),
      ),
  );

  server.registerTool(
    'nfnn_since_last_sign_in',
    {
      title: 'Od posledního přihlášení',
      description:
        'What came in since the administrator who connected signed in to the administration before the current sign-in (previousSignInAt), or since `from`: the bank payments imported since then (count and total), the part paired with a donor, the part that still waits to be paired, and the donors who registered since then (newDonors). This is the block at the top of /sprava.',
      inputSchema: z.object({
        from: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe('Count from this instant (ISO 8601) instead of the previous sign-in.'),
      }),
      annotations: READ_ONLY,
    },
    async ({ from }, ctx) =>
      answer(deps, ctx, 'nfnn_since_last_sign_in', async ({ apiToken }) => {
        const previous = asRecord(
          await backend.get('/api/admin/donors/me/previous-sign-in', apiToken),
        )['previousSignInAt'];
        const previousSignInAt = typeof previous === 'string' ? previous : null;
        const since = from ?? previousSignInAt;
        if (since === null) {
          return plain(
            'The administrator has no earlier sign-in to the administration: this is the first one. Pass `from` to count from a moment of your choice.',
          );
        }
        const activity = await backend.get(
          `/api/admin/donations/overview/since?${new URLSearchParams({ from: since })}`,
          apiToken,
        );
        return text({ previousSignInAt, activity });
      }),
  );

  server.registerTool(
    'nfnn_payments',
    {
      title: 'Platby z banky',
      description:
        'Incoming bank payments, newest first, a page at a time: "unpaired" are the payments no donation references; "paired" are the donations with their payments and donors, of one year or of every year. `query` also finds an amount in crowns (e.g. "500" or "1 000,50"). `total` counts every payment that matches, so page on with `offset`.',
      inputSchema: z.object({
        pairing: z.enum(['unpaired', 'paired']).default('unpaired'),
        year: YEAR.optional().describe('For "paired": only this year; every year when omitted.'),
        query: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Text the bank transaction id, the variable symbol, the counterparty account, its name, the message or the paired donor name contains (case and diacritics ignored).',
          ),
        from: DAY.optional().describe('Only payments booked on or after this day (YYYY-MM-DD).'),
        to: DAY.optional().describe('Only payments booked on or before this day (YYYY-MM-DD).'),
        donorId: UUID.optional().describe('For "paired": only the donations of this donor.'),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(50),
      }),
      annotations: READ_ONLY,
    },
    async ({ pairing, year, query, from, to, donorId, offset, limit }, ctx) =>
      answer(
        deps,
        ctx,
        'nfnn_payments',
        async ({ apiToken }) => {
          const params = new URLSearchParams({ pairing });
          for (const [key, value] of Object.entries({ year, query, from, to, donorId })) {
            if (value !== undefined) {
              params.set(key, String(value));
            }
          }
          params.set('offset', String(offset));
          params.set('limit', String(limit));
          const page = asRecord(
            await backend.get(`/api/admin/donations/payments?${params}`, apiToken),
          );
          const shown = Array.isArray(page['items']) ? page['items'].length : 0;
          const total = typeof page['total'] === 'number' ? page['total'] : shown;
          return withHint(
            text(page),
            offset + shown < total
              ? `Showing ${offset + 1}–${offset + shown} of ${total}: call nfnn_payments again with offset ${offset + shown} for more.`
              : undefined,
          );
        },
        donorId === undefined ? undefined : `donor ${donorId}`,
      ),
  );

  server.registerTool(
    'nfnn_find_donors',
    {
      title: 'Hledání dárců',
      description:
        'Donor accounts by name, a page at a time: those whose name or e-mail contains the query or whose variable symbol starts with it, or every donor when the query is left out. `hasMore` says whether another page follows.',
      inputSchema: z.object({
        query: z.string().trim().max(254).optional(),
        page: z.number().int().min(0).max(100_000).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, page, limit }, ctx) =>
      answer(deps, ctx, 'nfnn_find_donors', async ({ apiToken }) => {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (query) {
          params.set('query', query);
        }
        const found = asRecord(await backend.get(`/api/admin/donors?${params}`, apiToken));
        return withHint(
          text(found),
          found['hasMore'] === true
            ? `More donors: call nfnn_find_donors again with page ${page + 1}.`
            : undefined,
        );
      }),
  );

  server.registerTool(
    'nfnn_donor',
    {
      title: 'Karta dárce',
      description: `A donor's card: the account (type, name, address, e-mail, symbol, roles, second factor) and the donation side (what the donations context keeps beyond the account, bank accounts, the newest ${DONATIONS_SHOWN} donations with the count and total of all, receipts). Every donation of the donor: nfnn_payments with pairing "paired" and donorId.`,
      inputSchema: z.object({ donorId: UUID }),
      annotations: READ_ONLY,
    },
    async ({ donorId }, ctx) =>
      answer(
        deps,
        ctx,
        'nfnn_donor',
        async ({ apiToken }) => {
          const account = asRecord(await backend.get(`/api/admin/donors/${donorId}`, apiToken));
          const donations = await backend
            .get(`/api/admin/donations/donors/${donorId}`, apiToken)
            .then((side) => donationSide(account, asRecord(side)))
            .catch((thrown: unknown) => {
              if (thrown instanceof BackendProblem && thrown.problem.status === 404) {
                return 'The donor has no donation record yet (the e-mail was never confirmed).';
              }
              throw thrown;
            });
          return text({ account, donations });
        },
        `donor ${donorId}`,
      ),
  );

  server.registerTool(
    'nfnn_backups',
    {
      title: 'Zálohy',
      description:
        'The database backups: the dumps on the server, the last backup, test restore and restore, the restore folder, pending requests, problems, the plan (`schedule`: daily backup time, test restore weekday 1–7 and time, Prague time; `applied` is the plan the backup container reports it runs) and the backup key (`key`: whether the server has one and whether an administrator confirmed saving it; the dumps are encrypted with it, and the key itself is shown only on the web at /sprava/zalohy).',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_backups', async ({ apiToken }) =>
        text(await backend.get('/api/admin/operations/backups', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_admin_actions',
    {
      title: 'Historie změn',
      description:
        'The audit trail of the administration, newest first: who did what and when. `summary` says each change in a sentence (in Czech), `donorId` names the donor it concerned, `details` keeps the stored text with the ids.',
      inputSchema: z.object({
        before: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            'Only actions before this instant (ISO 8601), as the previous answer names it for the next page.',
          ),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: READ_ONLY,
    },
    async ({ before, limit }, ctx) =>
      answer(deps, ctx, 'nfnn_admin_actions', async ({ apiToken }) => {
        const query = new URLSearchParams({ limit: String(limit) });
        if (before !== undefined) {
          query.set('before', before);
        }
        const page = asRecord(await backend.get(`/api/admin/donors/actions?${query}`, apiToken));
        const items = Array.isArray(page['items']) ? page['items'] : [];
        const oldest = asRecord(items[items.length - 1])['performedAt'];
        const result = text(page);
        if (page['hasMore'] === true && typeof oldest === 'string') {
          result.content.push({
            type: 'text',
            text: `Older actions: call nfnn_admin_actions again with before "${oldest}".`,
          });
        }
        return result;
      }),
  );

  server.registerTool(
    'nfnn_report',
    {
      title: 'Měsíční přehled',
      description:
        'The monthly report settings (recipients, send day, sections), the reports sent and the next one due.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_report', async ({ apiToken }) =>
        text(await backend.get('/api/admin/donations/report', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_settings',
    {
      title: 'Nastavení webu',
      description:
        'The settings of the site: public address, mail server and senders, Fio history start, accounts excluded from pairing, receipt signatory and first year. Secrets (SMTP password, Fio token) only say whether they are set or unreadable, never their value.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_settings', async ({ apiToken }) =>
        text(await backend.get('/api/admin/operations/settings', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_receipt_signature',
    {
      title: 'Podpis na potvrzeních',
      description:
        'Whether a scan of the signature is uploaded for donation receipts, its size in pixels and when it was uploaded (the image itself is left out). Receipts issued after the upload carry it above the signatory; uploading and removing it stay on the web (/sprava/nastaveni, "Potvrzení o daru").',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_receipt_signature', async ({ apiToken }) => {
        const { image: _image, ...signature } = (await backend.get(
          '/api/admin/donations/receipt-signature',
          apiToken,
        )) as Record<string, unknown>;
        return text(signature);
      }),
  );

  server.registerTool(
    'nfnn_administrators',
    {
      title: 'Správci',
      description:
        'Who administers the site: donor id, name, e-mail and whether the second factor is on. Granting or taking away the role and resetting a second factor stay on the web (/sprava/spravci, the donor card).',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_administrators', async ({ apiToken }) =>
        text(await backend.get('/api/admin/donors/administrators', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_symbol_claims',
    {
      title: 'Odpovědi na starší symboly',
      description:
        "Every donor's answer to the question whether an older variable symbol paid from a verified account was theirs, newest first, with the donor, account, symbol, answer and the donations paired through it. Reversing or deleting an answer deletes rows and stays on the web (/sprava/starsi-symboly).",
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_symbol_claims', async ({ apiToken }) =>
        text(await backend.get('/api/admin/donations/symbol-claims', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_content',
    {
      title: 'Aktuality a projekty',
      description:
        'Every news article and project of the site, drafts included, with id, slug, title, tag, perex, the year and category of a project, photo, published date, live (whether the site shows it today: published and the published date not after today in Prague) and the length of the text, but not the text itself: read one whole with nfnn_news_article or nfnn_project.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_content', async ({ apiToken }) => {
        const [news, projects] = await Promise.all([
          backend.get('/api/admin/content/news', apiToken),
          backend.get('/api/admin/content/projects', apiToken),
        ]);
        return text({ news: withoutBodies(news), projects: withoutBodies(projects) });
      }),
  );

  server.registerTool(
    'nfnn_project_order',
    {
      title: 'Řazení projektů',
      description: `How the site orders the projects on the home page and the list of projects (the administration lists them the same way, drafts first), as \`order\`: ${PROJECT_ORDERS} Changed with nfnn_set_project_order.`,
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_project_order', async ({ apiToken }) =>
        text(await backend.get('/api/admin/content/project-order', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_news_article',
    {
      title: 'Aktualita',
      description:
        'One news article whole, draft or published: every field nfnn_update_news takes, with its text and photo, and live (whether the site shows it today; false for a draft and before its published date).',
      inputSchema: z.object({ id: UUID }),
      annotations: READ_ONLY,
    },
    async ({ id }, ctx) =>
      answer(
        deps,
        ctx,
        'nfnn_news_article',
        async ({ apiToken }) => text(await backend.get(`/api/admin/content/news/${id}`, apiToken)),
        `news ${id}`,
      ),
  );

  server.registerTool(
    'nfnn_project',
    {
      title: 'Projekt',
      description:
        'One project whole, draft or published: every field nfnn_update_project takes, with its text, year, category and photo, and live (whether the site shows it today; false for a draft and before its published date).',
      inputSchema: z.object({ id: UUID }),
      annotations: READ_ONLY,
    },
    async ({ id }, ctx) =>
      answer(
        deps,
        ctx,
        'nfnn_project',
        async ({ apiToken }) =>
          text(await backend.get(`/api/admin/content/projects/${id}`, apiToken)),
        `project ${id}`,
      ),
  );

  server.registerTool(
    'nfnn_about',
    {
      title: 'Fotka v sekci O nás',
      description:
        'The photo the home page shows in its About section: its id, size in pixels, alt (read by screen readers) and caption (shown under it to every visitor), or photo null while the site shows its placeholder photo. Change it with nfnn_update_about.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_about', async ({ apiToken }) =>
        text(await backend.get('/api/admin/content/about', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_people',
    {
      title: 'Lidé fondu',
      description:
        'The people of the foundation (Lidé fondu) the home page shows in "Kdo fond vede", in their order: id, name, role, position, onBoard with boardNote, featured, portrait and webSignature (id, url, size, or null), personalEmail and fundEmail (administration data only, never on the site), linkedToAccount (true when one of those e-mails is the confirmed e-mail of an account on the site; the link only shows the portrait at that account and grants nothing), the founders note under the cards and the footnote, the one line under the board line (each null when none). With no people the home page shows its own block. Change them with nfnn_add_person, nfnn_update_person, nfnn_remove_person, nfnn_order_people, nfnn_update_founders_note, nfnn_update_people_footnote, nfnn_set_web_signature and nfnn_remove_web_signature.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_people', async ({ apiToken }) =>
        text(await backend.get('/api/admin/content/people', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_log_files',
    {
      title: 'Soubory logů',
      description: `The log files on the server (backend.log, backup.log, nginx-access.log with every request to the site without addresses or query strings, mcp.log of this connector, and their rotated .gz copies of the last 14 days) with size on disk and last change; sizes of a .gz copy are the unpacked ones in nfnn_log. ${LOG_TIMES}`,
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_log_files', async ({ apiToken }) =>
        text(await backend.get('/api/admin/operations/logs', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_log',
    {
      title: 'Výřez logu',
      description: `A window of whole lines of a log file named as nfnn_log_files lists it: the last \`bytes\` bytes (20000 by default, at most 200000) or, with \`from\`, the lines starting at that byte position. The answer names the window (from, to, hasOlder, hasNewer) so the whole file can be read page by page: pass \`from\` = the previous \`to\` for newer lines, or \`from\` = previous \`from\` − bytes for older ones. A rotated .gz copy is unpacked first. ${LOG_TIMES}`,
      inputSchema: z.object({
        file: z.string().default('backend.log'),
        from: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Byte position to start at; the end of the file when omitted.'),
        bytes: z
          .number()
          .int()
          .min(1)
          .max(200_000)
          .optional()
          .describe('Window size in bytes, 20000 by default.'),
      }),
      annotations: READ_ONLY,
    },
    async ({ file, from, bytes }, ctx) =>
      answer(deps, ctx, 'nfnn_log', async (caller) => {
        const { apiToken } = caller;
        await requireLogFile(deps, caller, file);
        const query = new URLSearchParams();
        if (from !== undefined) {
          query.set('from', String(from));
        }
        if (bytes !== undefined) {
          query.set('bytes', String(bytes));
        }
        const suffix = query.size === 0 ? '' : `?${query.toString()}`;
        const window = asRecord(
          await backend.get(
            `/api/admin/operations/logs/${encodeURIComponent(file)}${suffix}`,
            apiToken,
          ),
        );
        return plain(
          `${String(window['name'])}: bytes ${String(window['from'])}–${String(window['to'])} of ${String(window['sizeBytes'])} (older: ${String(window['hasOlder'])}, newer: ${String(window['hasNewer'])})\n\n${String(window['text'])}`,
        );
      }),
  );

  server.registerTool(
    'nfnn_log_search',
    {
      title: 'Hledání v logu',
      description: `Searches a log file with a case-insensitive regular expression (at most 200 characters) and answers the newest matching lines first with their file and byte position (\`offset\`), at most \`limit\` (50 by default, 200 at most). With \`rotated\` the search goes on into the rotated .gz copies of the file, newest first, so 14 days are searched in one call. When more matches remain, the answer names \`continueWith\` (a file and \`before\`): pass both back for the next, older page. Read the lines around a match with nfnn_log, that file and \`from\` = offset − some bytes. ${LOG_TIMES}`,
      inputSchema: z.object({
        file: z.string().default('backend.log'),
        pattern: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(200).default(50),
        before: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Only matches before this byte position of `file` (from `continueWith`).'),
        rotated: z
          .boolean()
          .default(false)
          .describe('Also search the rotated copies of the file, newest first.'),
        series: z
          .string()
          .optional()
          .describe(
            'With `rotated`: the current file whose copies are searched (backend.log, …), when `file` is a rotated copy named by `continueWith`.',
          ),
      }),
      annotations: READ_ONLY,
    },
    async ({ file, pattern, limit, before, rotated, series }, ctx) =>
      answer(deps, ctx, 'nfnn_log_search', async (caller) => {
        const files = await requireLogFile(deps, caller, file);
        const queue = rotated ? searchOrder(files, series ?? file, file) : [file];
        const matches: Record<string, unknown>[] = [];
        let continueWith: { file: string; before?: number } | null = null;
        for (const [index, name] of queue.entries()) {
          const query = new URLSearchParams({ pattern, limit: String(limit - matches.length) });
          if (index === 0 && before !== undefined) {
            query.set('before', String(before));
          }
          const found = asRecord(
            await backend.get(
              `/api/admin/operations/logs/${encodeURIComponent(name)}/search?${query.toString()}`,
              caller.apiToken,
            ),
          );
          const lines = Array.isArray(found['matches']) ? found['matches'] : [];
          matches.push(...lines.map((line) => ({ file: name, ...asRecord(line) })));
          const next = queue[index + 1];
          if (matches.length >= limit) {
            const last = asRecord(lines[lines.length - 1])['offset'];
            continueWith =
              found['moreOlder'] === true && typeof last === 'number'
                ? { file: name, before: last }
                : next === undefined
                  ? null
                  : { file: next };
            break;
          }
        }
        const result = text({ pattern, searched: queue, matches, continueWith });
        return withHint(
          result,
          continueWith === null
            ? undefined
            : `Older matches: call nfnn_log_search again with file "${continueWith.file}"${continueWith.before === undefined ? '' : ` and before ${continueWith.before}`}${rotated ? `, rotated true and series "${series ?? file}"` : ''}.`,
        );
      }),
  );

  server.registerTool(
    'nfnn_log_levels',
    {
      title: 'Úrovně logování',
      description:
        'The log levels of the watched loggers (ROOT, cz.novanadeje.app, the Fio library, Spring web and security, Hibernate SQL, Liquibase, mail): what is configured, what is in effect and any temporary level with its end. Change one with nfnn_set_log_level.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_log_levels', async ({ apiToken }) =>
        text(await backend.get('/api/admin/operations/loggers', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_diagnostics',
    {
      title: 'Diagnostika serveru',
      description:
        'The running JVM (version, start, heap, threads, GC, load), the database (reachable, ping, pool usage), the free space of the log, backup and restore folders and the temporary log levels in effect.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_diagnostics', async ({ apiToken }) =>
        text(await backend.get('/api/admin/operations/diagnostics', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_thread_dump',
    {
      title: 'Výpis vláken',
      description:
        'A dump of every thread of the backend with its state, locks and stack, for a hanging request or a deadlock.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_thread_dump', async ({ apiToken }) =>
        plain(await backend.getText('/api/admin/operations/diagnostics/threads', apiToken)),
      ),
  );
}

function withoutBodies(list: unknown): unknown[] {
  const items = asRecord(list)['items'];
  return (Array.isArray(items) ? items : []).map((item) => {
    const { body, ...rest } = asRecord(item);
    return { ...rest, bodyLength: typeof body === 'string' ? body.length : 0 };
  });
}

function donationSide(account: Record<string, unknown>, side: Record<string, unknown>): unknown {
  const kept = Object.entries(asRecord(side['donor'])).filter(
    ([key, value]) => JSON.stringify(account[key]) !== JSON.stringify(value),
  );
  const list = asRecord(side['donations']);
  const items = Array.isArray(list['items']) ? list['items'] : [];
  return {
    ...side,
    donor: Object.fromEntries(kept),
    donations: {
      ...list,
      items: items.slice(0, DONATIONS_SHOWN),
      shown: Math.min(items.length, DONATIONS_SHOWN),
    },
  };
}

interface LogFile {
  readonly name: string;
  readonly changedAt: string;
}

async function requireLogFile(
  deps: ToolDependencies,
  caller: Caller,
  file: string,
): Promise<LogFile[]> {
  const listing = asRecord(await deps.backend.get('/api/admin/operations/logs', caller.apiToken));
  const files = (Array.isArray(listing['files']) ? listing['files'] : [])
    .map(asRecord)
    .map((entry) => ({ name: String(entry['name']), changedAt: String(entry['changedAt']) }));
  if (!LOG_FILE.test(file) || !files.some((entry) => entry.name === file)) {
    throw new ToolRefusal(
      'unknown-log-file',
      `There is no log file "${file}". The files are: ${files.map((entry) => entry.name).join(', ') || 'none yet'}.`,
    );
  }
  return files;
}

function searchOrder(files: readonly LogFile[], series: string, start: string): string[] {
  const copies = files
    .filter((entry) => entry.name.startsWith(`${series}.`) && entry.name.endsWith('.gz'))
    .sort(
      (left, right) =>
        right.changedAt.localeCompare(left.changedAt) || right.name.localeCompare(left.name),
    )
    .map((entry) => entry.name);
  const order = [series, ...copies];
  const from = order.indexOf(start);
  return from < 0 ? [start] : order.slice(from);
}

function unavailableReceiptSigningKeys(failure: unknown): Record<string, unknown> {
  return {
    unavailable: failure instanceof BackendProblem ? failure.message : 'the backend did not answer',
    attention: true,
  };
}

function receiptSigningKeys(answer: unknown): Record<string, unknown> {
  const view = asRecord(answer);
  const keys = Array.isArray(view['keys']) ? view['keys'].map(asRecord) : [];
  const current = keys.find((key) => key['current'] === true);
  const unpublished = keys.filter((key) => key['published'] !== true).map((key) => key['keyId']);
  return {
    currentKeyId: view['currentKeyId'],
    currentKeyRegisteredAt: current?.['registeredAt'] ?? null,
    currentKeyPublished: view['currentKeyPublished'],
    unpublishedKeyIds: unpublished,
    attention: view['currentKeyPublished'] !== true || unpublished.length > 0,
  };
}
