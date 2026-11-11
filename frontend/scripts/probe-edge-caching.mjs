const [baseUrl] = process.argv.slice(2);
if (!baseUrl) {
  console.error('usage: node scripts/probe-edge-caching.mjs <base-url>');
  process.exit(2);
}

const EDGE_HEADER = 'cloudflare-cdn-cache-control';
const PROBE_ADDRESS = '198.51.100.29';
const SIGN_IN_ATTEMPTS = 12;
const OWN_CACHE_CONTROL = new Map([
  ['/api/donations/payment-details', 'private, max-age=300'],
  ['/api/donations/receipt-keys', 'public, max-age=3600'],
  ['/api/donations/bank-logos', 'private, max-age=300'],
]);
const NOT_THERE_YET = [401, 404];
const UNKNOWN_IMAGE = 'e'.repeat(64);
const RECEIPT_IMAGES = [
  { path: `/api/donations/me/receipt-images/${UNKNOWN_IMAGE}`, signedInStatus: 404 },
  { path: `/api/admin/donations/receipt-images/${UNKNOWN_IMAGE}`, signedInStatus: 403 },
];
const ACCESS_TOKEN = process.env.PROBE_ACCESS_TOKEN ?? '';
const API_ANSWERS = [
  { status: 200, method: 'GET', path: '/api/operations/setup' },
  { status: 200, method: 'GET', path: '/api/content/home' },
  { status: 401, method: 'GET', path: '/api/donors/me' },
  { status: 404, method: 'GET', path: '/api/content/news/probe-neexistuje' },
  {
    status: 404,
    method: 'GET',
    path: '/api/donations/bank-logos/images/0192f4d2-1a6b-7c3d-9e8f-001122334455',
  },
  ...RECEIPT_IMAGES.map(({ path }) => ({ status: 401, method: 'GET', path })),
  { status: 401, method: 'GET', path: '/api/live' },
];
const LIVE_PATH = '/api/live';
const LIVE_HEARTBEAT_WITHIN_MS = 35_000;
const EDGE_ONLY = [
  { method: 'POST', path: '/mcp' },
  { method: 'POST', path: '/mcp-photos' },
  { method: 'GET', path: '/.well-known/oauth-authorization-server' },
  { method: 'GET', path: '/.well-known/oauth-protected-resource/mcp' },
];
const STATUS_PATH = '/api/donations/receipts/status';
const STATUS_BODY_LIMIT = 1024;
const API_BODY_LIMIT = 1024 * 1024;
const UPLOAD_PATH = '/api/admin/content/media';
const APP_SHELL = ['/', '/overit'];
const NOT_INDEXED = ['/overit', '/overit/'];
const CLIENT_ERRORS = '/api/operations/client-errors';
const CLIENT_ERROR_BODY_LIMIT = 4096;
const CLIENT_ERROR_REPORT = {
  kind: 'unexpected',
  place: 'global',
  name: 'Error',
  appVersion: 'dev',
  browser: 'other',
  os: 'other',
  display: 'browser',
  count: 1,
};

const failures = [];
const fail = (message) => failures.push(message);

async function probeLiveStream() {
  const label = `GET ${LIVE_PATH} with a donor's token`;
  if (ACCESS_TOKEN === '') {
    fail(`${label} is not probed: set PROBE_ACCESS_TOKEN to a donor's access token`);
    return;
  }
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), LIVE_HEARTBEAT_WITHIN_MS);
  const seenParts = [];
  try {
    const response = await fetch(new URL(LIVE_PATH, baseUrl), {
      headers: {
        'X-Forwarded-For': PROBE_ADDRESS,
        Accept: 'text/event-stream',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      signal: abort.signal,
    });
    const answer = {
      status: response.status,
      cacheControl: response.headers.get('cache-control') ?? '',
      edge: response.headers.get(EDGE_HEADER) ?? '',
    };
    expectApiNoStore(label, answer);
    if (response.status !== 200) {
      fail(`${label} answered ${response.status}, expected 200`);
      return;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('text/event-stream')) {
      fail(`${label} answered Content-Type "${contentType}", expected text/event-stream`);
    }
    const buffering = response.headers.get('x-accel-buffering') ?? '';
    if (buffering !== 'no') {
      fail(
        `${label} answered X-Accel-Buffering "${buffering}", expected "no", so a proxy in front passes the stream on unbuffered`,
      );
    }
    if (response.headers.get('content-encoding')) {
      fail(`${label} is compressed, so a proxy could hold its events back`);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    while (!(seenParts.includes('revision') && seenParts.includes('heartbeat'))) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text += value;
      if (!seenParts.includes('revision') && /^event:revision$/m.test(text)) {
        seenParts.push('revision');
      }
      if (!seenParts.includes('heartbeat') && /^:/m.test(text)) {
        seenParts.push('heartbeat');
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      fail(`${label} failed: ${error.message}`);
      return;
    }
  } finally {
    clearTimeout(deadline);
    abort.abort();
  }
  for (const part of ['revision', 'heartbeat']) {
    if (!seenParts.includes(part)) {
      fail(
        `${label} brought no ${part} through nginx within ${LIVE_HEARTBEAT_WITHIN_MS / 1000} s, so the stream is buffered or broken`,
      );
    }
  }
}

const liveStream = probeLiveStream();

async function request({ method, path, headers = {}, body }) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { 'X-Forwarded-For': PROBE_ADDRESS, ...headers },
    body,
    redirect: 'manual',
  });
  const text = await response.text();
  return {
    status: response.status,
    cacheControl: response.headers.get('cache-control') ?? '',
    edge: response.headers.get(EDGE_HEADER) ?? '',
    setCookie: response.headers.get('set-cookie') ?? '',
    robots: response.headers.get('x-robots-tag') ?? '',
    etag: response.headers.get('etag') ?? '',
    text,
  };
}

