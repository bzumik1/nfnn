#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), '..');
const CZECH_WORDS = join(
  REPOSITORY,
  'backend/src/main/resources/cz/novanadeje/app/operations/domain/backup/bip39-czech.txt',
);
const FOUNDATION_COMPANY_IDENTIFIER = 27278794;
const PROOF_MESSAGE_TAG = 'nfnn.cz/receipt/v1';
const QR_PREFIX = 'https://nfnn.cz/overit#1';
const SIGNATURE_BYTES = 64;
const CHUNK_DIGITS_BY_BYTES = [0, 3, 5, 8, 10, 13, 15, 17];
const CONNECTOR_CLIENT = 'https://claude.ai/oauth/claude-code-client-metadata';
const CONNECTOR_REDIRECT = 'http://127.0.0.1/callback';
const SIGNATURE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><path fill="#1f2937" d="M10 45 C40 5 60 5 80 40 C95 60 120 10 150 30 L190 20 L190 26 L150 36 C120 18 98 64 76 44 C60 14 44 14 16 48 Z"/></svg>';

export function base32Decode(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of text.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value < 0) {
      throw new Error('the TOTP secret is not base32');
    }
    accumulator = (accumulator << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(secret, step, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(number % 10 ** digits).padStart(digits, '0');
}

export function proofBytes(qrText) {
  if (!qrText.startsWith(QR_PREFIX)) {
    throw new Error(`the verification QR text does not start with ${QR_PREFIX}`);
  }
  const digits = qrText.slice(QR_PREFIX.length);
  if (!/^[0-9]+$/.test(digits)) {
    throw new Error('the verification QR text carries something other than digits');
  }
  const bytes = [];
  let position = 0;
  while (position < digits.length) {
    const left = digits.length - position;
    const width = left >= 17 ? 17 : left;
    const count = CHUNK_DIGITS_BY_BYTES.indexOf(width);
    if (count < 1) {
      throw new Error(`the verification QR text ends with a chunk of ${width} digits`);
    }
    let value = BigInt(digits.slice(position, position + width));
    const chunk = [];
    for (let index = 0; index < count; index += 1) {
      chunk.unshift(Number(value & 255n));
      value >>= 8n;
    }
    bytes.push(...chunk);
    position += width;
  }
  return Buffer.from(bytes);
}

export function statusDigest(qrText) {
  const proof = proofBytes(qrText);
  const body = proof.subarray(0, proof.length - SIGNATURE_BYTES);
  const signature = proof.subarray(proof.length - SIGNATURE_BYTES);
  const companyIdentifier = Buffer.alloc(4);
  companyIdentifier.writeUInt32BE(FOUNDATION_COMPANY_IDENTIFIER);
  return createHash('sha256')
    .update(Buffer.from(PROOF_MESSAGE_TAG, 'ascii'))
    .update(Buffer.from([0]))
    .update(companyIdentifier)
    .update(body)
    .update(signature)
    .digest('hex');
}

export function backupKeyWords(ageKey, positions, wordlist) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const text = ageKey.toLowerCase();
  let accumulator = 0n;
  let bits = 0;
  const key = [];
  for (const character of text.slice(text.lastIndexOf('1') + 1, -6)) {
    accumulator = (accumulator << 5n) | BigInt(alphabet.indexOf(character));
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      key.push(Number((accumulator >> BigInt(bits)) & 255n));
      accumulator &= (1n << BigInt(bits)) - 1n;
    }
  }
  const entropy = Buffer.from(key);
  const checksum = createHash('sha256').update(entropy).digest()[0];
  const number = BigInt('0x' + Buffer.concat([entropy, Buffer.from([checksum])]).toString('hex'));
  const words = Array.from({ length: 24 }, (_, index) =>
    Number((number >> BigInt(11 * (23 - index))) & 2047n),
  ).map((index) => wordlist[index]);
  return positions.map((position) => ({ position, word: words[position - 1] }));
}

export function receiptSerial(number) {
  const match = /^([0-9]{4})-([0-9]{6})$/.exec(number);
  if (!match) {
    throw new Error(`${number} is not a receipt number`);
  }
  return Number(match[2]);
}

