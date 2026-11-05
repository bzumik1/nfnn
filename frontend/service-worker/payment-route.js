(() => {
  const ROUTE = '/platba.spayd';
  const RESERVATION = 'nfnn-payment-file';
  const LIFETIME_MS = 10_000;
  const KEPT = 16;
  const PAYMENT = /^SPD\*1\.0\*[0-9A-Z $%*+\-./:]{1,992}$/;
  const PAYMENT_HEADERS = {
    'Content-Type': 'application/x-shortpaymentdescriptor; charset=utf-8',
    'Content-Disposition': 'inline; filename="platba.spayd"',
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      "default-src 'none'; sandbox allow-downloads; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  };
  const REFUSAL_HEADERS = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  };
  const reserved = new Map();

  const forgetExpired = (now) => {
    for (const [id, reservation] of reserved) {
      if (reservation.until <= now) {
        reserved.delete(id);
      }
    }
  };

  const reserve = (payment) => {
    const now = Date.now();
    forgetExpired(now);
    while (reserved.size >= KEPT) {
      reserved.delete(reserved.keys().next().value);
    }
    const id = self.crypto.randomUUID();
    reserved.set(id, { payment, until: now + LIFETIME_MS });
    return id;
  };

  const take = (url) => {
    forgetExpired(Date.now());
    const ids = url.searchParams.getAll('id');
    if (ids.length !== 1 || [...url.searchParams.keys()].length !== 1) {
      return null;
    }
    const reservation = reserved.get(ids[0]);
    reserved.delete(ids[0]);
    return reservation === undefined ? null : reservation.payment;
  };

  const refusal = (status, text, extra = {}) =>
    new Response(text, { status, headers: { ...REFUSAL_HEADERS, ...extra } });

  const answer = (request, url) => {
    if (request.method !== 'GET') {
      return refusal(405, 'Method Not Allowed', { Allow: 'GET' });
    }
    const payment = take(url);
    if (payment !== null) {
      return new Response(payment, { status: 200, headers: PAYMENT_HEADERS });
    }
    return request.mode === 'navigate'
      ? new Response(null, { status: 204, headers: REFUSAL_HEADERS })
      : refusal(404, 'Not Found');
  };

  self.addEventListener('message', (event) => {
    const data = event.data;
    if (data === null || typeof data !== 'object' || data.type !== RESERVATION) {
      return;
    }
    event.stopImmediatePropagation();
    const port = event.ports[0];
    if (port === undefined) {
      return;
    }
    const valid = typeof data.payment === 'string' && PAYMENT.test(data.payment);
    port.postMessage({ type: RESERVATION, id: valid ? reserve(data.payment) : null });
  });

  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || url.pathname !== ROUTE) {
      return;
    }
    event.stopImmediatePropagation();
    event.respondWith(answer(event.request, url));
  });
})();
