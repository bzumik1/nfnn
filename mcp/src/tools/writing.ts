import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { MAX_PHOTO_BYTES, PhotoRefused } from '../photos.js';
import { PHOTO_UPLOAD_HEADER, PHOTO_UPLOAD_PATH } from '../photo-upload.js';
import {
  answerChange,
  asRecord,
  plain,
  text,
  ToolRefusal,
  withHint,
  type ToolDependencies,
} from './support.js';

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
const SLUG = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .optional()
  .describe('Address of the page; made from the title when left out.');
const ARTICLE = {
  title: z.string().min(1).max(120),
  slug: SLUG,
  tag: z.string().max(40).optional(),
  perex: z.string().min(1).max(300).describe('Short summary shown on the cards.'),
  body: z.string().min(1).max(20000).describe('Plain text; an empty line starts a new paragraph.'),
  coverImageId: UUID.optional().describe(
    'Id of an uploaded photo (nfnn_upload_photo, nfnn_photo_upload_link, or the photo a content item already has); left out means no photo.',
  ),
};
const PROJECT = { ...ARTICLE, year: z.number().int().min(2005).max(2100) };
const ACCOUNT_LINK = z.object({
  donorId: UUID,
  linkId: UUID.describe("Id of the account link from the donor's card (nfnn_donor)."),
});

