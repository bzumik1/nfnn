import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BackendProblem } from '../backend.js';
import { DEFAULT_TAIL_BYTES, MAX_TAIL_BYTES } from '../logs.js';
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
  const { backend, logs } = deps;

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
        'Donations, new donors and unpaired payments of a year, month by month (newest first), with the years that have donations.',
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
        'The log files on the server (backend.log, backup.log and their rotated copies) with size and last change.',
      annotations: READ_ONLY,
    },
    async (ctx) => answer(deps, ctx, 'nfnn_log_files', async () => text(await logs.list())),
  );

  server.registerTool(
    'nfnn_log',
    {
      title: 'Konec logu',
      description: `The end of a log file (the last tailBytes bytes, ${DEFAULT_TAIL_BYTES} by default, at most ${MAX_TAIL_BYTES}); a rotated .gz copy is unpacked first.`,
      inputSchema: z.object({
        file: z.string().default('backend.log'),
        tailBytes: z.number().int().min(1).max(MAX_TAIL_BYTES).default(DEFAULT_TAIL_BYTES),
      }),
      annotations: READ_ONLY,
    },
    async ({ file, tailBytes }, ctx) =>
      answer(deps, ctx, 'nfnn_log', async () => {
        const tail = await logs.tail(file, tailBytes);
        return plain(
          `${tail.name}: last ${tail.tailBytes} of ${tail.sizeBytes} bytes\n\n${tail.text}`,
        );
      }),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
