import { BrowserPlatformLocation, Location, PlatformLocation } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Dialog } from './dialog';
import { DialogAnnouncer } from './dialog-announcer';
import { DialogHistory } from './dialog-history';
import { DIALOG_PRESENTATION, DialogPresentation } from './dialog-presentation';
import { FakeDialogHistory } from './testing/fake-dialog-history';

@Component({
  imports: [Dialog],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">Otevřít</button>
    @if (open()) {
      <app-dialog
        labelledBy="title"
        [wide]="wide()"
        [dismissible]="dismissible()"
        (dismissed)="dismissals = dismissals + 1"
      >
        <h2 id="title">Název</h2>
        <input id="first" />
      </app-dialog>
    }
  `,
})
class Host {
  readonly open = signal(false);
  readonly wide = signal(false);
  readonly dismissible = signal(true);
  dismissals = 0;
}

describe('Given a dialog opened from a button', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const native = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  const panel = () => fixture.nativeElement.querySelector('.dialog-panel') as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('when it renders, then it is open as a modal dialog named by its title', () => {
    expect(native().open).toBe(true);
    expect(native().getAttribute('aria-labelledby')).toBe('title');
  });

  it('when it renders, then it holds an empty status region of its own for messages from behind it', () => {
    const status = native().querySelector('[role="status"]');

    expect(status).not.toBeNull();
    expect(status?.textContent?.trim()).toBe('');
  });

  it('when a message is announced to the open dialog, then its own status region carries it', () => {
    TestBed.inject(DialogAnnouncer).announce('Stránku se nepodařilo otevřít.');
    fixture.detectChanges();

    expect(native().querySelector('[role="status"]')?.textContent?.trim()).toBe(
      'Stránku se nepodařilo otevřít.',
    );
  });

  it('when an announcement is withdrawn, then the status region empties and stays rendered', () => {
    const withdraw = TestBed.inject(DialogAnnouncer).announce('Stránku se nepodařilo otevřít.');
    fixture.detectChanges();

    withdraw();
    fixture.detectChanges();

    expect(native().querySelector('[role="status"]')?.textContent?.trim()).toBe('');
  });

  it('when a later announcement replaced the first, then withdrawing the first keeps the later one', () => {
    const announcer = TestBed.inject(DialogAnnouncer);
    const withdrawFirst = announcer.announce('První');
    announcer.announce('Druhá');

    withdrawFirst();
    fixture.detectChanges();

    expect(native().querySelector('[role="status"]')?.textContent?.trim()).toBe('Druhá');
  });

  it('when the browser closes it on Esc, then it asks to be dismissed', () => {
    native().close();

    expect(host.dismissals).toBe(1);
  });

  it('when the close button is pressed, then it asks to be dismissed', () => {
    (fixture.nativeElement.querySelector('.dialog-close') as HTMLButtonElement).click();

    expect(host.dismissals).toBe(1);
  });

  it('when the backdrop is clicked, then it asks to be dismissed', () => {
    native().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    native().dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(host.dismissals).toBe(1);
  });

  it('when a press starts inside the panel and ends on the backdrop, then it stays open', () => {
    panel().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    native().dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(host.dismissals).toBe(0);
  });

  it('when something inside the panel is clicked, then it stays open', () => {
    (fixture.nativeElement.querySelector('#first') as HTMLInputElement).click();

    expect(host.dismissals).toBe(0);
  });

  describe('when the page holds it open while something runs', () => {
    beforeEach(() => {
      host.dismissible.set(false);
      fixture.detectChanges();
    });

    it('then Esc is refused and it stays open', () => {
      const cancel = new Event('cancel', { cancelable: true });

      native().dispatchEvent(cancel);

      expect(cancel.defaultPrevented).toBe(true);
      expect(host.dismissals).toBe(0);
    });

    it('then the close button is disabled and the backdrop does nothing', () => {
      const close = fixture.nativeElement.querySelector('.dialog-close') as HTMLButtonElement;
      native().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      native().dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(close.disabled).toBe(true);
      expect(host.dismissals).toBe(0);
      expect(native().open).toBe(true);
    });

    it('and the browser closes it anyway, then it opens again without asking to be dismissed', () => {
      native().close();

      expect(native().open).toBe(true);
      expect(host.dismissals).toBe(0);
    });
  });

  it('when it should be wide, then the panel widens', () => {
    host.wide.set(true);
    fixture.detectChanges();

    expect(panel().classList).toContain('dialog-panel--wide');
  });

  it('when it goes away, then the focus returns to the button that opened it', () => {
    host.open.set(false);
    fixture.detectChanges();

    expect(document.activeElement?.id).toBe('opener');
  });

  it('when it goes away after the button that opened it is gone, then the focus goes to the page content instead of being lost', () => {
    const main = document.createElement('main');
    main.id = 'obsah';
    main.tabIndex = -1;
    document.body.appendChild(main);
    fixture.nativeElement.querySelector('#opener').remove();

    host.open.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(main);
    main.remove();
  });
});

@Component({
  imports: [Dialog],
  template: `
    @if (open()) {
      <app-dialog
        labelledBy="title"
        [presentation]="presentation()"
        [pushesHistory]="pushesHistory()"
        (dismissed)="dismissed()"
      >
        <h2 id="title">Název</h2>
      </app-dialog>
    }
  `,
})
class PresentedHost {
  readonly open = signal(true);
  readonly presentation = signal<DialogPresentation>('auto');
  readonly pushesHistory = signal(true);
  readonly busy = signal(false);
  dismissals = 0;

  dismissed(): void {
    this.dismissals++;
    if (!this.busy()) {
      this.open.set(false);
    }
  }
}

describe('Given a dialog and the way it is presented', () => {
  let fixture: ComponentFixture<PresentedHost>;

  const native = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  const grabber = () =>
    fixture.nativeElement.querySelector('.dialog-grabber') as HTMLElement | null;

  const render = async (
    presentation: DialogPresentation,
    areaDefault?: 'centered' | 'sheet' | 'full',
  ): Promise<void> => {
    TestBed.configureTestingModule({
      imports: [PresentedHost],
      providers: [
        { provide: DialogHistory, useClass: FakeDialogHistory },
        ...(areaDefault === undefined
          ? []
          : [{ provide: DIALOG_PRESENTATION, useValue: areaDefault }]),
      ],
    });
    fixture = TestBed.createComponent(PresentedHost);
    fixture.componentInstance.presentation.set(presentation);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  };

  afterEach(() => fixture.nativeElement.remove());

  it('when nothing chooses a presentation, then it is the centered dialog of today, without a grabber', async () => {
    await render('auto');

    expect(native().dataset['presentation']).toBe('centered');
    expect(grabber()).toBeNull();
  });

  it('when the area around it presents dialogs as sheets, then an automatic dialog becomes a sheet', async () => {
    await render('auto', 'sheet');

    expect(native().dataset['presentation']).toBe('sheet');
  });

  it('when a dialog asks to be centered inside such an area, then it stays centered', async () => {
    await render('centered', 'sheet');

    expect(native().dataset['presentation']).toBe('centered');
  });

  it('when it is a sheet, then it shows a grabber that assistive technology does not hear, and keeps its close button', async () => {
    await render('sheet');

    expect(grabber()?.getAttribute('aria-hidden')).toBe('true');
    expect(native().querySelector('.dialog-close')?.getAttribute('aria-label')).toBe('Zavřít');
  });

  it('when it should fill the screen, then it is presented full, without a grabber', async () => {
    await render('full');

    expect(native().dataset['presentation']).toBe('full');
    expect(grabber()).toBeNull();
  });
});

describe('Given a dialog and the history entry it keeps', () => {
  let fixture: ComponentFixture<PresentedHost>;
  let history: FakeDialogHistory;

  const render = async (pushesHistory = true): Promise<void> => {
    TestBed.configureTestingModule({
      imports: [PresentedHost],
      providers: [{ provide: DialogHistory, useClass: FakeDialogHistory }],
    });
    history = TestBed.inject(DialogHistory) as unknown as FakeDialogHistory;
    fixture = TestBed.createComponent(PresentedHost);
    fixture.componentInstance.pushesHistory.set(pushesHistory);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  };

  afterEach(() => fixture.nativeElement.remove());

  it('when it opens, then it asks for a history entry of its own', async () => {
    await render();

    expect(history.opened).toBe(1);
    expect(history.listener).not.toBeNull();
  });

  it('when the visitor goes back, then it asks to be dismissed', async () => {
    await render();

    history.listener?.close();
    await fixture.whenStable();

    expect(fixture.componentInstance.dismissals).toBe(1);
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
  });

  it('when the visitor goes back while the page keeps it open, then it asks for its entry again', async () => {
    await render();
    fixture.componentInstance.busy.set(true);

    history.listener?.close();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('dialog')).not.toBeNull();
    expect(history.opened).toBe(2);
    expect(history.listener).not.toBeNull();
  });

  it('when it goes away, then it gives its entry back', async () => {
    await render();
    const listener = history.listener;

    fixture.componentInstance.open.set(false);
    await fixture.whenStable();

    expect(history.closed).toBe(1);
    expect(history.listener).toBeNull();
    expect(listener).not.toBeNull();
  });

  it('when its opener keeps the history itself, then it adds no entry and gives none back', async () => {
    await render(false);

    fixture.componentInstance.open.set(false);
    await fixture.whenStable();

    expect(history.opened).toBe(0);
    expect(history.closed).toBe(0);
  });
});

@Component({ template: '' })
class Page {}

describe('Given a page with an open dialog in the browser history', () => {
  let fixture: ComponentFixture<PresentedHost>;
  let location: Location;

  const settled = async (): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      TestBed.tick();
    }
  };

  beforeEach(async () => {
    window.history.pushState(null, '', '/');
    TestBed.configureTestingModule({
      imports: [PresentedHost],
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'sprava/platby', component: Page },
        ]),
        { provide: PlatformLocation, useClass: BrowserPlatformLocation },
      ],
    });
    const router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    router.initialNavigation();
    await router.navigateByUrl('/sprava/platby');
    await settled();
    fixture = TestBed.createComponent(PresentedHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await settled();
  });

  afterEach(async () => {
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    await settled();
    fixture.nativeElement.remove();
  });

  it('when the visitor goes back, then the dialog closes and the page stays', async () => {
    window.history.go(-1);
    await settled();

    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(location.path()).toBe('/sprava/platby');
  });

  it('when the dialog is open, then the page has a history entry for it', () => {
    expect((window.history.state as Record<string, unknown>)['nfnnDialogDepth']).toBe(1);
  });

  it('when the dialog closes by its button, then its entry is taken back and the page stays', async () => {
    (fixture.nativeElement.querySelector('.dialog-close') as HTMLButtonElement).click();
    await settled();

    expect(
      (window.history.state as Record<string, unknown> | null)?.['nfnnDialogDepth'],
    ).toBeUndefined();
    expect(location.path()).toBe('/sprava/platby');
    window.history.go(-1);
    await settled();
    expect(location.path()).toBe('');
  });

  it('when the visitor goes back while the page keeps the dialog open, then it stays open and the next Back still closes it', async () => {
    fixture.componentInstance.busy.set(true);

    window.history.go(-1);
    await settled();

    expect(fixture.nativeElement.querySelector('dialog')).not.toBeNull();
    expect((window.history.state as Record<string, unknown>)['nfnnDialogDepth']).toBe(1);
    expect(location.path()).toBe('/sprava/platby');
    fixture.componentInstance.busy.set(false);
    window.history.go(-1);
    await settled();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(location.path()).toBe('/sprava/platby');
  });
});
