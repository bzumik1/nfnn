#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { pathToFileURL } from 'node:url';

const PERIOD = /^\/v1\/rest\/periods\/([A-Za-z0-9_-]+)\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\/transactions\.json$/;
const INCOMING_TRANSFER = 'Bezhotovostní příjem';

const cell = (value, name, id) => (value === null || value === undefined ? null : { value, name, id });
const PRAGUE_OFFSET = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' });
const day = (date) => {
  const offset = PRAGUE_OFFSET.formatToParts(new Date(`${date}T12:00:00Z`)).find((part) => part.type === 'timeZoneName').value;
  return `${date}${offset.replace(/^GMT([+-])(\d{2}):(\d{2})$/, '$1$2$3')}`;
};

export function statement(movements, from, to) {
  const listed = movements
    .filter((movement) => movement.date >= from && movement.date <= to)
    .sort((left, right) => left.id - right.id);
  return {
    accountStatement: {
      info: {
        accountId: '5544332217',
        bankId: '2010',
        currency: 'CZK',
        iban: 'CZ2620100000005544332217',
        bic: 'FIOBCZPPXXX',
        openingBalance: 0,
        closingBalance: listed.reduce((sum, movement) => sum + movement.amountMinor, 0) / 100,
        dateStart: day(from),
        dateEnd: day(to),
        yearList: null,
        idList: null,
        idFrom: listed[0]?.id ?? null,
        idTo: listed.at(-1)?.id ?? null,
        idLastDownload: null,
      },
      transactionList: {
        transaction: listed.map((movement) => ({
          column22: cell(movement.id, 'ID pohybu', 22),
          column0: cell(day(movement.date), 'Datum', 0),
          column1: cell(movement.amountMinor / 100, 'Objem', 1),
          column14: cell('CZK', 'Měna', 14),
          column2: cell(movement.account, 'Protiúčet', 2),
          column3: cell(movement.bankCode, 'Kód banky', 3),
          column10: cell(movement.name, 'Název protiúčtu', 10),
          column5: cell(movement.variableSymbol, 'VS', 5),
          column16: cell(movement.message, 'Zpráva pro příjemce', 16),
          column8: cell(INCOMING_TRANSFER, 'Typ', 8),
        })),
      },
    },
  };
}

export function fakeBank(token) {
  if (!token) {
    throw new Error('FAKE_FIO_TOKEN names the token the fake bank accepts');
  }
  return { token, movements: new Map(), periods: 0, refused: 0 };
}

const json = (status, body) => ({ status, json: body });

export function answer(bank, method, path, body = '') {
  const period = PERIOD.exec(path);
  if (method === 'GET' && period) {
    if (period[1] !== bank.token) {
      bank.refused += 1;
      return json(401, { error: 'unknown token' });
    }
    bank.periods += 1;
    return json(200, statement([...bank.movements.values()], period[2], period[3]));
  }
  if (method === 'POST' && path === '/movements') {
    for (const movement of JSON.parse(body)) {
      bank.movements.set(movement.id, movement);
    }
    return json(200, { movements: bank.movements.size });
  }
  if (method === 'GET' && path === '/requests') {
    return json(200, { periods: bank.periods, refused: bank.refused });
  }
  return json(404, { error: 'not found' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bank = fakeBank(process.env.FAKE_FIO_TOKEN);
  const serve = (request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const path = new URL(request.url, 'http://fake').pathname;
      let answered;
      try {
        answered = answer(bank, request.method, path, Buffer.concat(chunks).toString('utf8'));
      } catch {
        answered = json(400, { error: 'unreadable request' });
      }
      console.log(`${request.method} ${PERIOD.test(path) ? '/v1/rest/periods/…' : path} ${answered.status}`);
      response.writeHead(answered.status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(answered.json));
    });
  };
  const port = Number(process.env.PORT ?? 8090);
  createServer(serve).listen(port, () => console.log(`The fake Fio bank listens on ${port}`));
  if (process.env.TLS_KEY && process.env.TLS_CERT) {
    const tlsPort = Number(process.env.TLS_PORT ?? 8443);
    createTlsServer({ key: readFileSync(process.env.TLS_KEY), cert: readFileSync(process.env.TLS_CERT) }, serve).listen(
      tlsPort,
      () => console.log(`The fake Fio bank listens over https on ${tlsPort}`),
    );
  }
}
