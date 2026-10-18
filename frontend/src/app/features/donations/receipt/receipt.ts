import { Component, input, output } from '@angular/core';
import { formatCrowns } from '../donation-amount';

export interface ReceiptPayment {
  readonly id: string;
  readonly receiptNumber: string | null;
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

  protected formatAmount(value: number): string {
    return formatCrowns(value);
  }

  close(): void {
    this.closed.emit();
  }

  print(): void {
    window.print();
  }
}
