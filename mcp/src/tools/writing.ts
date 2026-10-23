import { requireScopes, type McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { answer, plain, text, WRITE_SCOPE, type ToolDependencies } from './support.js';

const WRITING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MONTH = z.string().regex(/^\d{4}-\d{2}$/);
const PLAIN_SETTING = z.enum([
  'PUBLIC_URL',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USERNAME',
  'MAIL_AUTH',
  'MAIL_STARTTLS',
  'MAIL_FROM',
  'CONTACT_RECIPIENT',
  'FIO_HISTORY_FROM',
  'PAIRING_EXCLUDED_ACCOUNTS',
  'RECEIPT_SIGNATORY_NAME',
  'RECEIPT_SIGNATORY_ROLE',
  'RECEIPT_FIRST_YEAR',
]);

export function registerWritingTools(server: McpServer, deps: ToolDependencies): void {
  const { backend } = deps;
  const scopeChallenge = requireScopes(WRITE_SCOPE);

  server.registerTool(
    'nfnn_pair_payment',
    {
      title: 'Spárovat platbu',
      description:
        "Pairs an unpaired bank payment with a donor by hand (audited as PAIR_PAYMENT); the donation then counts in the donor's overview and receipts.",
      inputSchema: z.object({ paymentId: UUID, donorId: UUID }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ paymentId, donorId }, ctx) =>
      answer(deps, ctx, 'nfnn_pair_payment', async ({ apiToken }) =>
        text(
          await backend.post(`/api/admin/donations/payments/${paymentId}/pair`, apiToken, {
            donorId,
          }),
        ),
      ),
  );

  server.registerTool(
    'nfnn_unpair_payment',
    {
      title: 'Zrušit spárování platby',
      description:
        'Removes the donation of a paired payment, so the payment is unpaired again (refused while a receipt certifies the donation); audited as UNPAIR_PAYMENT.',
      inputSchema: z.object({ paymentId: UUID }),
      annotations: { ...WRITING, destructiveHint: true },
      scopeChallenge,
    },
    async ({ paymentId }, ctx) =>
      answer(deps, ctx, 'nfnn_unpair_payment', async ({ apiToken }) =>
        text(await backend.post(`/api/admin/donations/payments/${paymentId}/unpair`, apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_send_report',
    {
      title: 'Odeslat měsíční přehled',
      description:
        'Sends the monthly report of an ended month (YYYY-MM) to the current recipients again; audited as SEND_MONTHLY_REPORT.',
      inputSchema: z.object({ month: MONTH }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ month }, ctx) =>
      answer(deps, ctx, 'nfnn_send_report', async ({ apiToken }) =>
        text(await backend.post('/api/admin/donations/report/send', apiToken, { month })),
      ),
  );

  server.registerTool(
    'nfnn_request_backup',
    {
      title: 'Vyžádat zálohu',
      description:
        'Asks the backup container for a database backup now (BACKUP) or for a test restore of the newest dump (TEST_RESTORE); it runs within about ten seconds and nfnn_backups shows the outcome. Audited.',
      inputSchema: z.object({ kind: z.enum(['BACKUP', 'TEST_RESTORE']) }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ kind }, ctx) =>
      answer(deps, ctx, 'nfnn_request_backup', async ({ apiToken }) =>
        text(await backend.post('/api/admin/operations/backups/requests', apiToken, { kind })),
      ),
  );

  server.registerTool(
    'nfnn_publish_news',
    {
      title: 'Zveřejnit aktualitu',
      description:
        'Puts a news article on the site from the given day (YYYY-MM-DD, past or future); audited as PUBLISH_NEWS.',
      inputSchema: z.object({ id: UUID, publishedOn: DAY }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ id, publishedOn }, ctx) =>
      answer(deps, ctx, 'nfnn_publish_news', async ({ apiToken }) =>
        text(
          await backend.post(`/api/admin/content/news/${id}/publish`, apiToken, { publishedOn }),
        ),
      ),
  );

  server.registerTool(
    'nfnn_unpublish_news',
    {
      title: 'Stáhnout aktualitu z webu',
      description:
        'Takes a news article off the site (it becomes a draft again); audited as UNPUBLISH_NEWS.',
      inputSchema: z.object({ id: UUID }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ id }, ctx) =>
      answer(deps, ctx, 'nfnn_unpublish_news', async ({ apiToken }) =>
        text(await backend.post(`/api/admin/content/news/${id}/unpublish`, apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_publish_project',
    {
      title: 'Zveřejnit projekt',
      description:
        'Puts a project on the site from the given day (YYYY-MM-DD); audited as PUBLISH_PROJECT.',
      inputSchema: z.object({ id: UUID, publishedOn: DAY }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ id, publishedOn }, ctx) =>
      answer(deps, ctx, 'nfnn_publish_project', async ({ apiToken }) =>
        text(
          await backend.post(`/api/admin/content/projects/${id}/publish`, apiToken, {
            publishedOn,
          }),
        ),
      ),
  );

  server.registerTool(
    'nfnn_unpublish_project',
    {
      title: 'Stáhnout projekt z webu',
      description:
        'Takes a project off the site (it becomes a draft again); audited as UNPUBLISH_PROJECT.',
      inputSchema: z.object({ id: UUID }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ id }, ctx) =>
      answer(deps, ctx, 'nfnn_unpublish_project', async ({ apiToken }) =>
        text(await backend.post(`/api/admin/content/projects/${id}/unpublish`, apiToken)),
      ),
  );

  server.registerTool(
    'nfnn_change_settings',
    {
      title: 'Změnit nastavení webu',
      description:
        'Changes plain settings of the site (see nfnn_settings for the current values); an empty value returns a setting to its default. Every value is checked as at startup before anything is stored, a refused one comes back with its reason. A real change restarts the backend, so the site does not answer for about a minute; audited as CHANGE_SETTINGS. Secrets (SMTP password, Fio token, tunnel token) are changed only in the web administration.',
      inputSchema: z.object({
        changes: z
          .array(z.object({ name: PLAIN_SETTING, value: z.string().max(1000) }))
          .min(1)
          .max(13),
      }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ changes }, ctx) =>
      answer(deps, ctx, 'nfnn_change_settings', async ({ apiToken }) =>
        text(await backend.put('/api/admin/operations/settings', apiToken, { changes })),
      ),
  );

  server.registerTool(
    'nfnn_set_log_level',
    {
      title: 'Dočasně změnit úroveň logování',
      description:
        'Sets a logger (ROOT or a dotted package or class name, e.g. cz.novanadeje.app, io.github.bzumik1.fio, org.hibernate.SQL) to TRACE, DEBUG, INFO, WARN, ERROR or OFF for `minutes` (30 by default, at most 1440); the level goes back by itself when the time is up. Audited as CHANGE_LOG_LEVEL. Read the result with nfnn_log or nfnn_log_search.',
      inputSchema: z.object({
        logger: z.string().min(1).max(200),
        level: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF']),
        minutes: z.number().int().min(1).max(1440).optional(),
      }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ logger, level, minutes }, ctx) =>
      answer(deps, ctx, 'nfnn_set_log_level', async ({ apiToken }) =>
        text(
          await backend.put(
            `/api/admin/operations/loggers/${encodeURIComponent(logger)}`,
            apiToken,
            minutes === undefined ? { level } : { level, minutes },
          ),
        ),
      ),
  );

  server.registerTool(
    'nfnn_reset_log_level',
    {
      title: 'Vrátit úroveň logování',
      description:
        'Ends the temporary level of a logger now, so it goes back to what the configuration says; audited as RESET_LOG_LEVEL.',
      inputSchema: z.object({ logger: z.string().min(1).max(200) }),
      annotations: WRITING,
      scopeChallenge,
    },
    async ({ logger }, ctx) =>
      answer(deps, ctx, 'nfnn_reset_log_level', async ({ apiToken }) => {
        await backend.delete(
          `/api/admin/operations/loggers/${encodeURIComponent(logger)}`,
          apiToken,
        );
        return plain(`The logger ${logger} is back at its configured level.`);
      }),
  );
}
