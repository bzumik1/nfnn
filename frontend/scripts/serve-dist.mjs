import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { APP_ROUTES_FILE, appRouteMatcher } from './app-routes.mjs';
import { readSecurityHeaders } from './security-headers.mjs';

const [folder, portArgument = '4200'] = process.argv.slice(2);
if (!folder) {
  console.error('Usage: node scripts/serve-dist.mjs <dist/.../browser> [port]');
  process.exit(2);
}
const root = resolve(folder);
const appShell = join(root, 'index.html');
if (!existsSync(appShell)) {
  console.error(`${appShell} is missing: build the app first (npm run build)`);
  process.exit(1);
}

const securityHeaders = readSecurityHeaders();
const isAppRoute = appRouteMatcher(readFileSync(APP_ROUTES_FILE, 'utf8'));
const verificationPage = /^\/overit\/?$/;

const fileOnly =
  /\.(?:js|mjs|css|map|json|webmanifest|txt|xml|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|pdf)$/i;
const contentTypes = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.mjs': 'application/javascript; charset=utf-8',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'text/xml; charset=utf-8',
};

function existingFile(path) {
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

function fileFor(pathname) {
  const candidate = resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }
  const found = existingFile(candidate);
  if (found || fileOnly.test(pathname) || /^\/(?:media|images)\//.test(pathname)) {
    return found && { file: found, status: 200 };
  }
  const known = isAppRoute(pathname) || verificationPage.test(pathname);
  return { file: appShell, status: known ? 200 : 404 };
}

createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const served = fileFor(pathname);
  if (!served) {
    response
      .writeHead(404, {
        ...securityHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      .end('<h1>404 Not Found</h1>');
    return;
  }
  const { file, status } = served;
  response.writeHead(status, {
    ...securityHeaders,
    'Content-Type': contentTypes[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    ...(verificationPage.test(pathname) ? { 'X-Robots-Tag': 'noindex' } : {}),
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}).listen(Number(portArgument), '127.0.0.1', () => {
  console.log(`Serving ${root} on http://localhost:${portArgument}`);
});
