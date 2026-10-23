import type { CallToolResult, ServerContext } from '@modelcontextprotocol/server';
import { BackendClient, BackendProblem } from '../backend.js';
import { asText } from '../format.js';
import { LogFileNotFound, LogReader, LogsUnavailable } from '../logs.js';
import type { Logger } from '../token-exchange.js';

export interface ToolDependencies {
  readonly backend: BackendClient;
  readonly logs: LogReader;
  readonly logger: Logger;
}

export const WRITE_SCOPE = 'admin:write';

export interface Caller {
  readonly apiToken: string;
  readonly donorId: string;
}

export function callerOf(ctx: ServerContext): Caller {
  const extra = ctx.http?.authInfo?.extra;
  const apiToken = extra?.['apiToken'];
  const donorId = extra?.['donorId'];
  if (typeof apiToken !== 'string' || typeof donorId !== 'string') {
    throw new Error('the request carries no exchanged API token');
  }
  return { apiToken, donorId };
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
): Promise<CallToolResult> {
  const caller = callerOf(ctx);
  try {
    const result = await run(caller);
    deps.logger.info(`Tool ${tool} answered donor ${caller.donorId}`);
    return result;
  } catch (thrown: unknown) {
    if (thrown instanceof BackendProblem) {
      deps.logger.info(
        `Tool ${tool} refused for donor ${caller.donorId}: ${thrown.problem.status} ${thrown.problem.type}`,
      );
      return failure(describeProblem(thrown));
    }
    if (thrown instanceof LogsUnavailable || thrown instanceof LogFileNotFound) {
      return failure(thrown.message);
    }
    deps.logger.warn(
      `Tool ${tool} failed for donor ${caller.donorId}: ${thrown instanceof Error ? thrown.constructor.name : 'unknown'}`,
    );
    return failure('The administration could not be reached. Try again in a moment.');
  }
}

function describeProblem(problem: BackendProblem): string {
  const { status, type, title, detail } = problem.problem;
  const hint =
    status === 403
      ? ' The connection lacks the permission for this action; connect the application again with the "admin:write" permission, or sign in as an administrator with the second factor.'
      : status === 429
        ? ' Too many requests from this address; wait a moment.'
        : '';
  const sentence = `The administration refused the request (${status} ${type}): ${title}${detail ? ` – ${detail}` : ''}`;
  return `${sentence.endsWith('.') ? sentence : `${sentence}.`}${hint}`;
}
