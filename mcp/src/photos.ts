import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const PHOTO_TYPE = /^(?:image\/[a-z0-9.+-]+|application\/octet-stream)$/;

export interface Photo {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface PhotoSource {
  fetch(url: string): Promise<Photo>;
}

export class PhotoRefused extends Error {}

const NOT_PUBLIC_V4 = new BlockList();
const NOT_PUBLIC_V6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NOT_PUBLIC_V4.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NOT_PUBLIC_V6.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return family === 4
    ? !NOT_PUBLIC_V4.check(address, 'ipv4')
    : !NOT_PUBLIC_V6.check(address, 'ipv6');
}

export interface PublicPhotoFetcherOptions {
  readonly isAllowed?: (address: string) => boolean;
  readonly schemes?: readonly string[];
  readonly timeoutMs?: number;
}

export class PublicPhotoFetcher implements PhotoSource {
  private readonly isAllowed: (address: string) => boolean;
  private readonly schemes: readonly string[];
  private readonly timeoutMs: number;

  constructor(options: PublicPhotoFetcherOptions = {}) {
    this.isAllowed = options.isAllowed ?? isPublicAddress;
    this.schemes = options.schemes ?? ['https:'];
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  async fetch(url: string): Promise<Photo> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    let current = parse(url);
    for (let redirects = 0; ; redirects++) {
      this.check(current);
      const response = await this.get(current, signal);
      const location = response.headers.location;
      if (REDIRECTS.has(response.statusCode ?? 0) && location) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) {
          throw new PhotoRefused(`the address redirects more than ${MAX_REDIRECTS} times`);
        }
        current = parse(location, current);
        continue;
      }
      if (response.statusCode !== 200) {
        response.resume();
        throw new PhotoRefused(
          `the address answered HTTP ${response.statusCode ?? 'without a status'}`,
        );
      }
      const contentType =
        (response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!PHOTO_TYPE.test(contentType)) {
        response.resume();
        throw new PhotoRefused(
          `the address serves ${contentType || 'no content type'}, not an image; give the address of the image file itself`,
        );
      }
      return { bytes: await readAtMost(response, MAX_PHOTO_BYTES), contentType };
    }
  }

  private check(url: URL): void {
    if (!this.schemes.includes(url.protocol)) {
      throw new PhotoRefused(`only ${this.schemes.join(' and ')} addresses are fetched`);
    }
    if (url.username || url.password) {
      throw new PhotoRefused('addresses with a user name or password are not fetched');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) !== 0 && !this.isAllowed(host)) {
      throw new PhotoRefused('the address points into a private network');
    }
  }

  private get(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const request = send(
        url,
        {
          method: 'GET',
          headers: { accept: 'image/*', 'user-agent': 'nfnn-mcp' },
          agent: false,
          lookup: guardedLookup(this.isAllowed),
          signal,
        },
        resolve,
      );
      request.on('error', (error) =>
        reject(
          error instanceof PhotoRefused
            ? error
            : signal.aborted
              ? new PhotoRefused(`the address did not answer within ${this.timeoutMs / 1000} s`)
              : new PhotoRefused(`the address could not be reached (${error.message})`),
        ),
      );
      request.end();
    });
  }
}

function parse(url: string, base?: URL): URL {
  try {
    return new URL(url, base);
  } catch {
    throw new PhotoRefused('the address is not a valid URL');
  }
}

function guardedLookup(isAllowed: (address: string) => boolean): LookupFunction {
  return ((hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error) {
        callback(error, '', 0);
        return;
      }
      if (addresses.length === 0 || addresses.some((entry) => !isAllowed(entry.address))) {
        callback(new PhotoRefused('the address points into a private network'), '', 0);
        return;
      }
      if (options.all) {
        callback(null, addresses);
      } else {
        const [first] = addresses as [LookupAddress];
        callback(null, first.address, first.family);
      }
    });
  }) as LookupFunction;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

async function readAtMost(response: IncomingMessage, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    response.destroy();
    throw new PhotoRefused(tooLarge(limit));
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      size += buffer.length;
      if (size > limit) {
        response.destroy();
        throw new PhotoRefused(tooLarge(limit));
      }
      chunks.push(buffer);
    }
  } catch (error: unknown) {
    if (error instanceof PhotoRefused) {
      throw error;
    }
    throw new PhotoRefused('the download of the image broke off');
  }
  if (size === 0) {
    throw new PhotoRefused('the address served an empty file');
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function tooLarge(limit: number): string {
  return `the image is larger than ${limit / 1024 / 1024} MB`;
}
