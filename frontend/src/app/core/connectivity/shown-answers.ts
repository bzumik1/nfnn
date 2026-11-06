import { HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ShownAnswers {
  private readonly fetchedAt = signal<ReadonlyMap<string, number>>(new Map());
  private page: string | null = null;

  readonly oldest = computed(() => {
    const times = [...this.fetchedAt().values()];
    return times.length === 0 ? null : Math.min(...times);
  });

  constructor() {
    inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationStart))
      .subscribe((event) => {
        const page = pathOf(event.url);
        if (page !== this.page) {
          this.page = page;
          this.fetchedAt.set(new Map());
        }
      });
  }

  record(url: string, headers: HttpHeaders, receivedAt: number): void {
    const dated = Date.parse(headers.get('Date') ?? '');
    const at = Number.isFinite(dated) ? dated : receivedAt;
    this.fetchedAt.update((times) => new Map(times).set(url, at));
  }

  fetchedAtOf(url: string): number | null {
    return this.fetchedAt().get(url) ?? null;
  }
}

function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}