export function registerWritingTools(server: McpServer, deps: ToolDependencies): void {
  const { backend } = deps;

  server.registerTool(
    'nfnn_pair_payment',
    {
      title: 'Spárovat platbu',
      description:
        "Pairs an unpaired bank payment with a donor by hand (audited as PAIR_PAYMENT); the donation then counts in the donor's overview and receipts.",
      inputSchema: z.object({ paymentId: UUID, donorId: UUID }),
      annotations: WRITING,
    },
    async ({ paymentId, donorId }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_pair_payment',
        async ({ apiToken }) =>
          text(
            await backend.post(`/api/admin/donations/payments/${paymentId}/pair`, apiToken, {
              donorId,
            }),
          ),
        `payment ${paymentId}, donor ${donorId}`,
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
    },
    async ({ paymentId }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_unpair_payment',
        async ({ apiToken }) =>
          text(await backend.post(`/api/admin/donations/payments/${paymentId}/unpair`, apiToken)),
        `payment ${paymentId}`,
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
    },
    async ({ month }, ctx) =>
      answerChange(deps, ctx, 'nfnn_send_report', async ({ apiToken }) =>
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
    },
    async ({ kind }, ctx) =>
      answerChange(deps, ctx, 'nfnn_request_backup', async ({ apiToken }) =>
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
    },
    async ({ id, publishedOn }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_publish_news',
        async ({ apiToken }) =>
          text(
            await backend.post(`/api/admin/content/news/${id}/publish`, apiToken, { publishedOn }),
          ),
        `news ${id}`,
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
    },
    async ({ id }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_unpublish_news',
        async ({ apiToken }) =>
          text(await backend.post(`/api/admin/content/news/${id}/unpublish`, apiToken)),
        `news ${id}`,
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
    },
    async ({ id, publishedOn }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_publish_project',
        async ({ apiToken }) =>
          text(
            await backend.post(`/api/admin/content/projects/${id}/publish`, apiToken, {
              publishedOn,
            }),
          ),
        `project ${id}`,
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
    },
    async ({ id }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_unpublish_project',
        async ({ apiToken }) =>
          text(await backend.post(`/api/admin/content/projects/${id}/unpublish`, apiToken)),
        `project ${id}`,
      ),
  );

  server.registerTool(
    'nfnn_change_settings',
    {
      title: 'Změnit nastavení webu',
      description:
        'Changes plain settings of the site (see nfnn_settings for the current values); an empty value returns a setting to its default. Every value is checked as at startup before anything is stored, a refused one comes back with its reason. A real change restarts the backend, so the site does not answer for about a minute; audited as CHANGE_SETTINGS. Secrets (SMTP password, Fio token) and the address of the site are changed only in the web administration; moving the mail server, port, user or STARTTLS needs the SMTP password again, so it is done there too.',
      inputSchema: z.object({
        changes: z
          .array(z.object({ name: PLAIN_SETTING, value: z.string().max(1000) }))
          .min(1)
          .max(12),
      }),
      annotations: WRITING,
    },
    async ({ changes }, ctx) =>
      answerChange(deps, ctx, 'nfnn_change_settings', async ({ apiToken }) =>
        text(await backend.put('/api/admin/operations/settings', apiToken, { changes })),
      ),
  );

  server.registerTool(
    'nfnn_update_report_settings',
    {
      title: 'Nastavit měsíční přehled',
      description:
        'Replaces the monthly report settings: the recipients (1–10 addresses), the day of the month (1–28) and the hour in Prague time (0–23, default 7) it goes out, and its sections. Read the current ones with nfnn_report first and send all of them. Audited as CHANGE_REPORT_SETTINGS.',
      inputSchema: z.object({
        recipients: z.array(z.string().min(1).max(254)).min(1).max(10),
        sendDay: z.number().int().min(1).max(28),
        sendHour: z.number().int().min(0).max(23),
        sections: z.object({
          donors: z.boolean(),
          donations: z.boolean(),
          unpairedPayments: z.boolean(),
          bankImport: z.boolean(),
        }),
      }),
      annotations: { ...WRITING, idempotentHint: true },
    },
    async (settings, ctx) =>
      answerChange(deps, ctx, 'nfnn_update_report_settings', async ({ apiToken }) =>
        text(await backend.put('/api/admin/donations/report/settings', apiToken, settings)),
      ),
  );

  server.registerTool(
    'nfnn_create_news',
    {
      title: 'Napsat aktualitu',
      description:
        'Creates a news article as a draft (not on the site until nfnn_publish_news); audited as CREATE_NEWS. Texts are Czech, sentence case.',
      inputSchema: z.object(ARTICLE),
      annotations: WRITING,
    },
    async (article, ctx) =>
      answerChange(deps, ctx, 'nfnn_create_news', async ({ apiToken }) =>
        text(await backend.post('/api/admin/content/news', apiToken, article)),
      ),
  );

  server.registerTool(
    'nfnn_update_news',
    {
      title: 'Upravit aktualitu',
      description:
        'Replaces the texts and the photo of a news article, draft or published (the published date stays); send every field, read them with nfnn_news_article first. Audited as UPDATE_NEWS.',
      inputSchema: z.object({ id: UUID, ...ARTICLE }),
      annotations: { ...WRITING, idempotentHint: true },
    },
    async ({ id, ...article }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_update_news',
        async ({ apiToken }) =>
          text(await backend.put(`/api/admin/content/news/${id}`, apiToken, article)),
        `news ${id}`,
      ),
  );

  server.registerTool(
    'nfnn_create_project',
    {
      title: 'Založit projekt',
      description:
        'Creates a project of the given year as a draft (not on the site until nfnn_publish_project); audited as CREATE_PROJECT.',
      inputSchema: z.object(PROJECT),
      annotations: WRITING,
    },
    async (project, ctx) =>
      answerChange(deps, ctx, 'nfnn_create_project', async ({ apiToken }) =>
        text(await backend.post('/api/admin/content/projects', apiToken, project)),
      ),
  );

  server.registerTool(
    'nfnn_update_project',
    {
      title: 'Upravit projekt',
      description:
        'Replaces the texts, the year and the photo of a project (the published date stays); send every field, read them with nfnn_project first. Audited as UPDATE_PROJECT.',
      inputSchema: z.object({ id: UUID, ...PROJECT }),
      annotations: { ...WRITING, idempotentHint: true },
    },
    async ({ id, ...project }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_update_project',
        async ({ apiToken }) =>
          text(await backend.put(`/api/admin/content/projects/${id}`, apiToken, project)),
        `project ${id}`,
      ),
  );

  server.registerTool(
    'nfnn_disconnect_bank_account',
    {
      title: 'Vypnout párování z účtu dárce',
      description:
        'Stops pairing later payments without a symbol from one of the donor\'s bank accounts to the donor, as the donor\'s own "Vypnout párování" does; donations paired before stay. Audited as DISCONNECT_SENDER_ACCOUNT; nfnn_reconnect_bank_account turns it on again.',
      inputSchema: ACCOUNT_LINK,
      annotations: { ...WRITING, idempotentHint: true },
    },
    async ({ donorId, linkId }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_disconnect_bank_account',
        async ({ apiToken }) => {
          await backend.post(
            `/api/admin/donations/donors/${donorId}/bank-accounts/${linkId}/disconnect`,
            apiToken,
          );
          return plain('Pairing from the account is turned off for the donor.');
        },
        `donor ${donorId}, link ${linkId}`,
      ),
  );

  server.registerTool(
    'nfnn_reconnect_bank_account',
    {
      title: 'Zapnout párování z účtu dárce',
      description:
        "Turns the pairing from one of the donor's bank accounts on again; it starts once a payment with the donor's symbol arrives from the account. Audited as RECONNECT_SENDER_ACCOUNT.",
      inputSchema: ACCOUNT_LINK,
      annotations: { ...WRITING, idempotentHint: true },
    },
    async ({ donorId, linkId }, ctx) =>
      answerChange(
        deps,
        ctx,
        'nfnn_reconnect_bank_account',
        async ({ apiToken }) => {
          await backend.post(
            `/api/admin/donations/donors/${donorId}/bank-accounts/${linkId}/reconnect`,
            apiToken,
          );
          return plain(
            "Pairing from the account is on again; it starts with the next payment carrying the donor's symbol.",
          );
        },
        `donor ${donorId}, link ${linkId}`,
      ),
  );

  server.registerTool(
    'nfnn_upload_photo',
    {
      title: 'Nahrát fotku z adresy',
      description: `Downloads a photo from a public https address (the image file itself: JPEG, PNG, WebP or GIF, at most ${MAX_PHOTO_BYTES / 1024 / 1024} MB, 3 redirects, 15 s) and uploads it to the site as the web does: turned upright, converted to WebP in sizes for every screen. Answers the photo id for coverImageId of nfnn_create_news, nfnn_update_news, nfnn_create_project or nfnn_update_project; the photo shows nowhere until one of them uses it. Addresses in private networks are refused. For a file on this computer use nfnn_photo_upload_link.`,
      inputSchema: z.object({ url: z.string().min(1).max(2000) }),
      annotations: { ...WRITING, openWorldHint: true },
    },
    async ({ url }, ctx) =>
      answerChange(deps, ctx, 'nfnn_upload_photo', async ({ apiToken }) => {
        const photo = await deps.photos.fetch(url).catch((thrown: unknown) => {
          throw thrown instanceof PhotoRefused
            ? new ToolRefusal('photo-refused', `The photo was not uploaded: ${thrown.message}.`)
            : thrown;
        });
        return uploaded(await backend.postPhoto('/api/admin/content/media', apiToken, photo));
      }),
  );

  server.registerTool(
    'nfnn_photo_upload_link',
    {
      title: 'Odkaz pro nahrání fotky',
      description: `A one-time address to upload a photo file from a computer, e.g. from a shell with curl: PUT the file there with the ticket header and the image's Content-Type (at most ${MAX_PHOTO_BYTES / 1024 / 1024} MB). The ticket works once, for at most 10 minutes; the answer of the PUT is the photo id (and its size) for coverImageId, as nfnn_upload_photo answers it.`,
      annotations: WRITING,
    },
    async (ctx) =>
      answerChange(deps, ctx, 'nfnn_photo_upload_link', async (caller) => {
        const site = deps.publicUrl();
        if (site === undefined) {
          throw new ToolRefusal(
            'no-public-url',
            'The address of the site is not known yet; try again in a moment.',
          );
        }
        const { ticket, expiresAt } = deps.tickets.issue(caller);
        const url = `${site}${PHOTO_UPLOAD_PATH}`;
        return text({
          method: 'PUT',
          url,
          headers: {
            [PHOTO_UPLOAD_HEADER]: ticket,
            'Content-Type': 'image/jpeg, image/png, image/webp or image/gif',
          },
          expiresAt: expiresAt.toISOString(),
          maxBytes: MAX_PHOTO_BYTES,
          example: `curl -sS -T photo.jpg -H '${PHOTO_UPLOAD_HEADER}: ${ticket}' -H 'Content-Type: image/jpeg' ${url}`,
        });
      }),
  );

  server.registerTool(
    'nfnn_set_log_level',
    {
      title: 'Dočasně změnit úroveň logování',
      description:
        'Sets a logger (ROOT or a dotted package or class name, e.g. cz.novanadeje.app, io.github.bzumik1.fio, org.hibernate.SQL) to TRACE, DEBUG, INFO, WARN, ERROR or OFF for `minutes` (30 by default, at most 1440); the level goes back by itself when the time is up. Loggers that would write SQL values, bodies or raw requests (org.hibernate.orm.jdbc.bind, org.apache.coyote, org.postgresql and the like) keep their level and are refused, and TRACE is refused for every logger outside cz.novanadeje.app (use DEBUG there). Audited as CHANGE_LOG_LEVEL. Read the result with nfnn_log or nfnn_log_search.',
      inputSchema: z.object({
        logger: z.string().min(1).max(200),
        level: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF']),
        minutes: z.number().int().min(1).max(1440).optional(),
      }),
      annotations: WRITING,
    },
    async ({ logger, level, minutes }, ctx) =>
      answerChange(deps, ctx, 'nfnn_set_log_level', async ({ apiToken }) =>
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
    },
    async ({ logger }, ctx) =>
      answerChange(deps, ctx, 'nfnn_reset_log_level', async ({ apiToken }) => {
        await backend.delete(
          `/api/admin/operations/loggers/${encodeURIComponent(logger)}`,
          apiToken,
        );
        return plain(`The logger ${logger} is back at its configured level.`);
      }),
  );
}

function uploaded(image: unknown): ReturnType<typeof text> {
  const id = asRecord(image)['id'];
  return withHint(
    text(image),
    typeof id === 'string'
      ? `Use coverImageId "${id}" to put the photo on a news article or project.`
      : undefined,
  );
}