function expectEdgeNoStore(label, answer) {
  if (answer.edge !== 'no-store') {
    fail(
      `${label} answered ${answer.status} with Cloudflare-CDN-Cache-Control "${answer.edge}", expected "no-store"`,
    );
  }
}

function expectApiNoStore(label, answer) {
  expectEdgeNoStore(label, answer);
  if (!answer.cacheControl.split(',').some((part) => part.trim() === 'no-store')) {
    fail(
      `${label} answered ${answer.status} with Cache-Control "${answer.cacheControl}", expected no-store`,
    );
  }
}

const seen = new Set();
for (const probe of API_ANSWERS) {
  const label = `${probe.method} ${probe.path}`;
  const answer = await request(probe);
  seen.add(answer.status);
  if (probe.status !== undefined && answer.status !== probe.status) {
    fail(`${label} answered ${answer.status}, expected ${probe.status}`);
  }
  expectApiNoStore(label, answer);
}

for (const [path, cacheControl] of OWN_CACHE_CONTROL) {
  const label = `GET ${path}`;
  const answer = await request({ method: 'GET', path });
  seen.add(answer.status);
  expectEdgeNoStore(label, answer);
  if (answer.status !== 200) {
    if (!NOT_THERE_YET.includes(answer.status)) {
      fail(`${label} answered ${answer.status}, expected 200 or, until it exists, 401 or 404`);
    }
    expectApiNoStore(label, answer);
    continue;
  }
  if (answer.cacheControl !== cacheControl) {
    fail(
      `${label} answered 200 with Cache-Control "${answer.cacheControl}", expected "${cacheControl}"`,
    );
  }
  if (answer.setCookie !== '') {
    fail(`${label} sets a cookie, so a cache could hand it to another visitor`);
  }
  if (ACCESS_TOKEN === '') {
    fail(
      `${label} answers 200: set PROBE_ACCESS_TOKEN to a donor's access token so the probe can show it answers everyone alike`,
    );
    continue;
  }
  const signedIn = await request({
    method: 'GET',
    path,
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (
    signedIn.status !== 200 ||
    signedIn.text !== answer.text ||
    signedIn.cacheControl !== answer.cacheControl ||
    signedIn.setCookie !== ''
  ) {
    fail(`${label} answers a signed-in donor otherwise than an anonymous visitor`);
  }
  if (answer.etag !== '') {
    const revalidated = await request({
      method: 'GET',
      path,
      headers: { 'If-None-Match': answer.etag },
    });
    if (revalidated.status !== 304 || revalidated.cacheControl !== cacheControl) {
      fail(
        `${label} answered ${revalidated.status} with Cache-Control "${revalidated.cacheControl}" to If-None-Match ${answer.etag}, expected 304 with "${cacheControl}"`,
      );
    }
  }
}

for (const { path, signedInStatus } of RECEIPT_IMAGES) {
  const label = `GET ${path} with a donor's token`;
  if (ACCESS_TOKEN === '') {
    fail(`${label} is not probed: set PROBE_ACCESS_TOKEN to a donor's access token`);
    continue;
  }
  const answer = await request({
    method: 'GET',
    path,
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  seen.add(answer.status);
  if (answer.status !== signedInStatus) {
    fail(`${label} answered ${answer.status}, expected ${signedInStatus}`);
  }
  expectApiNoStore(label, answer);
}

const signIn = {
  method: 'POST',
  path: '/api/donors/auth/login',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'probe@example.cz', password: 'not-the-password' }),
};
let limited;
for (let attempt = 1; attempt <= SIGN_IN_ATTEMPTS && !limited; attempt++) {
  const answer = await request(signIn);
  expectApiNoStore(`POST ${signIn.path} #${attempt}`, answer);
  if (answer.status === 429) {
    limited = answer;
  }
}
if (limited) {
  seen.add(429);
} else {
  fail(`POST ${signIn.path} never answered 429 within ${SIGN_IN_ATTEMPTS} sign-ins`);
}

const statusQuestion = {
  method: 'POST',
  path: STATUS_PATH,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ digest: '0'.repeat(64) }),
};
const statusAnswer = await request(statusQuestion);
seen.add(statusAnswer.status);
if (statusAnswer.status !== 200 || statusAnswer.cacheControl !== 'no-store') {
  fail(
    `POST ${STATUS_PATH} answered ${statusAnswer.status} with Cache-Control "${statusAnswer.cacheControl}", expected 200 and "no-store"`,
  );
}
expectEdgeNoStore(`POST ${STATUS_PATH}`, statusAnswer);
const oversized = await request({
  ...statusQuestion,
  body: JSON.stringify({ digest: '0'.repeat(STATUS_BODY_LIMIT) }),
});
if (oversized.status !== 413) {
  fail(
    `POST ${STATUS_PATH} with a body over ${STATUS_BODY_LIMIT} bytes answered ${oversized.status}, expected 413 from nginx`,
  );
}
expectEdgeNoStore(`POST ${STATUS_PATH} over ${STATUS_BODY_LIMIT} bytes`, oversized);

