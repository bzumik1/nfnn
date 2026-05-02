import { Component, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  Receipt,
  ReceiptInput,
  ReceiptPayment,
  ReceiptUser,
} from '../../donations/receipt/receipt';

@Component({
  selector: 'app-donor-dashboard',
  imports: [Receipt, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DonorDashboard {
  protected readonly user: ReceiptUser = {
    name: 'Demo dárce',
    email: 'demo@novanaděje.cz',
  };

  protected readonly payments: readonly ReceiptPayment[] = [
    { id: 1, date: '15. 03. 2026', amount: 500, purpose: 'Obecný příspěvek', status: 'Přijato' },
    { id: 2, date: '10. 01. 2026', amount: 1000, purpose: 'Projekt Dominik', status: 'Přijato' },
    { id: 3, date: '05. 11. 2025', amount: 250, purpose: 'Obecný příspěvek', status: 'Přijato' },
    { id: 4, date: '20. 08. 2025', amount: 2000, purpose: 'Projekt Anička', status: 'Přijato' },
  ];

  protected readonly total = computed(() =>
    this.payments.reduce((sum, p) => sum + p.amount, 0),
  );

  protected readonly years = computed(() => {
    const set = new Set(this.payments.map((p) => p.date.split('. ')[2]));
    return [...set].sort((a, b) => Number(b) - Number(a));
  });

  protected readonly selectedYear = signal<string>('');
  protected readonly selectedReceipt = signal<ReceiptInput | null>(null);

  protected readonly yearPayments = computed(() =>
    this.payments.filter((p) => p.date.split('. ')[2] === this.selectedYear()),
  );

  protected readonly yearTotal = computed(() =>
    this.yearPayments().reduce((sum, p) => sum + p.amount, 0),
  );

  constructor(private readonly router: Router) {
    this.selectedYear.set(this.years()[0] ?? '');
  }

  protected formatAmount(value: number): string {
    return value.toLocaleString('cs-CZ');
  }

  protected selectYear(year: string): void {
    this.selectedYear.set(year);
  }

  protected openYearReceipt(): void {
    this.selectedReceipt.set({
      kind: 'summary',
      summary: {
        year: this.selectedYear(),
        total: this.yearTotal(),
        payments: this.yearPayments(),
      },
    });
  }

  protected openSingleReceipt(payment: ReceiptPayment): void {
    this.selectedReceipt.set({ kind: 'single', payment });
  }

  protected closeReceipt(): void {
    this.selectedReceipt.set(null);
  }

  protected logout(): void {
    this.router.navigateByUrl('/');
  }

  protected contributionsLabel(count: number): string {
    if (count === 1) return 'příspěvek';
    if (count < 5) return 'příspěvky';
    return 'příspěvků';
  }
}
