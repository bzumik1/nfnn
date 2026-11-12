import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';

export const LOGS_URL = '/api/admin/operations/logs';
export const LOGGERS_URL = '/api/admin/operations/loggers';
export const DIAGNOSTICS_URL = '/api/admin/operations/diagnostics';

export function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

export class LogPageHarness {
  private constructor(
    readonly fixture: ComponentFixture<unknown>,
    readonly http: HttpTestingController,
  ) {}

  static async open(path: string, page: Type<unknown>, pattern = path): Promise<LogPageHarness> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: pattern.replace(/^\//, '').replace(/\?.*$/, ''), component: page }]),
      ],
    });
    localStorage.clear();
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('admin@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    const router = await RouterTestingHarness.create(path);
    const harness = new LogPageHarness(router.fixture, http);
    await harness.settle();
    return harness;
  }

  get url(): string {
    return TestBed.inject(Router).url;
  }

  element<T extends HTMLElement>(selector: string): T {
    const found = this.fixture.nativeElement.querySelector(selector) as T | null;
    if (found === null) {
      throw new Error(`No element matches ${selector}`);
    }
    return found;
  }

  has(selector: string): boolean {
    return this.fixture.nativeElement.querySelector(selector) !== null;
  }

  text(selector: string): string {
    return readable(this.fixture.nativeElement.querySelector(selector));
  }

  texts(selector: string): string[] {
    return Array.from(
      this.fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>,
    ).map((node) => readable(node));
  }

  links(selector = 'a'): { text: string; href: string }[] {
    return Array.from(
      this.fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLAnchorElement>,
    ).map((link) => ({ text: readable(link), href: link.getAttribute('href') ?? '' }));
  }

  button(name: string): HTMLButtonElement {
    const found = this.buttons().find(
      (candidate) =>
        squash(candidate.textContent) === name || candidate.getAttribute('aria-label') === name,
    );
    if (found === undefined) {
      throw new Error(`No button ${name}`);
    }
    return found;
  }

  hasButton(name: string): boolean {
    return this.buttons().some((candidate) => squash(candidate.textContent) === name);
  }

  async settle(): Promise<void> {
    this.fixture.detectChanges();
    await this.fixture.whenStable();
    this.fixture.detectChanges();
  }

  async type(selector: string, value: string): Promise<void> {
    const control = this.element<HTMLInputElement>(selector);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    control.dispatchEvent(new Event('change'));
    control.dispatchEvent(new Event('blur'));
    await this.settle();
  }

  async choose(selector: string, index: number): Promise<void> {
    const select = this.element<HTMLSelectElement>(selector);
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    select.dispatchEvent(new Event('blur'));
    await this.settle();
  }

  async submit(selector: string): Promise<void> {
    this.element<HTMLFormElement>(selector).dispatchEvent(new Event('submit'));
    await this.settle();
  }

  async click(name: string): Promise<void> {
    this.button(name).click();
    await this.settle();
  }

  private buttons(): HTMLButtonElement[] {
    return Array.from(
      this.fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    );
  }
}

function readable(node: Node | null): string {
  return squash(node === null ? '' : spoken(node));
}

function spoken(node: Node): string {
  return Array.from(node.childNodes)
    .map((child) =>
      child.nodeType === Node.TEXT_NODE ? (child.textContent ?? '') : ` ${spoken(child)} `,
    )
    .join('');
}

function squash(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}
