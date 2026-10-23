import { requireScopes, type McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { answer, text, WRITE_SCOPE, type ToolDependencies } from './support.js';

const WRITING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MONTH = z.string().regex(/^\d{4}-\d{2}$/);

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
}
