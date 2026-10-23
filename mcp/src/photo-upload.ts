import { BackendClient, BackendProblem } from './backend.js';
import { asText } from './format.js';
import { MAX_PHOTO_BYTES } from './photos.js';
import { describeProblem } from './tools/support.js';
import type { Logger } from './token-exchange.js';
import type { UploadTickets } from './upload-tickets.js';

export const PHOTO_UPLOAD_PATH = '/mcp-photos';
export const PHOTO_UPLOAD_HEADER = 'X-Upload-Ticket';
const PHOTO_TYPE = /^image\/[a-z0-9.+-]+$/;

export interface PhotoUploadDependencies {
  readonly backend: BackendClient;
  readonly logger: Logger;
  readonly tickets: UploadTickets;
}

export async function receivePhoto(
  request: Request,
  deps: PhotoUploadDependencies,
): Promise<Response> {
  if (request.method !== 'PUT') {
    return refusal(405, 'Upload the photo with PUT.', { allow: 'PUT' });
  }
  const holder = deps.tickets.redeem(request.headers.get(PHOTO_UPLOAD_HEADER) ?? '');
  if (holder === undefined) {
    deps.logger.info('Photo upload refused: unknown, used or expired ticket');
    return refusal(
      401,
      'The upload ticket is unknown, used or expired; ask nfnn_photo_upload_link for a new one.',
    );
  }
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  if (!PHOTO_TYPE.test(contentType.toLowerCase())) {
    deps.logger.info(`Photo upload refused for donor ${holder.donorId}: content type`);
    return refusal(415, 'Send the photo with its image Content-Type, e.g. image/jpeg.');
  }
  const bytes = await readAtMost(request, MAX_PHOTO_BYTES);
  if (bytes === undefined) {
    deps.logger.info(`Photo upload refused for donor ${holder.donorId}: too large`);
    return refusal(413, `The photo is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`);
  }
  try {
    const image = await deps.backend.postPhoto('/api/admin/content/media', holder.apiToken, {
      bytes,
      contentType: contentType.toLowerCase(),
    });
    const id = typeof image === 'object' && image !== null ? (image as { id?: unknown }).id : '';
    deps.logger.info(`Photo upload answered donor ${holder.donorId} about media ${String(id)}`);
    return new Response(asText(image), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (thrown: unknown) {
    if (thrown instanceof BackendProblem) {
      deps.logger.info(
        `Photo upload refused for donor ${holder.donorId}: ${thrown.problem.status} ${thrown.problem.type}`,
      );
      return refusal(thrown.problem.status, describeProblem(thrown));
    }
    deps.logger.warn(
      `Photo upload failed for donor ${holder.donorId}: ${thrown instanceof Error ? thrown.constructor.name : 'unknown'}`,
    );
    return refusal(502, 'The administration could not be reached. Try again with a new link.');
  }
}

async function readAtMost(request: Request, limit: number): Promise<Uint8Array | undefined> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    return undefined;
  }
  if (request.body === null) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request.body) {
    size += chunk.byteLength;
    if (size > limit) {
      return undefined;
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function refusal(status: number, error: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
