import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPublicAddress, MAX_PHOTO_BYTES, PublicPhotoFetcher } from '../src/photos.js';

describe('Given the addresses a photo may come from', () => {
  it('when an address is public, then it is allowed, and private, loopback, link-local, shared and reserved ones are not', () => {
    expect(['1.1.1.1', '185.199.108.153', '2606:4700::6810:84e5'].map(isPublicAddress)).toEqual([
      true,
      true,
      true,
    ]);
    expect(
      [
        '127.0.0.1',
        '10.1.2.3',
        '172.17.0.2',
        '192.168.1.10',
        '169.254.169.254',
        '100.64.0.1',
        '0.0.0.0',
        '224.0.0.1',
        '::1',
        '::',
        'fd00::1',
        'fe80::1',
        '::ffff:127.0.0.1',
        '64:ff9b::a00:1',
        'localhost',
      ].map(isPublicAddress),
    ).toEqual(Array.from({ length: 15 }, () => false));
  });
});

describe('Given the photo fetcher of the connector with its defaults', () => {
  const fetcher = new PublicPhotoFetcher();

  it.each([
    ['http://photos.example/a.jpg', 'only https: addresses are fetched'],
    ['https://127.0.0.1/a.jpg', 'the address points into a private network'],
    ['https://[::1]/a.jpg', 'the address points into a private network'],
    ['https://192.168.1.10/a.jpg', 'the address points into a private network'],
    ['https://localhost/a.jpg', 'the address points into a private network'],
    [
      'https://user:secret@photos.example/a.jpg',
      'addresses with a user name or password are not fetched',
    ],
    ['not a url', 'the address is not a valid URL'],
  ])('when %s is asked, then it is refused before any download', async (url, reason) => {
    await expect(fetcher.fetch(url)).rejects.toThrow(reason);
  });
});

describe('Given a photo server the fetcher may reach', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    server = createServer((request, response) => {
      const path = request.url ?? '/';
      if (path === '/photo.jpg') {
        response.writeHead(200, { 'content-type': 'image/jpeg; charset=binary' });
        response.end('jpeg-bytes');
      } else if (path === '/moved') {
        response.writeHead(302, { location: '/photo.jpg' });
        response.end();
      } else if (path.startsWith('/loop')) {
        response.writeHead(301, { location: `/loop${path.length}` });
        response.end();
      } else if (path === '/page') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<html></html>');
      } else if (path === '/declared-large') {
        response.writeHead(200, {
          'content-type': 'image/png',
          'content-length': String(MAX_PHOTO_BYTES + 1),
        });
        response.end();
      } else if (path === '/streamed-large') {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.write(Buffer.alloc(MAX_PHOTO_BYTES));
        response.end(Buffer.alloc(1));
      } else if (path === '/slow') {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.write('x');
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    base =
      typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : '';
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const reachable = new PublicPhotoFetcher({
    isAllowed: () => true,
    schemes: ['http:'],
    timeoutMs: 1000,
  });

  it('when an image is served, after a redirect or a name lookup too, then its bytes and type come back', async () => {
    for (const url of [
      `${base}/photo.jpg`,
      `${base}/moved`,
      `${base.replace('127.0.0.1', 'localhost')}/photo.jpg`,
    ]) {
      const photo = await reachable.fetch(url);
      expect(photo.contentType).toBe('image/jpeg');
      expect(Buffer.from(photo.bytes).toString()).toBe('jpeg-bytes');
    }
  });

  it.each([
    ['/loop', 'the address redirects more than 3 times'],
    ['/page', 'the address serves text/html, not an image'],
    ['/missing', 'the address answered HTTP 404'],
    ['/declared-large', 'the image is larger than 10 MB'],
    ['/streamed-large', 'the image is larger than 10 MB'],
    ['/slow', 'the download of the image broke off'],
  ])('when %s is fetched, then it is refused', async (path, reason) => {
    await expect(reachable.fetch(base + path)).rejects.toThrow(reason);
  });

  it('when the server resolves to an address that is not allowed, then the connection is never made', async () => {
    const guarded = new PublicPhotoFetcher({ schemes: ['http:'] });
    await expect(
      guarded.fetch(base.replace('127.0.0.1', 'localhost') + '/photo.jpg'),
    ).rejects.toThrow('the address points into a private network');
  });
});
