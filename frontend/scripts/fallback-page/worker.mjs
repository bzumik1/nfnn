const FALLBACK_PAGE = '__FALLBACK_PAGE__';
const FALLBACK_POLICY = '__FALLBACK_POLICY__';

const ORIGIN_DOWN = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);
const ORIGIN_PATHS = [
  '/api/',
  '/mcp',
  '/.well-known/',
  '/actuator/',
  '/media/',
  '/images/',
  '/receipt-fonts/',
];

function asksForPage(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }
  const path = new URL(request.url).pathname;
  if (ORIGIN_PATHS.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  const mode = request.headers.get('sec-fetch-mode');
  if (mode !== null) {
    return mode === 'navigate';
  }
  return (request.headers.get('accept') ?? '').includes('text/html');
}

function fallbackPage(request) {
  return new Response(request.method === 'HEAD' ? null : FALLBACK_PAGE, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '120',
      'content-security-policy': FALLBACK_POLICY,
      'x-content-type-options': 'nosniff',
      'strict-transport-security': 'max-age=63072000',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-robots-tag': 'noindex',
      'nfnn-fallback': 'outage',
    },
  });
}

export default {
  async fetch(request, env, context) {
    context.passThroughOnException();
    if (!asksForPage(request)) {
      return fetch(request);
    }
    let response;
    try {
      response = await fetch(request);
    } catch {
      return fallbackPage(request);
    }
    if (!ORIGIN_DOWN.has(response.status)) {
      return response;
    }
    await response.body?.cancel();
    return fallbackPage(request);
  },
};
