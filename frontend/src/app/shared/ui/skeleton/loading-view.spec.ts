import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Connectivity } from '../../../core/connectivity/connectivity';
import { LOADING_TIMINGS, LoadingTimings, loadingView } from './loading-view';

type PageState = 'loading' | 'ready' | 'error';

@Component({
  template: `
    <section class="card" [attr.aria-busy]="view.busy() ? 'true' : null">
      @switch (view.state()) {
        @case ('loading') {
          <p class="loading">Načítáme…</p>
          @if (view.skeleton()) {
            <div class="skeleton"></div>
          }
        }
        @case ('ready') {
          <p class="content" [class.appears]="view.appears()">Obsah</p>
        }
        @case ('error') {
          <p class="failure">Nepovedlo se.</p>
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Page {
  readonly state = signal<PageState>('loading');
  readonly view = loadingView(
    this.state,
    (state) => state === 'loading',
    (state) => state === 'error',
  );
}

describe('Given a page that loads its data behind a skeleton', () => {
  let fixture: ComponentFixture<Page>;
  const offline = signal(false);
  let timings: LoadingTimings | null;

  beforeEach(() => {
    offline.set(false);
    timings = { delayMs: 300, minimumMs: 400, appearMs: 300 };
    TestBed.configureTestingModule({
      providers: [
        { provide: Connectivity, useValue: { offline } },
        { provide: LOADING_TIMINGS, useValue: () => timings },
      ],
    });
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(Page);
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  async function answer(state: PageState): Promise<void> {
    fixture.componentInstance.state.set(state);
    await settle();
  }

  const element = (selector: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(selector);

  it('when the data arrive before the delay, then no skeleton ever shows and the content shows at once without appearing', async () => {
    await open();
    await wait(200);
    expect(element('.loading')).not.toBeNull();
    expect(element('.skeleton')).toBeNull();

    await answer('ready');

    expect(element('.loading')).toBeNull();
    expect(element('.skeleton')).toBeNull();
    expect(element('.content')?.classList).not.toContain('appears');
  });

  it('when the page opens, then its card is busy at once and stops being busy once the content shows', async () => {
    await open();
    expect(element('.card')?.getAttribute('aria-busy')).toBe('true');

    await wait(300);
    await answer('ready');
    expect(element('.card')?.getAttribute('aria-busy')).toBe('true');

    await wait(400);
    expect(element('.card')?.hasAttribute('aria-busy')).toBe(false);
  });

  it('when the loading lasts, then the skeleton shows only once the delay has passed', async () => {
    await open();

    await wait(299);
    expect(element('.skeleton')).toBeNull();

    await wait(1);
    expect(element('.skeleton')).not.toBeNull();
  });

  it('when the data arrive soon after the skeleton showed, then the skeleton stays its minimum and the content then appears', async () => {
    await open();
    await wait(300);
    await wait(100);

    await answer('ready');
    expect(element('.skeleton')).not.toBeNull();
    expect(element('.content')).toBeNull();

    await wait(299);
    expect(element('.skeleton')).not.toBeNull();

    await wait(1);
    expect(element('.skeleton')).toBeNull();
    expect(element('.content')?.classList).toContain('appears');
  });

  it('when the data arrive after the skeleton stood its minimum, then the content appears at once', async () => {
    await open();
    await wait(300);
    await wait(500);

    await answer('ready');

    expect(element('.skeleton')).toBeNull();
    expect(element('.content')?.classList).toContain('appears');
  });

  it('when a failure follows a shown skeleton, then the failure shows at once without the minimum', async () => {
    await open();
    await wait(300);

    await answer('error');

    expect(element('.skeleton')).toBeNull();
    expect(element('.failure')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('when the page loads again after a failure that followed a skeleton, then fast content shows without appearing', async () => {
    await open();
    await wait(300);
    await answer('error');

    await answer('loading');
    await wait(100);
    await answer('ready');

    expect(element('.content')?.classList).not.toContain('appears');
  });

  it('when the app is offline as the loading ends, then the offline state shows at once', async () => {
    await open();
    await wait(300);
    offline.set(true);

    await answer('error');

    expect(element('.skeleton')).toBeNull();
    expect(element('.failure')).not.toBeNull();
  });

  it('when the page loads again after an appearance, then the next content shows without appearing if it is fast', async () => {
    await open();
    await wait(800);
    await answer('ready');
    expect(element('.content')?.classList).toContain('appears');

    await answer('loading');
    await wait(100);
    await answer('ready');

    expect(element('.content')?.classList).not.toContain('appears');
  });

  it('when the content has stood as long as its appearance, then drawing it again does not appear again', async () => {
    await open();
    await wait(800);
    await answer('ready');

    await wait(299);
    expect(element('.content')?.classList).toContain('appears');

    await wait(1);
    expect(element('.content')?.classList).not.toContain('appears');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('when the page is left while its content appears, then the appearance timer is cancelled', async () => {
    await open();
    await wait(800);
    await answer('ready');

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('when the page is left while the skeleton holds, then its timer is cancelled', async () => {
    await open();
    await wait(300);
    await answer('ready');

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('when the theme names no timings, then the page keeps its plain loading line without a skeleton', async () => {
    timings = null;
    await open();

    await wait(1000);

    expect(element('.loading')).not.toBeNull();
    expect(element('.skeleton')).toBeNull();
  });
});
