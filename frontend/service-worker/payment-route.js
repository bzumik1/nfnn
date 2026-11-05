(() => {
  const ROUTE = '/platba.spayd';
  const PAYMENT_HEADERS = {
    'Content-Type': 'application/x-shortpaymentdescriptor; charset=utf-8',
    'Content-Disposition': 'inline; filename="platba.spayd"',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox allow-downloads",
    'X-Content-Type-Options': 'nosniff',
  };
  const REFUSAL_HEADERS = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const PAYMENT = /^SPD\*1\.0\*[\x20-\x7E]{1,992}$/;

  const paymentOf = (url) => {
    const texts = url.searchParams.getAll('data');
    return texts.length === 1 && PAYMENT.test(texts[0]) ? texts[0] : null;
  };

  const answer = (request, url) => {
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: PAYMENT_HEADERS });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { ...REFUSAL_HEADERS, Allow: 'GET, HEAD' },
      });
    }
    const payment = paymentOf(url);
    return payment === null
      ? new Response('Bad Request', { status: 400, headers: REFUSAL_HEADERS })
      : new Response(payment, { status: 200, headers: PAYMENT_HEADERS });
  };

  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || url.pathname !== ROUTE) {
      return;
    }
    event.stopImmediatePropagation();
    event.respondWith(answer(event.request, url));
  });
})();