const oversizedSignIn = await request({
  ...signIn,
  body: JSON.stringify({ email: `a@${'.'.repeat(API_BODY_LIMIT)}@`, password: 'x' }),
});
if (oversizedSignIn.status !== 413) {
  fail(
    `POST ${signIn.path} with a body over ${API_BODY_LIMIT} bytes answered ${oversizedSignIn.status}, expected 413 from nginx`,
  );
}
expectEdgeNoStore(`POST ${signIn.path} over ${API_BODY_LIMIT} bytes`, oversizedSignIn);
const largeUpload = await request({
  method: 'POST',
  path: UPLOAD_PATH,
  headers: { 'Content-Type': 'application/octet-stream' },
  body: 'x'.repeat(2 * API_BODY_LIMIT),
});
if (largeUpload.status !== 401) {
  fail(
    `POST ${UPLOAD_PATH} without a token and a body of ${2 * API_BODY_LIMIT} bytes answered ${largeUpload.status}, expected 401 from the backend (nginx lets photo uploads through up to 11 MB)`,
  );
}

const clientError = (body) => ({
  method: 'POST',
  path: CLIENT_ERRORS,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const report = await request(clientError(CLIENT_ERROR_REPORT));
seen.add(report.status);
if (report.status !== 204) {
  fail(`POST ${CLIENT_ERRORS} answered ${report.status} to a valid report, expected 204`);
}
expectApiNoStore(`POST ${CLIENT_ERRORS}`, report);
const oversizedReport = await request(
  clientError({ ...CLIENT_ERROR_REPORT, padding: 'x'.repeat(CLIENT_ERROR_BODY_LIMIT) }),
);
if (oversizedReport.status !== 413) {
  fail(
    `POST ${CLIENT_ERRORS} answered ${oversizedReport.status} to a body over ${CLIENT_ERROR_BODY_LIMIT} bytes, expected 413 from nginx`,
  );
}
expectEdgeNoStore(`POST ${CLIENT_ERRORS} over the body limit`, oversizedReport);

for (const probe of EDGE_ONLY) {
  expectEdgeNoStore(`${probe.method} ${probe.path}`, await request(probe));
}

for (const path of APP_SHELL) {
  const answer = await request({ method: 'GET', path });
  if (answer.status !== 200 || answer.cacheControl !== 'no-cache') {
    fail(
      `GET ${path} answered ${answer.status} with Cache-Control "${answer.cacheControl}", expected 200 and "no-cache"`,
    );
  }
}

for (const path of [...APP_SHELL, '/overit/']) {
  const answer = await request({ method: 'GET', path });
  const expected = NOT_INDEXED.includes(path) ? 'noindex' : '';
  if (answer.robots !== expected) {
    fail(`GET ${path} answered X-Robots-Tag "${answer.robots}", expected "${expected}"`);
  }
}

await liveStream;

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`::error::${message}`);
  }
  console.error(`${failures.length} edge caching check(s) failed`);
  process.exit(1);
}
console.log(
  `edge caching: /api answers ${[...seen].sort().join(', ')} carry no-store for the browser and Cloudflare, /mcp and /.well-known no-store for Cloudflare, the live stream unbuffered with its revision and a heartbeat, browser error reports over 4 kB refused by nginx, the app shell no-cache`,
);
