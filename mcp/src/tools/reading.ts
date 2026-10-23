import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BackendProblem } from '../backend.js';
import { answer, plain, text, type ToolDependencies } from './support.js';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const YEAR = z.number().int().min(2000).max(2100);
const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export function registerReadingTools(server: McpServer, deps: ToolDependencies): void {
  const { backend } = deps;

  server.registerTool(
    'nfnn_status',
    {
      title: 'Stav serveru',
      description:
        'The running backend version and health, the Fio bank import state (covered period, last attempt and success, failures, reported outage) and the last backup and test restore.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_status', async ({ apiToken }) => {
        const [info, health, importState, backups] = await Promise.all([
          backend.get('/actuator/info'),
          backend.get('/actuator/health'),
          backend.get('/api/admin/donations/import-state', apiToken),
          backend.get('/api/admin/operations/backups', apiToken),
        ]);
        const backupView = asRecord(backups);
        return text({
          build: asRecord(info)['build'],
          health: asRecord(health)['status'],
          bankImport: importState,
          lastBackup: backupView['lastBackup'],
          lastTestRestore: backupView['lastTestRestore'],
          backupProblems: backupView['problems'],
        });
      }),
  );

  server.registerTool(
    'nfnn_overview',
    {
      title: 'Roční přehled',
      description:
        'Donations and donors of a year, month by month (newest first): everything received (received = paired + unpaired), new donors, the part paired with a registered donor and the unpaired part, with the years that have a donation or a bank payment.',
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
    'nfnn_payments',
    {
      title: 'Platby z banky',
      description:
        'Incoming bank payments: "unpaired" lists every payment that no donation references (newest first); "paired" lists the donations of a year with their payments and donors.',
      inputSchema: z.object({
        pairing: z.enum(['unpaired', 'paired']).default('unpaired'),
        year: YEAR.optional().describe(
          'For "paired": the year; the newest year with a donation when omitted.',
        ),
      }),
      annotations: READ_ONLY,
    },
    async ({ pairing, year }, ctx) =>
      answer(deps, ctx, 'nfnn_payments', async ({ apiToken }) => {
        const query = new URLSearchParams({ pairing });
        if (year !== undefined) {
          query.set('year', String(year));
        }
        return text(await backend.get(`/api/admin/donations/payments?${query}`, apiToken));
      }),
  );

  server.registerTool(
    'nfnn_find_donors',
    {
      title: 'Hledání dárců',
      description:
        'Up to 20 donor accounts whose name or e-mail contains the query or whose variable symbol starts with it.',
      inputSchema: z.object({ query: z.string().trim().min(1).max(254) }),
      annotations: READ_ONLY,
    },
    async ({ query }, ctx) =>
      answer(deps, ctx, 'nfnn_find_donors', async ({ apiToken }) =>
        text(await backend.get(`/api/admin/donors?${new URLSearchParams({ query })}`, apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_donor',
    {
      title: 'Karta dárce',
      description:
        "A donor's card: the account (type, name, address, e-mail, symbol, roles, second factor) and the donation side (bank accounts, donations, receipts).",
      inputSchema: z.object({ donorId: UUID }),
      annotations: READ_ONLY,
    },
    async ({ donorId }, ctx) =>
      answer(deps, ctx, 'nfnn_donor', async ({ apiToken }) => {
        const account = await backend.get(`/api/admin/donors/${donorId}`, apiToken);
        const donations = await backend
          .get(`/api/admin/donations/donors/${donorId}`, apiToken)
          .catch((thrown: unknown) => {
            if (thrown instanceof BackendProblem && thrown.problem.status === 404) {
              return 'The donor has no donation record yet (the e-mail was never confirmed).';
            }
            throw thrown;
          });
        return text({ account, donations });
      }),
  );

  server.registerTool(
    'nfnn_backups',
    {
      title: 'Zálohy',
      description:
        'The database backups: the dumps on the server, the last backup, test restore and restore, the restore folder, pending requests and problems.',
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
      title: 'Historie správy',
      description: 'The audit trail of the administration, newest first: who did what and when.',
      inputSchema: z.object({
        before: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe('Only actions before this instant (ISO 8601).'),
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
        return text(await backend.get(`/api/admin/donors/actions?${query}`, apiToken));
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
        'The settings of the site: public address, mail server and senders, Fio history start, accounts excluded from pairing, receipt signatory and first year. Secrets (SMTP password, Fio token, tunnel token) only say whether they are set or unreadable, never their value.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_settings', async ({ apiToken }) =>
        text(await backend.get('/api/admin/operations/settings', apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_content',
    {
      title: 'Aktuality a projekty',
      description:
        'Every news article and project of the site, drafts included, with their ids and published dates.',
      annotations: READ_ONLY,
    },
    async (ctx) =>
      answer(deps, ctx, 'nfnn_content', async ({ apiToken }) => {
        const [news, projects] = await Promise.all([
          backend.get('/api/admin/content/news', apiToken),
          backend.get('/api/admin/content/projects', apiToken),
        ]);
        return text({ news: asRecord(news)['items'], projects: asRecord(projects)['items'] });
      }),
  );

  server.registerTool(
    'nfnn_log_files',
    {
      title: 'Soubory logů',
      description:
        'The log files on the server (backend.log, backup.log and their rotated .gz copies of the last 14 days) with size on disk and last change; sizes of a .gz copy are the unpacked ones in nfnn_log.',
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
      description:
        'A window of whole lines of a log file: the last `bytes` bytes (20000 by default, at most 200000) or, with `from`, the lines starting at that byte position. The answer names the window (from, to, hasOlder, hasNewer) so the whole file can be read page by page: pass `from` = the previous `to` for newer lines, or `from` = previous `from` − bytes for older ones. A rotated .gz copy is unpacked first.',
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
      answer(deps, ctx, 'nfnn_log', async ({ apiToken }) => {
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
      description:
        'Searches a log file with a case-insensitive regular expression (at most 200 characters) and answers the newest matching lines first with their byte positions (`offset`), at most `limit` (50 by default, 200 at most); `before` pages towards older matches (pass the last `offset`), and `moreOlder` says whether there are any. Read the lines around a match with nfnn_log and `from` = offset − some bytes.',
      inputSchema: z.object({
        file: z.string().default('backend.log'),
        pattern: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(200).optional(),
        before: z.number().int().min(0).optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ file, pattern, limit, before }, ctx) =>
      answer(deps, ctx, 'nfnn_log_search', async ({ apiToken }) => {
        const query = new URLSearchParams({ pattern });
        if (limit !== undefined) {
          query.set('limit', String(limit));
        }
        if (before !== undefined) {
          query.set('before', String(before));
        }
        return text(
          await backend.get(
            `/api/admin/operations/logs/${encodeURIComponent(file)}/search?${query.toString()}`,
            apiToken,
          ),
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
        plain(String(await backend.get('/api/admin/operations/diagnostics/threads', apiToken))),
      ),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
