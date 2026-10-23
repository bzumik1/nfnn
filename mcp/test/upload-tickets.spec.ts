import { describe, expect, it } from 'vitest';
import { UploadTickets } from '../src/upload-tickets.js';

const NOW = Date.parse('2026-10-23T07:00:00Z');
const HOLDER = { apiToken: 'api', donorId: 'donor-jana', expiresAt: NOW / 1000 + 900 };

describe('Given the upload tickets of the connector', () => {
  it('when a ticket is redeemed, then it gives its holder once', () => {
    const tickets = new UploadTickets(() => NOW);
    const { ticket, expiresAt } = tickets.issue(HOLDER);
    expect(expiresAt.toISOString()).toBe('2026-10-23T07:10:00.000Z');
    expect(tickets.redeem(ticket)).toEqual(HOLDER);
    expect(tickets.redeem(ticket)).toBeUndefined();
    expect(tickets.redeem('unknown')).toBeUndefined();
  });

  it('when ten minutes pass, or the API token ends sooner, then the ticket no longer works', () => {
    const clock = { now: NOW };
    const tickets = new UploadTickets(() => clock.now);
    const long = tickets.issue(HOLDER).ticket;
    const short = tickets.issue({ ...HOLDER, expiresAt: NOW / 1000 + 120 });
    expect(short.expiresAt.toISOString()).toBe('2026-10-23T07:02:00.000Z');
    clock.now += 120_000;
    expect(tickets.redeem(short.ticket)).toBeUndefined();
    clock.now += 479_999;
    expect(tickets.redeem(long)).toEqual(HOLDER);
    const late = tickets.issue(HOLDER).ticket;
    clock.now += 600_000;
    expect(tickets.redeem(late)).toBeUndefined();
  });

  it('when more than a hundred tickets are live, then the oldest stops working', () => {
    const tickets = new UploadTickets(() => NOW);
    const first = tickets.issue(HOLDER).ticket;
    const rest = Array.from({ length: 100 }, () => tickets.issue(HOLDER).ticket);
    expect(tickets.redeem(first)).toBeUndefined();
    expect(tickets.redeem(rest[0] ?? '')).toEqual(HOLDER);
  });
});
