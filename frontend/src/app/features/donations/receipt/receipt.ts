import { Component, input, output } from '@angular/core';

export interface ReceiptPayment {
  readonly id: number | string;
  readonly date: string;
  readonly amount: number;
  readonly purpose: string;
  readonly status: string;
}

export interface ReceiptYearSummary {
  readonly year: string;
  readonly total: number;
  readonly payments: readonly ReceiptPayment[];
}

export interface ReceiptUser {
  readonly name: string;
  readonly email: string;
}

export type ReceiptInput =
  | { kind: 'single'; payment: ReceiptPayment }
  | { kind: 'summary'; summary: ReceiptYearSummary };

@Component({
  selector: 'app-receipt',
  templateUrl: './receipt.html',
  styleUrl: './receipt.scss',
})
export class Receipt {
  readonly data = input.required<ReceiptInput>();
  readonly user = input.required<ReceiptUser>();
  readonly closed = output<void>();

  protected get isSummary(): boolean {
    return this.data().kind === 'summary';
  }

  protected get summary(): ReceiptYearSummary | null {
    const value = this.data();
    return value.kind === 'summary' ? value.summary : null;
  }

  protected get single(): ReceiptPayment | null {
    const value = this.data();
    return value.kind === 'single' ? value.payment : null;
  }

  protected formatId(id: number | string): string {
    if (typeof id === 'string') {
      return id;
    }
    return String(id).padStart(6, '0');
  }

  protected formatAmount(value: number): string {
    return value.toLocaleString('cs-CZ');
  }

  close(): void {
    this.closed.emit();
  }

  print(): void {
    window.print();
  }
}
