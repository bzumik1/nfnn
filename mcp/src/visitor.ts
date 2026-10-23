import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';

const visitor = new AsyncLocalStorage<string>();

export function forVisitor<T>(request: Request, work: () => Promise<T>): Promise<T> {
  const address = (request.headers.get('x-real-ip') ?? '').trim();
  return isIP(address) ? visitor.run(address, work) : visitor.exit(work);
}

export function visitorHeaders(): Record<string, string> {
  const address = visitor.getStore();
  return address ? { 'x-forwarded-for': address } : {};
}