export function syntheticPortraitPng(side = 640) {
  const rows = [];
  for (let y = 0; y < side; y += 1) {
    const row = Buffer.alloc(1 + side * 3);
    for (let x = 0; x < side; x += 1) {
      const inFace = (x - side / 2) ** 2 + (y - side / 2.4) ** 2 < (side / 4.5) ** 2;
      const inShoulders = y > side * 0.68 && Math.abs(x - side / 2) < side * 0.38;
      const shade = inFace || inShoulders ? [70, 90, 140] : [225, 232, 240];
      row.set(shade, 1 + x * 3);
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function mcpMessages(contentType, text) {
  if (!contentType.includes('text/event-stream')) {
    return text.trim() === '' ? [] : [JSON.parse(text)];
  }
  return text
    .split(/\r?\n\r?\n/)
    .map((event) =>
      event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n'),
    )
    .filter((data) => data !== '')
    .map((data) => JSON.parse(data));
}

class JourneyFailure extends Error {}

function fail(message) {
  throw new JourneyFailure(message);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function options(argv) {
  const [command, ...rest] = argv;
  const named = {};
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith('--')) {
      fail(`unexpected argument ${flag}`);
    }
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) {
      named[flag.slice(2)] = true;
    } else {
      named[flag.slice(2)] = next;
      index += 1;
    }
  }
  return { command, named };
}

class Journey {
  constructor(named) {
    this.site = named.site ?? 'http://localhost:8089';
    this.mail = named.mail ?? 'http://127.0.0.1:8025';
    this.client = named.client ?? '203.0.113.60';
    this.withoutConnector = named['without-connector'] === true;
    this.statePath = named.state ?? fail('--state names the file the journey keeps its state in');
    this.state = existsSync(this.statePath) ? JSON.parse(readFileSync(this.statePath, 'utf8')) : {};
  }

  save() {
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2) + '\n', { mode: 0o600 });
  }

  say(line) {
    console.log(line);
  }

  async request(method, path, { token, json, form, body, headers = {}, direct = false } = {}) {
    const sent = { ...headers };
    if (!direct) {
      sent['X-Forwarded-For'] = this.client;
    }
    if (token) {
      sent.Authorization = `Bearer ${token}`;
    }
    let payload = body;
    if (json !== undefined) {
      sent['Content-Type'] = 'application/json';
      payload = JSON.stringify(json);
    } else if (form !== undefined) {
      sent['Content-Type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(form).toString();
    }
    const response = await fetch(this.site + path, {
      method,
      headers: sent,
      body: payload,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text === '' ? null : JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { status: response.status, json: parsed, text, headers: response.headers };
  }

  async expect(status, method, path, init = {}, what = `${method} ${path}`) {
    const answer = await this.request(method, path, init);
    if (answer.status !== status) {
      fail(`${what} answered ${answer.status} instead of ${status}: ${answer.text.slice(0, 600)}`);
    }
    return answer.json;
  }

  sql(statement) {
    return execFileSync(
      'docker',
      ['exec', 'nfnn-postgres', 'psql', '-U', 'novanadeje', '-d', 'novanadeje', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', statement],
      { encoding: 'utf8' },
    ).trim();
  }

  async waitUntil(what, seconds, check) {
    const deadline = Date.now() + seconds * 1000;
    let last = null;
    while (Date.now() < deadline) {
      try {
        const result = await check();
        if (result) {
          return result;
        }
      } catch (problem) {
        last = problem;
      }
      await sleep(1000);
    }
    fail(`${what} did not happen within ${seconds} s${last ? ` (${last.message})` : ''}`);
  }

  async setupFinished(seconds) {
    await this.waitUntil('the backend coming back with the setup completed', seconds, async () => {
      const answer = await this.request('GET', '/api/operations/setup', { direct: true });
      return answer.status === 200 && answer.json?.required === false;
    });
  }

  async setup() {
    const status = await this.expect(200, 'GET', '/api/operations/setup', { direct: true }, 'the setup status');
    if (status.required !== true || status.codeRequired !== false) {
      fail(`a fresh install opened directly must ask for the setup without a code (got ${JSON.stringify(status)})`);
    }
    const backupKey = await this.expect(200, 'GET', '/api/operations/setup/backup-key', { direct: true }, 'the backup key');
    const wordlist = readFileSync(CZECH_WORDS, 'utf8').split(/\s+/).filter(Boolean);
    const saved = await this.expect(202, 'POST', '/api/operations/setup', {
      direct: true,
      json: {
        settings: [
          { name: 'PUBLIC_URL', value: this.site },
          { name: 'MAIL_HOST', value: 'nfnn-probe-mail' },
          { name: 'MAIL_PORT', value: '1025' },
          { name: 'MAIL_FROM', value: 'info@nfnn.cz' },
          { name: 'CONTACT_RECIPIENT', value: 'info@nfnn.cz' },
          { name: 'ADMIN_EMAILS', value: 'spravce@example.cz' },
        ],
        backupKeyWords: backupKeyWords(backupKey.key, backupKey.checkPositions, wordlist),
      },
    }, 'the first setup');
    if (saved.restarting !== true) {
      fail(`the first setup did not restart the backend: ${JSON.stringify(saved)}`);
    }
    this.say('The first setup was saved; waiting for the backend to start with the stored settings');
    await sleep(3000);
    await this.setupFinished(180);
    this.say('The backend runs with the stored settings');
  }

  async restoreInSetup(dumpPath, keyPath) {
    const status = await this.expect(200, 'GET', '/api/operations/setup', { direct: true }, 'the setup status of the second server');
    if (status.required !== true) {
      fail('the second server must be a fresh install that asks for the setup');
    }
    const key = readFileSync(keyPath, 'utf8').split('\n').find((line) => line.startsWith('AGE-SECRET-KEY-'));
    const accepted = await this.expect(202, 'PUT', '/api/operations/setup/restore', {
      direct: true,
      headers: { 'Content-Type': 'application/octet-stream', 'X-Nfnn-Backup-Key': key },
      body: readFileSync(dumpPath),
    }, 'the upload of the first server\'s backup into the second server\'s setup');
    this.say(`The second server took the backup as ${accepted.fileName} and restores it`);
    this.state.restoreRequestId = accepted.requestId;
    this.save();
    await sleep(3000);
    await this.setupFinished(300);
    this.say('The second server runs on the restored data');
  }

  async messageLink(address, pattern) {
    return this.waitUntil(`an e-mail to ${address} with its link`, 60, async () => {
      const search = await fetch(`${this.mail}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
      const found = await search.json();
      for (const message of found.messages ?? []) {
        const full = await (await fetch(`${this.mail}/api/v1/message/${message.ID}`)).json();
        const match = pattern.exec(full.Text ?? '');
        if (match) {
          return match[1];
        }
      }
      return null;
    });
  }

  async register(account) {
    await this.expect(202, 'POST', '/api/donors/auth/register', {
      json: {
        type: 'PERSON',
        name: account.name,
        address: account.address,
        email: account.email,
        password: account.password,
        preferredLocale: 'cs',
      },
    }, `the registration of ${account.email}`);
    const token = await this.messageLink(account.email, /potvrzeni-emailu#token=([A-Za-z0-9_-]{43})/);
    const session = await this.expect(200, 'POST', '/api/donors/auth/email-verification/confirm', { json: { token } },
      `the e-mail confirmation of ${account.email}`);
    return session;
  }

  nextTotpStep() {
    const current = Math.floor(Date.now() / 1000 / 30);
    return Math.max(current - 1, (this.state.admin.lastStep ?? -Infinity) + 1);
  }

  async freshCode() {
    let step = this.nextTotpStep();
    while (step > Math.floor(Date.now() / 1000 / 30) + 1) {
      await sleep(2000);
      step = this.nextTotpStep();
    }
    this.state.admin.lastStep = step;
    this.save();
    return totpCode(this.state.admin.secret, step);
  }

  async adminSession() {
    if (this.state.admin) {
      const answer = await this.request('POST', '/api/donors/auth/login', {
        json: { email: this.state.admin.email, password: this.state.admin.password },
      });
      if (answer.status === 200) {
        fail('an administrator with a second factor signed in with the password alone');
      }
      const challenge = answer.json?.challenge;
      if (!challenge) {
        fail(`the administrator's sign-in did not ask for the second factor: ${answer.status} ${answer.text.slice(0, 300)}`);
      }
      const session = await this.expect(200, 'POST', '/api/donors/auth/login/second-factor', {
        json: { challenge, code: await this.freshCode() },
      }, 'the administrator\'s second factor at sign-in');
      return session.accessToken;
    }
    const admin = {
      name: 'Zkušební Správce',
      address: { street: 'Zkušební 1', city: 'Zkušebná', postalCode: '100 00' },
      email: 'spravce@example.cz',
      password: 'a probe password of the stack administrator',
    };
    const session = await this.register(admin);
    const enrolment = await this.expect(200, 'POST', '/api/donors/me/second-factor/setup', {
      token: session.accessToken,
      json: { password: admin.password },
    }, 'the administrator\'s second factor setup');
    this.state.admin = { email: admin.email, password: admin.password, secret: enrolment.secret, id: session.user.id };
    this.save();
    const confirmed = await this.expect(200, 'POST', '/api/donors/me/second-factor/confirm', {
      token: session.accessToken,
      json: { code: await this.freshCode() },
    }, 'the administrator\'s second factor confirmation');
    if (!confirmed.user.roles.includes('ADMIN')) {
      fail('the session the administrator opened with the second factor does not carry ADMIN');
    }
    return confirmed.accessToken;
  }

  async donorSession() {
    const donor = this.state.donor;
    const session = await this.expect(200, 'POST', '/api/donors/auth/login', {
      json: { email: donor.email, password: donor.password },
    }, 'the donor\'s sign-in');
    return session.accessToken;
  }

  async connectorToken(admin) {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const redirectUri = `${CONNECTOR_REDIRECT.replace('/callback', '')}:43117/callback`;
    const decision = await this.expect(200, 'POST', '/api/donors/oauth/authorize', {
      token: admin,
      json: {
        clientId: CONNECTOR_CLIENT,
        redirectUri,
        responseType: 'code',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        scope: 'admin:read',
        resource: `${this.site}/mcp`,
        state: 'stack-journey',
        approved: true,
        secondFactorCode: await this.freshCode(),
      },
    }, 'the administrator\'s approval of the connector');
    const code = new URL(decision.redirectTo).searchParams.get('code') ?? fail(`the approval led nowhere useful: ${decision.redirectTo}`);
    const tokens = await this.expect(200, 'POST', '/api/donors/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        code,
        client_id: CONNECTOR_CLIENT,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: `${this.site}/mcp`,
      },
    }, 'the connector\'s code exchange');
    return tokens.access_token;
  }

  async connectorTool(token, name) {
    const send = async (message, session, protocol) => {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        'X-Forwarded-For': this.client,
      };
      if (session) {
        headers['Mcp-Session-Id'] = session;
      }
      if (protocol) {
        headers['Mcp-Protocol-Version'] = protocol;
      }
      const response = await fetch(`${this.site}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      if (response.status >= 300) {
        fail(`the connector answered ${message.method} with ${response.status}: ${text.slice(0, 300)}`);
      }
      return {
        session: response.headers.get('mcp-session-id') ?? session,
        messages: mcpMessages(response.headers.get('content-type') ?? '', text),
      };
    };
    const opened = await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stack-journey', version: '1' } },
    });
    const protocol = opened.messages.find((message) => message.id === 1)?.result?.protocolVersion;
    if (!protocol) {
      fail(`the connector did not answer the initialization: ${JSON.stringify(opened.messages).slice(0, 300)}`);
    }
    await send({ jsonrpc: '2.0', method: 'notifications/initialized' }, opened.session, protocol);
    const called = await send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: {} } }, opened.session, protocol);
    const result = called.messages.find((message) => message.id === 2)?.result;
    if (!result || result.isError) {
      fail(`the connector's ${name} failed: ${JSON.stringify(called.messages).slice(0, 600)}`);
    }
    return JSON.parse(result.content.find((part) => part.type === 'text').text);
  }

  async connectorSaysSignatory(connector, expected) {
    if (connector === null) {
      this.say(`Skipped nfnn_status (--without-connector), expecting receiptSignatory ${expected}`);
      return;
    }
    const status = await this.connectorTool(connector, 'nfnn_status');
    if (status.receiptSignatory !== expected) {
      fail(`nfnn_status through the connector must say receiptSignatory ${expected} (got ${status.receiptSignatory})`);
    }
    this.say(`nfnn_status through the connector says receiptSignatory ${expected}`);
  }

  async receiptStatus(digest) {
    const answer = await this.expect(200, 'POST', '/api/donations/receipts/status', { json: { digest } }, 'the receipt status');
    return answer.status;
  }

  remember(receipt, extra = {}) {
    const frozen = receipt.receipt;
    const entry = {
      id: receipt.id,
      number: receipt.number,
      donationId: receipt.donationId,
      status: receipt.status,
      qrText: frozen.verification.qrText,
      keyId: frozen.verification.keyId,
      digest: statusDigest(frozen.verification.qrText),
      signatureImage: frozen.signatory.signatureImage?.sha256 ?? null,
      portraitImage: frozen.signatory.portraitImage?.sha256 ?? null,
      ...extra,
    };
    this.state.receipts = [...(this.state.receipts ?? []).filter((kept) => kept.id !== entry.id), entry];
    this.save();
    return entry;
  }

  mark(id, status) {
    this.state.receipts = this.state.receipts.map((kept) => (kept.id === id ? { ...kept, status } : kept));
    this.save();
  }

  checkFrozen(receipt, what) {
    const frozen = receipt.receipt;
    if (!frozen?.verification?.qrText?.startsWith(QR_PREFIX)) {
      fail(`${what} carries no verification QR text`);
    }
    if (frozen.signatory?.name !== this.state.signatory.name || frozen.signatory?.role !== this.state.signatory.receiptRole) {
      fail(`${what} is signed by ${JSON.stringify(frozen.signatory)} instead of the chosen signatory`);
    }
    if (!frozen.signatory.signatureImage?.sha256 || !frozen.signatory.portraitImage?.sha256) {
      fail(`${what} froze no signature or no portrait of the signatory: ${JSON.stringify(frozen.signatory)}`);
    }
  }

  async payGifts(donorId) {
    const amounts = [50_000, 70_000, 90_000];
    const ids = amounts.map((amount, index) =>
      this.sql(
        `insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, counterparty_account, counterparty_bank_code, counterparty_name, transaction_type, imported_at) ` +
          `values (gen_random_uuid(), ${990_000_001 + index}, current_date - ${3 - index}, ${amount}, 'CZK', '19-2000145399', '0800', 'Zkušební Dárce', 'Bezhotovostní příjem', now()) returning id`,
      ).split('\n')[0],
    );
    const admin = this.state.adminToken;
    for (const id of ids) {
      await this.expect(200, 'POST', `/api/admin/donations/payments/${id}/pair`, { token: admin, json: { donorId } },
        `pairing the payment ${id} by hand`);
    }
    const donor = await this.donorSession();
    const donations = await this.expect(200, 'GET', '/api/donations/me', { token: donor }, 'the donor\'s gifts');
    const gifts = amounts.map((amount) => {
      const gift = donations.items.find((item) => item.amountMinor === amount);
      return gift?.id ?? fail(`the donor does not see the gift of ${amount / 100} Kč paired by hand`);
    });
    this.state.gifts = gifts;
    this.save();
    this.say(`The administrator paired three payments to the donor by hand: ${gifts.join(', ')}`);
  }

  async chooseSignatory(admin) {
    const media = await this.request('POST', '/api/admin/content/media', {
      token: admin,
      body: (() => {
        const form = new FormData();
        form.append('file', new Blob([syntheticPortraitPng()], { type: 'image/png' }), 'portret.png');
        return form;
      })(),
    });
    if (media.status !== 201) {
      fail(`uploading the synthetic portrait answered ${media.status}: ${media.text.slice(0, 300)}`);
    }
    const person = await this.expect(201, 'POST', '/api/admin/content/people', {
      token: admin,
      json: { name: 'Zkušební Podepisující', role: 'Předseda správní rady', onBoard: true, featured: false, portraitId: media.json.id },
    }, 'adding the person who will sign');
    const signature = await this.request('POST', `/api/admin/donations/receipt-signatures/${person.id}`, {
      token: admin,
      body: (() => {
        const form = new FormData();
        form.append('file', new Blob([SIGNATURE_SVG], { type: 'image/svg+xml' }), 'podpis.svg');
        return form;
      })(),
    });
    if (signature.status !== 200) {
      fail(`uploading the synthetic SVG signature answered ${signature.status}: ${signature.text.slice(0, 300)}`);
    }
    if (signature.json.kind !== 'VECTOR') {
      fail(`the SVG signature was not stored as a vector: ${signature.text.slice(0, 300)}`);
    }
    const receiptRole = 'předseda správní rady';
    const chosen = await this.expect(200, 'PUT', '/api/admin/donations/receipt-signatory', {
      token: admin,
      json: { personId: person.id, receiptRole },
    }, 'choosing who signs the receipts');
    if (chosen.personId !== person.id || chosen.receiptRole !== receiptRole || chosen.portrait !== true || chosen.portraitPrintable !== true || chosen.signature !== true) {
      fail(`the chosen signatory is not the person with a printable portrait, the receipt role and a signature: ${JSON.stringify(chosen)}`);
    }
    this.state.signatory = { personId: person.id, name: 'Zkušební Podepisující', receiptRole };
    this.save();
    this.say('The administrator chose the signatory with a portrait, a receipt role and an SVG signature');
  }

  async receipts() {
    const admin = await this.adminSession();
    this.state.adminToken = admin;
    this.save();
    const before = await this.expect(200, 'GET', '/api/admin/donations/receipt-signatory', { token: admin }, 'the signatory before any choice');
    if (before.signatory !== null) {
      fail(`a fresh site must have nobody chosen to sign the receipts (got ${JSON.stringify(before.signatory)})`);
    }
    const connector = this.withoutConnector ? null : await this.connectorToken(admin);
    await this.connectorSaysSignatory(connector, 'missing');

    const donorAccount = {
      name: 'Zkušební Dárce',
      address: { street: 'Dárcovská 7', city: 'Zkušebná', postalCode: '100 00' },
      email: 'darce-potvrzeni@example.cz',
      password: 'a probe password of the stack donor',
    };
    const donorSession = await this.register(donorAccount);
    this.state.donor = { email: donorAccount.email, password: donorAccount.password, id: donorSession.user.id };
    this.save();
    await this.payGifts(this.state.donor.id);
    const unsigned = await this.request('POST', '/api/donations/me/receipts', {
      token: await this.donorSession(),
      json: { donationId: this.state.gifts[0] },
    });
    if (unsigned.status !== 409 || !unsigned.json?.type?.endsWith('/donations/receipt-signatory-missing')) {
      fail(`issuing a receipt with nobody chosen to sign must answer 409 receipt-signatory-missing (got ${unsigned.status} ${unsigned.text.slice(0, 300)})`);
    }

    await this.chooseSignatory(admin);
    await this.connectorSaysSignatory(connector, 'ok');

    const fromCard = await this.expect(200, 'POST', `/api/admin/donations/donors/${this.state.donor.id}/receipts`, {
      token: admin,
      json: { donationId: this.state.gifts[0] },
    }, 'the administrator issuing a receipt from the donor card');
    this.checkFrozen(fromCard, 'the receipt issued from the donor card');
    const issuedByAdmin = this.remember(fromCard, { phase: 'deployed', issuedBy: 'admin' });
    this.say(`The administrator issued ${issuedByAdmin.number} from the donor card`);

    const donor = await this.donorSession();
    const own = await this.expect(200, 'POST', '/api/donations/me/receipts', {
      token: donor,
      json: { donationId: this.state.gifts[1] },
    }, 'the donor issuing their receipt');
    this.checkFrozen(own, 'the donor\'s receipt');
    const ownEntry = this.remember(own, { phase: 'deployed', issuedBy: 'donor' });
    for (const sha256 of [ownEntry.signatureImage, ownEntry.portraitImage]) {
      const image = await this.request('GET', `/api/donations/me/receipt-images/${sha256}`, { token: donor });
      if (image.status !== 200) {
        fail(`the donor could not read the image ${sha256} their receipt names (${image.status})`);
      }
    }
    for (const entry of [issuedByAdmin, ownEntry]) {
      if ((await this.receiptStatus(entry.digest)) !== 'active') {
        fail(`the status of ${entry.number} must be active`);
      }
    }
    this.say(`The donor issued ${ownEntry.number} and read it with its signature and portrait; both receipts are active`);

    await this.expect(200, 'PATCH', '/api/donors/me', {
      token: donor,
      json: { address: { street: 'Přestěhovaná 9', city: 'Zkušebná', postalCode: '100 00' } },
    }, 'the donor\'s address change');
    const replacement = await this.expect(200, 'POST', '/api/donations/me/receipts', {
      token: donor,
      json: { donationId: this.state.gifts[1] },
    }, 'the donor issuing their receipt again after moving');
    if (replacement.number === ownEntry.number || replacement.receipt.replaces?.number !== ownEntry.number) {
      fail(`the receipt issued after the address change must replace ${ownEntry.number} (got ${replacement.number}, replaces ${JSON.stringify(replacement.receipt.replaces)})`);
    }
    this.mark(ownEntry.id, 'REPLACED');
    const replacementEntry = this.remember(replacement, { phase: 'deployed', issuedBy: 'donor' });
    if ((await this.receiptStatus(ownEntry.digest)) !== 'replaced') {
      fail(`the status of ${ownEntry.number} must be replaced once ${replacementEntry.number} replaced it`);
    }
    if ((await this.receiptStatus(replacementEntry.digest)) !== 'active') {
      fail(`the status of the replacement ${replacementEntry.number} must be active`);
    }
    this.say(`After the address change ${replacementEntry.number} replaced ${ownEntry.number}: the status answers replaced and active`);
    await this.check({});
  }

  async check({ issue, restored }) {
    const donor = await this.donorSession();
    const listed = await this.expect(200, 'GET', '/api/donations/me/receipts', { token: donor }, 'the donor\'s receipts');
    for (const entry of this.state.receipts) {
      const found = listed.items.find((item) => item.id === entry.id);
      if (entry.gone) {
        if (found) {
          fail(`${entry.number}, issued after the backup, is still there after the restore`);
        }
        if ((await this.receiptStatus(entry.digest)) !== 'unknown') {
          fail(`the status of ${entry.number}, issued after the backup, must be unknown after the restore`);
        }
        continue;
      }
      if (!found || found.number !== entry.number || found.status !== entry.status) {
        fail(`the donor's list must hold ${entry.number} as ${entry.status} (got ${JSON.stringify(found ? { number: found.number, status: found.status } : null)})`);
      }
      const read = await this.expect(200, 'GET', `/api/donations/me/receipts/${entry.id}`, { token: donor }, `reading ${entry.number}`);
      if (read.receipt.verification.qrText !== entry.qrText) {
        fail(`${entry.number} no longer carries the proof it was issued with`);
      }
      const expected = entry.status === 'REPLACED' ? 'replaced' : 'active';
      if ((await this.receiptStatus(entry.digest)) !== expected) {
        fail(`the status of ${entry.number} must be ${expected}`);
      }
      for (const sha256 of [entry.signatureImage, entry.portraitImage].filter(Boolean)) {
        const image = await this.request('GET', `/api/donations/me/receipt-images/${sha256}`, { token: donor });
        if (image.status !== 200) {
          fail(`the image ${sha256} of ${entry.number} could not be read (${image.status})`);
        }
      }
    }
    const active = this.state.receipts.filter((entry) => !entry.gone && entry.status === 'ACTIVE' && entry.issuedBy === 'donor');
    for (const entry of active) {
      const again = await this.expect(200, 'POST', '/api/donations/me/receipts', { token: donor, json: { donationId: entry.donationId } },
        `issuing ${entry.number} again`);
      if (again.number !== entry.number) {
        fail(`issuing the unchanged receipt ${entry.number} again gave ${again.number}`);
      }
    }
    this.say(`The donor's ${this.state.receipts.filter((entry) => !entry.gone).length} receipts read as issued, with their statuses, and an unchanged one is issued again under its number`);
    if (restored) {
      const lost = this.state.receipts.filter((entry) => entry.gone && entry.donationId === this.state.gifts[2]);
      const again = await this.expect(200, 'POST', '/api/donations/me/receipts', { token: donor, json: { donationId: this.state.gifts[2] } },
        'issuing the receipt lost with the restore again');
      for (const entry of lost) {
        if (receiptSerial(again.number) <= receiptSerial(entry.number)) {
          fail(`the receipt issued after the restore took ${again.number}, not above ${entry.number} that the restore took away: numbers must never be given out twice`);
        }
      }
      this.checkFrozen(again, 'the receipt issued after the restore');
      this.remember(again, { phase: 'restored', issuedBy: 'donor' });
      this.say(`After the restore the lost gift's receipt is issued again as ${again.number}, above the lost number`);
    }
    if (issue) {
      const fresh = await this.expect(200, 'POST', '/api/donations/me/receipts', { token: donor, json: { donationId: this.state.gifts[2] } },
        `issuing a receipt under the ${issue} images`);
      this.checkFrozen(fresh, `the receipt issued under the ${issue} images`);
      const entry = this.remember(fresh, { phase: issue, issuedBy: 'donor' });
      if ((await this.receiptStatus(entry.digest)) !== 'active') {
        fail(`the status of ${entry.number}, issued under the ${issue} images, must be active`);
      }
      this.say(`Under the ${issue} images the donor issued ${entry.number}`);
    }
  }

  forgetAfterBackup() {
    this.state.receipts = this.state.receipts.map((entry) =>
      entry.phase === 'deployed' ? entry : { ...entry, gone: true },
    );
    this.save();
  }

  async adopted() {
    const keys = await this.expect(200, 'GET', '/api/donations/receipt-keys', {}, 'the published receipt keys of the second server');
    const firstKeys = [...new Set(this.state.receipts.map((entry) => entry.keyId))];
    for (const keyId of firstKeys) {
      const listed = keys.keys.find((key) => key.keyId === keyId);
      if (listed?.status !== 'active') {
        fail(`the second server must publish the first server's key ${keyId} as active (got ${JSON.stringify(keys.keys)})`);
      }
    }
    const own = keys.keys.filter((key) => !firstKeys.includes(key.keyId) && key.status === 'active');
    if (own.length !== 1) {
      fail(`the second server must publish exactly one key of its own beside the adopted ones (got ${JSON.stringify(keys.keys)})`);
    }
    this.state.secondServerKeyId = own[0].keyId;
    this.save();
    this.say(`The second server publishes the adopted key ${firstKeys.join(', ')} and its own ${own[0].keyId}`);
    await this.check({});
  }
}

async function main(argv) {
  const { command, named } = options(argv);
  const journey = new Journey(named);
  switch (command) {
    case 'setup':
      return journey.setup();
    case 'restore-setup':
      return journey.restoreInSetup(named.dump ?? fail('--dump names the backup'), named.key ?? fail('--key names its key'));
    case 'receipts':
      return journey.receipts();
    case 'check':
      return journey.check({ issue: typeof named.issue === 'string' ? named.issue : undefined, restored: named.restored === true });
    case 'forget-after-backup':
      return journey.forgetAfterBackup();
    case 'adopted':
      return journey.adopted();
    case 'admin-session':
      return process.stdout.write((await journey.adminSession()) + '\n');
    case 'totp':
      return process.stdout.write((await journey.freshCode()) + '\n');
    default:
      fail(`unknown command ${command}: setup, restore-setup, receipts, check, forget-after-backup, adopted, admin-session or totp`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((problem) => {
    console.log(`::error::${problem instanceof JourneyFailure ? problem.message : problem.stack}`);
    process.exit(1);
  });
}
