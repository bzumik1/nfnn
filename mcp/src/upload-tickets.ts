import { createHash, randomBytes } from 'node:crypto';

export const TICKET_LIFETIME_MS = 10 * 60 * 1000;
const MAX_LIVE_TICKETS = 100;

export interface TicketHolder {
  readonly apiToken: string;
  readonly donorId: string;
  readonly expiresAt: number;
}

export interface IssuedTicket {
  readonly ticket: string;
  readonly expiresAt: Date;
}

interface StoredTicket {
  readonly holder: TicketHolder;
  readonly expiresAt: number;
}

export class UploadTickets {
  private readonly tickets = new Map<string, StoredTicket>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  issue(holder: TicketHolder): IssuedTicket {
    const now = this.now();
    this.evictExpired(now);
    while (this.tickets.size >= MAX_LIVE_TICKETS) {
      const [oldest] = this.tickets.keys();
      this.tickets.delete(oldest as string);
    }
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = Math.min(now + TICKET_LIFETIME_MS, holder.expiresAt * 1000);
    this.tickets.set(hash(ticket), { holder, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt) };
  }

  redeem(ticket: string): TicketHolder | undefined {
    const key = hash(ticket);
    const stored = this.tickets.get(key);
    this.tickets.delete(key);
    if (stored === undefined || stored.expiresAt <= this.now()) {
      return undefined;
    }
    return stored.holder;
  }

  private evictExpired(now: number): void {
    for (const [key, stored] of this.tickets) {
      if (stored.expiresAt <= now) {
        this.tickets.delete(key);
      }
    }
  }
}

function hash(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}
