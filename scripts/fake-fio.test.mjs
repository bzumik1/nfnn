import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { answer, fakeBank, statement } from './fake-fio.mjs';

const TOKEN = 'a-fake-token-of-the-rehearsal';

const movement = (overrides = {}) => ({
  id: 880000001,
  date: '2026-11-04',
  amountMinor: 12_300,
  account: '2900233333',
  bankCode: '2010',
  name: 'Zkušební Dárce',
  variableSymbol: '4821937560',
  message: 'Dar',
  ...overrides,
});

test('Given movements on several days, when the statement of a period is built, then it holds only the movements of that period in the columns Fio sends', () => {
  const built = statement(
    [movement(), movement({ id: 880000002, date: '2026-10-01' }), movement({ id: 880000003, date: '2026-11-06' })],
    '2026-10-02',
    '2026-11-05',
  );
  assert.equal(built.accountStatement.info.dateStart, '2026-10-02+0100');
  assert.equal(built.accountStatement.info.dateEnd, '2026-11-05+0100');
  assert.equal(built.accountStatement.info.currency, 'CZK');
  const listed = built.accountStatement.transactionList.transaction;
  assert.equal(listed.length, 1);
  assert.deepEqual(
    Object.fromEntries(Object.entries(listed[0]).map(([column, cell]) => [column, cell?.value ?? null])),
    {
      column22: 880000001,
      column0: '2026-11-04+0100',
      column1: 123,
      column14: 'CZK',
      column2: '2900233333',
      column3: '2010',
      column10: 'Zkušební Dárce',
      column5: '4821937560',
      column16: 'Dar',
      column8: 'Bezhotovostní příjem',
    },
  );
});

test('Given a movement without a sender account, a name or a symbol, when the statement is built, then those columns are null as Fio sends them', () => {
  const [listed] = statement(
    [movement({ account: null, bankCode: null, name: null, variableSymbol: null, message: null })],
    '2026-11-01',
    '2026-11-05',
  ).accountStatement.transactionList.transaction;
  for (const column of ['column2', 'column3', 'column10', 'column5', 'column16']) {
    assert.equal(listed[column], null, column);
  }
});

test('Given an empty period, when its statement is built, then it names the period and lists no movement', () => {
  const built = statement([], '2026-08-07', '2026-11-05');
  assert.equal(built.accountStatement.info.dateStart, '2026-08-07+0100');
  assert.deepEqual(built.accountStatement.transactionList.transaction, []);
});

test('Given the fake bank, when the backend asks for a period with the token, then it answers the statement and counts the request', () => {
  const bank = fakeBank(TOKEN);
  answer(bank, 'POST', '/movements', JSON.stringify([movement()]));
  const served = answer(bank, 'GET', `/v1/rest/periods/${TOKEN}/2026-11-01/2026-11-05/transactions.json`);
  assert.equal(served.status, 200);
  assert.equal(served.json.accountStatement.transactionList.transaction.length, 1);
  assert.deepEqual(answer(bank, 'GET', '/requests').json, { periods: 1, refused: 0 });
});

test('Given the fake bank, when a request carries another token, then it is refused as Fio refuses an unknown token and counted', () => {
  const bank = fakeBank(TOKEN);
  const refused = answer(bank, 'GET', '/v1/rest/periods/another-token-entirely/2026-11-01/2026-11-05/transactions.json');
  assert.equal(refused.status, 401);
  assert.deepEqual(answer(bank, 'GET', '/requests').json, { periods: 0, refused: 1 });
});

test('Given the fake bank, when a movement with a known id is added again, then it is kept once, as the bank books a movement once', () => {
  const bank = fakeBank(TOKEN);
  answer(bank, 'POST', '/movements', JSON.stringify([movement()]));
  const again = answer(bank, 'POST', '/movements', JSON.stringify([movement(), movement({ id: 880000002 })]));
  assert.deepEqual(again.json, { movements: 2 });
});

test('Given the fake bank, when it is asked for anything else, then it answers 404', () => {
  const bank = fakeBank(TOKEN);
  assert.equal(answer(bank, 'GET', `/v1/rest/last/${TOKEN}/transactions.json`).status, 404);
  assert.equal(answer(bank, 'DELETE', '/movements').status, 404);
});

test('Given a fake bank without a token, when it is made, then it refuses to start', () => {
  assert.throws(() => fakeBank(''), /FAKE_FIO_TOKEN/);
});
