import type { CallToolResult, ServerContext } from '@modelcontextprotocol/server';
import { BackendClient, BackendProblem } from '../backend.js';
import { asText } from '../format.js';
import type { PhotoSource } from '../photos.js';
import type { Logger } from '../token-exchange.js';
import type { UploadTickets } from '../upload-tickets.js';

export interface ToolDependencies {
  readonly backend: BackendClient;
  readonly logger: Logger;
  readonly photos: PhotoSource;
  readonly tickets: UploadTickets;
  readonly publicUrl: () => string | undefined;
}

export const WRITE_SCOPE = 'admin:write';

export interface Caller {
  readonly apiToken: string;
  readonly donorId: string;
  readonly scopes: readonly string[];
  readonly expiresAt: number;
}

export function callerOf(ctx: ServerContext): Caller {
  const extra = ctx.http?.authInfo?.extra;
  const apiToken = extra?.['apiToken'];
  const donorId = extra?.['donorId'];
  if (typeof apiToken !== 'string' || typeof donorId !== 'string') {
    throw new Error('the request carries no exchanged API token');
  }
  return {
    apiToken,
    donorId,
    scopes: ctx.http?.authInfo?.scopes ?? [],
    expiresAt: ctx.http?.authInfo?.expiresAt ?? 0,
  };
}

export function text(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: asText(value) }] };
}

export function plain(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

export function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export async function answer(
  deps: ToolDependencies,
  ctx: ServerContext,
  tool: string,
  run: (caller: Caller) => Promise<CallToolResult>,
  about?: string,
): Promise<CallToolResult> {
  const caller = callerOf(ctx);
  const subject = about === undefined ? '' : ` about ${about}`;
  try {
    const result = await run(caller);
    deps.logger.info(`Tool ${tool} answered donor ${caller.donorId}${subject}`);
    return result;
  } catch (thrown: unknown) {
    if (thrown instanceof BackendProblem) {
      deps.logger.info(
        `Tool ${tool} refused for donor ${caller.donorId}${subject}: ${thrown.problem.status} ${thrown.problem.type}`,
      );
      return failure(describeProblem(thrown));
    }
    if (thrown instanceof ToolRefusal) {
      deps.logger.info(
        `Tool ${tool} refused for donor ${caller.donorId}${subject}: ${thrown.code}`,
      );
      return failure(thrown.message);
    }
    deps.logger.warn(
      `Tool ${tool} failed for donor ${caller.donorId}${subject}: ${thrown instanceof Error ? thrown.constructor.name : 'unknown'}`,
    );
    return failure('The administration could not be reached. Try again in a moment.');
  }
}

export async function answerChange(
  deps: ToolDependencies,
  ctx: ServerContext,
  tool: string,
  run: (caller: Caller) => Promise<CallToolResult>,
  about?: string,
): Promise<CallToolResult> {
  const caller = callerOf(ctx);
  if (!caller.scopes.includes(WRITE_SCOPE)) {
    deps.logger.info(
      `Tool ${tool} refused for donor ${caller.donorId}: the connection may only read`,
    );
    return failure(
      'This connection may only read, so nothing was changed. To let Claude make changes, disconnect the NFNN connector in claude.ai (Settings → Connectors) and connect it again with „Změny“ ticked on the consent page of the site.',
    );
  }
  return answer(deps, ctx, tool, run, about);
}

export class ToolRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function withHint(result: CallToolResult, hint: string | undefined): CallToolResult {
  if (hint !== undefined) {
    result.content.push({ type: 'text', text: hint });
  }
  return result;
}

export function receiptView(answer: unknown): Record<string, unknown> {
  const issued = asRecord(answer);
  const { texts: _texts, ...receipt } = asRecord(issued['receipt']);
  return { ...issued, receipt, verificationLink: asRecord(receipt['verification'])['qrText'] };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

const IN_BROWSER_ONLY = '-in-browser-only';

export function describeProblem(problem: BackendProblem): string {
  const { status, type, title, detail, errors } = problem.problem;
  const hint =
    status === 403 && type.endsWith(IN_BROWSER_ONLY)
      ? ' This is done only on the web at /sprava, by an administrator signed in there.'
      : status === 403
        ? ' The connection lacks the permission for this action; connect the application again with the "admin:write" permission, or sign in as an administrator with the second factor.'
        : status === 429
          ? ' Too many requests from this address; wait a moment.'
          : '';
  const sentence = `The administration refused the request (${status} ${type}): ${title}${detail ? ` – ${detail}` : ''}`;
  const fields = errors.length > 0 ? ` ${errors.join(' ')}` : '';
  return `${sentence.endsWith('.') ? sentence : `${sentence}.`}${fields}${hint}`;
}
