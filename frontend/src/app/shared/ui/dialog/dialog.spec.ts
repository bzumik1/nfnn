import { BrowserPlatformLocation, Location, PlatformLocation } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { InputModality } from '../../../core/input/input-modality';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { Dialog } from './dialog';
import { SuspendsDialogs } from './dialog-suspension';
import { DialogAnnouncer } from './dialog-announcer';
import { DialogHistory } from './dialog-history';
import { DIALOG_PRESENTATION, DialogPresentation } from './dialog-presentation';
import { FakeDialogHistory } from './testing/fake-dialog-history';

const realMatchMedia = window.matchMedia;

function deviceAsksForLessMotion(less: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: less && query === '(prefers-reduced-motion: reduce)',
    media: query,
  })) as typeof window.matchMedia;
}

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
    <button type="button" id="opener" (click)="open.set(true)">Otevřít</button>
    @if (open()) {
      <app-dialog labelledBy="title" (dismissed)="open.set(false)">
        <h2 id="title">Název</h2>
        <input id="field" [attr.autofocus]="fieldTakesFocus() ? '' : null" />
      </app-dialog>
    }
  `,
})
class PressedHost {
  readonly open = signal(false);
  readonly fieldTakesFocus = signal(false);
}

describe('Given a dialog and the press that opens it', () => {
  let fixture: ComponentFixture<PressedHost>;
  let modality: InputModality;

  const opener = () => fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
  const native = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

  const openBy = (press: Event): void => {
    opener().focus();
    opener().dispatchEvent(press);
    opener().click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PressedHost],
      providers: [{ provide: DialogHistory, useClass: FakeDialogHistory }],
    });
    modality = TestBed.inject(InputModality);
    modality.start();
    fixture = TestBed.createComponent(PressedHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    modality.stop();
    fixture.nativeElement.remove();
  });

  const title = () => fixture.nativeElement.querySelector('#title') as HTMLElement;

  it('when a finger or a mouse opens it, then its title holds the focus, so no control shows a focus ring nobody asked for', () => {
    openBy(new Event('pointerdown', { bubbles: true }));

    expect(document.activeElement).toBe(title());
  });

  it('when a finger or a mouse opens it, then its title and the dialog itself stay out of the tab order', () => {
    openBy(new Event('pointerdown', { bubbles: true }));

    expect(title().getAttribute('tabindex')).toBe('-1');
    expect(native().getAttribute('tabindex')).toBe('-1');
  });

  it('when the keyboard opens it, then the browser moves the focus into it as before', () => {
    openBy(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

    expect(document.activeElement).not.toBe(native());
  });

  it('when a finger opens it and a field asks for the focus, then its title takes the focus all the same, so the field shows no ring after a tap', () => {
    fixture.componentInstance.fieldTakesFocus.set(true);

    openBy(new Event('pointerdown', { bubbles: true }));

    expect(document.activeElement).toBe(title());
  });

  it('when the keyboard opens it and a field asks for the focus, then the field takes it', () => {
    fixture.componentInstance.fieldTakesFocus.set(true);

    openBy(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

    expect(document.activeElement?.id).toBe('field');
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
        [dismissible]="!locked()"
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
  readonly locked = signal(false);
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

describe('Given a dialog presented as a sheet that the visitor drags by its top edge', () => {
  let fixture: ComponentFixture<PresentedHost>;

  const grabber = () => fixture.nativeElement.querySelector('.dialog-grabber') as HTMLElement;
  const panel = () => fixture.nativeElement.querySelector('.dialog-panel') as HTMLElement;
  const pointer = (
    type: string,
    clientY: number,
    timeStamp: number,
    { pointerId = 1, button = 0 } = {},
  ): Event => {
    const event = new MouseEvent(type, { bubbles: true, clientY, button });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      isPrimary: { value: pointerId === 1 },
      timeStamp: { value: timeStamp },
    });
    return event;
  };
  const dragTo = async (clientY: number, timeStamp: number, pointerId = 1): Promise<void> => {
    grabber().dispatchEvent(pointer('pointermove', clientY, timeStamp, { pointerId }));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const press = (clientY = 100, button = 0): void => {
    grabber().dispatchEvent(pointer('pointerdown', clientY, 0, { button }));
  };
  const release = async (): Promise<void> => {
    grabber().dispatchEvent(pointer('pointerup', 0, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PresentedHost],
      providers: [{ provide: DialogHistory, useClass: FakeDialogHistory }],
    });
    fixture = TestBed.createComponent(PresentedHost);
    fixture.componentInstance.presentation.set('sheet');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('when the finger moves down, then the sheet follows it without easing', async () => {
    press();
    await dragTo(160, 100);

    expect(panel().style.translate).toBe('0 60px');
    expect(panel().classList).toContain('dialog-panel--dragging');
  });

  it('when the finger lets go far enough down, then the sheet asks to be dismissed', async () => {
    press();
    await dragTo(260, 1000);
    await release();

    expect(fixture.componentInstance.dismissals).toBe(1);
  });

  it('when the finger lets go after a short way, then the sheet eases back and stays open', async () => {
    press();
    await dragTo(130, 1000);
    await release();

    expect(fixture.componentInstance.dismissals).toBe(0);
    expect(panel().style.translate).toBe('');
    expect(panel().classList).not.toContain('dialog-panel--dragging');
  });

  it('when the browser takes the gesture over, then the sheet returns and stays open', async () => {
    press();
    await dragTo(300, 1000);
    grabber().dispatchEvent(pointer('pointercancel', 0, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance.dismissals).toBe(0);
    expect(panel().style.translate).toBe('');
  });

  it('when the page holds the sheet open while something runs, then a drag only stretches it and it returns', async () => {
    fixture.componentInstance.locked.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    press();
    await dragTo(400, 1000);
    const stretched = parseFloat(panel().style.translate.split(' ')[1]);
    await release();

    expect(stretched).toBeGreaterThan(0);
    expect(stretched).toBeLessThan(100);
    expect(fixture.componentInstance.dismissals).toBe(0);
    expect(panel().style.translate).toBe('');
  });

  it('when another finger moves during the drag, then the sheet follows only the first one', async () => {
    press();
    await dragTo(160, 100);
    await dragTo(400, 120, 2);

    expect(panel().style.translate).toBe('0 60px');
  });

  it('when the drag is pressed with another mouse button than the main one, then the sheet stays put', async () => {
    press(100, 2);
    await dragTo(300, 1000);

    expect(panel().style.translate).toBe('');
  });

  it('when the grabber loses the pointer, then the sheet returns and stays open', async () => {
    press();
    await dragTo(300, 1000);
    grabber().dispatchEvent(pointer('lostpointercapture', 0, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance.dismissals).toBe(0);
    expect(panel().style.translate).toBe('');
  });
});

@Component({
  imports: [Dialog],
  template: `
    @if (open()) {
      <app-dialog
        labelledBy="pulled-title"
        presentation="sheet"
        [dismissible]="!locked()"
        [unsavedInput]="unsaved()"
        (dismissed)="dismissed()"
      >
        <h2 id="pulled-title">Údaje</h2>
        <p id="pulled-text">Text listu</p>
        <input id="pulled-field" />
      </app-dialog>
    }
  `,
})
class PulledHost {
  readonly open = signal(true);
  readonly locked = signal(false);
  readonly unsaved = signal(false);
  dismissals = 0;

  dismissed(): void {
    this.dismissals++;
    this.open.set(false);
  }
}

describe('Given a sheet whose content the visitor pulls with a finger', () => {
  let fixture: ComponentFixture<PulledHost>;

  const panel = () => fixture.nativeElement.querySelector('.dialog-panel') as HTMLElement;
  const text = () => fixture.nativeElement.querySelector('#pulled-text') as HTMLElement;
  const question = () =>
    document.querySelector('dialog[role="alertdialog"]') as HTMLDialogElement | null;
  const touch = (
    type: string,
    target: Element,
    points: readonly (readonly [number, number])[],
    timeStamp: number,
  ): Event => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) },
      timeStamp: { value: timeStamp },
    });
    target.dispatchEvent(event);
    return event;
  };
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  const pull = async (to: number, from = 100): Promise<Event> => {
    touch('touchstart', text(), [[100, from]], 0);
    touch('touchmove', text(), [[100, from + 20]], 20);
    const last = touch('touchmove', text(), [[100, to]], 40);
    fixture.detectChanges();
    await fixture.whenStable();
    return last;
  };
  const letGo = async (): Promise<void> => {
    touch('touchend', text(), [], 400);
    await settle();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PulledHost],
      providers: [
        { provide: DialogHistory, useClass: FakeDialogHistory },
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    deviceAsksForLessMotion(false);
    fixture = TestBed.createComponent(PulledHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
    fixture.nativeElement.remove();
  });

  it('when the content is at its top and the finger moves down, then the sheet follows it and the content does not scroll', async () => {
    const move = await pull(160);

    expect(panel().style.translate).toBe('0 60px');
    expect(move.defaultPrevented).toBe(true);
  });

  it('when the finger lets go far enough down, then the sheet slides away, cannot be pressed meanwhile and asks to be dismissed', async () => {
    await pull(400);
    touch('touchend', text(), [], 400);
    fixture.detectChanges();

    expect(panel().inert).toBe(true);
    expect(panel().style.translate).toBe('0 100%');
    expect(panel().classList).not.toContain('dialog-panel--dragging');
    await settle();
    expect(fixture.componentInstance.dismissals).toBe(1);
  });

  it('when the finger lets go after a short way, then the sheet returns and stays open', async () => {
    await pull(140);
    await letGo();

    expect(fixture.componentInstance.dismissals).toBe(0);
    expect(panel().style.translate).toBe('');
  });

  it('when the content is scrolled down, then the finger scrolls it and the sheet stays', async () => {
    panel().scrollTop = 50;

    const move = await pull(400);

    expect(panel().style.translate).toBe('');
    expect(move.defaultPrevented).toBe(false);
  });

  it('when the finger first moves up, then it scrolls the content until it lets go, even when it comes back down', async () => {
    touch('touchstart', text(), [[100, 300]], 0);
    touch('touchmove', text(), [[100, 260]], 20);
    const back = touch('touchmove', text(), [[100, 500]], 40);
    fixture.detectChanges();

    expect(panel().style.translate).toBe('');
    expect(back.defaultPrevented).toBe(false);
  });

  it('when a second finger touches during the pull, then the sheet returns and stays open', async () => {
    await pull(300);
    touch(
      'touchstart',
      text(),
      [
        [100, 300],
        [200, 300],
      ],
      60,
    );
    await letGo();

    expect(fixture.componentInstance.dismissals).toBe(0);
    expect(panel().style.translate).toBe('');
  });

  it('when the page holds the sheet open while something runs, then the pull only stretches it and it returns', async () => {
    fixture.componentInstance.locked.set(true);
    fixture.detectChanges();

    await pull(500);
    const stretched = parseFloat(panel().style.translate.split(' ')[1]);
    await letGo();

    expect(stretched).toBeLessThan(100);
    expect(fixture.componentInstance.dismissals).toBe(0);
    expect(question()).toBeNull();
  });

  describe('when it holds unsaved input and is pulled far down', () => {
    beforeEach(async () => {
      fixture.componentInstance.unsaved.set(true);
      fixture.detectChanges();
      await pull(500);
      await letGo();
    });

    it('then it returns and asks whether to discard the input, offering to keep writing first', () => {
      expect(fixture.componentInstance.dismissals).toBe(0);
      expect(panel().style.translate).toBe('');
      expect(question()?.open).toBe(true);
      expect(
        document.getElementById(question()!.getAttribute('aria-labelledby')!)?.textContent?.trim(),
      ).toBe('Zahodit rozepsané údaje?');
      expect(document.activeElement?.textContent?.trim()).toBe('Pokračovat v psaní');
    });

    it('and the visitor keeps writing, then the question closes and the sheet stays open', async () => {
      (document.activeElement as HTMLButtonElement).click();
      await settle();

      expect(question()).toBeNull();
      expect(fixture.componentInstance.dismissals).toBe(0);
    });

    it('and the visitor discards it, then the sheet asks to be dismissed', async () => {
      const discard = Array.from(question()!.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Zahodit',
      )!;
      discard.click();
      await settle();

      expect(fixture.componentInstance.dismissals).toBe(1);
    });
  });

  it('when it holds unsaved input and the close button is pressed, then it asks to be dismissed without a question', async () => {
    fixture.componentInstance.unsaved.set(true);
    fixture.detectChanges();

    (panel().querySelector('.dialog-close') as HTMLButtonElement).click();
    await settle();

    expect(fixture.componentInstance.dismissals).toBe(1);
    expect(question()).toBeNull();
  });
});

describe('Given a sheet on a phone that the visitor closes', () => {
  let fixture: ComponentFixture<PresentedHost>;
  let history: FakeDialogHistory;

  const native = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement | null;
  const panel = () => fixture.nativeElement.querySelector('.dialog-panel') as HTMLElement;
  const closeButton = () => panel().querySelector('.dialog-close') as HTMLButtonElement;
  const host = () => fixture.componentInstance;
  const render = (): void => {
    fixture.detectChanges();
  };
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const expectSliding = (): void => {
    expect(native()?.open).toBe(true);
    expect(native()?.classList).toContain('dialog--leaving');
    expect(panel().style.translate).toBe('0 100%');
    expect(panel().inert).toBe(true);
    expect(host().dismissals).toBe(0);
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PresentedHost],
      providers: [
        { provide: DialogHistory, useClass: FakeDialogHistory },
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    history = TestBed.inject(DialogHistory) as unknown as FakeDialogHistory;
    deviceAsksForLessMotion(false);
    fixture = TestBed.createComponent(PresentedHost);
    host().presentation.set('sheet');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
    fixture.nativeElement.remove();
  });

  it('when the close button is pressed, then it slides down out of reach first and asks to be dismissed only once it is down', async () => {
    closeButton().click();
    render();

    expectSliding();
    await settle();
    expect(host().dismissals).toBe(1);
    expect(native()).toBeNull();
  });

  it('when the close button is pressed twice, then it asks to be dismissed once', async () => {
    closeButton().click();
    render();
    closeButton().click();
    await settle();

    expect(host().dismissals).toBe(1);
  });

  it('when the visitor goes back, then it slides down and asks for no new history entry', async () => {
    history.listener?.close();
    render();

    expectSliding();
    await settle();
    expect(host().dismissals).toBe(1);
    expect(history.opened).toBe(1);
  });

  it('when the visitor goes back while it slides down, then it asks to be dismissed once and for no new history entry', async () => {
    closeButton().click();
    render();
    history.listener?.close();
    await settle();

    expect(host().dismissals).toBe(1);
    expect(history.opened).toBe(1);
  });

  it('when Esc is pressed, then the browser is kept from hiding it and it slides down', async () => {
    const cancel = new Event('cancel', { cancelable: true });
    native()!.dispatchEvent(cancel);
    render();

    expect(cancel.defaultPrevented).toBe(true);
    expectSliding();
    await settle();
    expect(host().dismissals).toBe(1);
  });

  it('when the browser closes it while it slides down, then it asks to be dismissed at once and only once', async () => {
    closeButton().click();
    render();
    native()!.close();
    native()!.dispatchEvent(new Event('close'));

    expect(host().dismissals).toBe(1);
    await settle();
    expect(host().dismissals).toBe(1);
  });

  describe('when the page keeps it open after it slid down', () => {
    beforeEach(() => host().busy.set(true));

    it('then it comes back up and can be pressed again', async () => {
      closeButton().click();
      await settle();

      expect(host().dismissals).toBe(1);
      expect(native()?.open).toBe(true);
      expect(native()?.classList).not.toContain('dialog--leaving');
      expect(panel().style.translate).toBe('');
      expect(panel().inert).toBe(false);
    });

    it('and it was closed by going back, then it asks for its history entry again', async () => {
      history.listener?.close();
      await settle();

      expect(host().dismissals).toBe(1);
      expect(history.opened).toBe(2);
      expect(history.listener).not.toBeNull();
    });
  });

  it('when the visitor asks for less motion, then it asks to be dismissed at once without sliding', () => {
    deviceAsksForLessMotion(true);

    closeButton().click();

    expect(host().dismissals).toBe(1);
  });
});

@Component({
  imports: [Dialog],
  template: `
    <app-dialog labelledBy="long-title" presentation="sheet">
      <h2 id="long-title">Dlouhý list</h2>
      <label for="far-field">Hledat</label>
      <input id="far-field" />
      <div class="ui-dialog__actions" style="position: sticky">
        <button type="button">Uložit</button>
      </div>
    </app-dialog>
  `,
})
class LongSheetHost {}

describe('Given a long sheet whose buttons stay at its bottom edge', () => {
  let fixture: ComponentFixture<LongSheetHost>;
  let scrolled: number[];

  const box = (element: Element, top: number, bottom: number): void => {
    element.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LongSheetHost],
      providers: [{ provide: DialogHistory, useClass: FakeDialogHistory }],
    });
    fixture = TestBed.createComponent(LongSheetHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    scrolled = [];
    const panel = fixture.nativeElement.querySelector('.dialog-panel') as HTMLElement;
    panel.scrollBy = ((options: ScrollToOptions) => scrolled.push(options.top ?? 0)) as never;
    box(fixture.nativeElement.querySelector('.ui-dialog__actions'), 540, 640);
  });

  afterEach(() => fixture.nativeElement.remove());

  it('when a field under the buttons takes the focus, then the sheet scrolls it above them', () => {
    const field = fixture.nativeElement.querySelector('#far-field') as HTMLInputElement;
    box(field, 582, 622);

    field.focus();

    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]).toBeGreaterThanOrEqual(622 - 540);
  });

  it('when a field above the buttons takes the focus, then the sheet stays where it is', () => {
    const field = fixture.nativeElement.querySelector('#far-field') as HTMLInputElement;
    box(field, 300, 340);

    field.focus();

    expect(scrolled).toEqual([]);
  });

  it('when one of the buttons takes the focus, then the sheet stays where it is', () => {
    const button = fixture.nativeElement.querySelector('.ui-dialog__actions button') as HTMLElement;
    box(button, 560, 600);

    button.focus();

    expect(scrolled).toEqual([]);
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

@Component({
  imports: [Dialog],
  template: `
    <app-dialog labelledBy="title" [depth]="depth()" (steppedBack)="steppedBack()">
      <h2 id="title">Název</h2>
    </app-dialog>
  `,
})
class SteppedHost {
  readonly depth = signal(0);
  readonly keepsStep = signal(false);
  stepsBack = 0;

  steppedBack(): void {
    this.stepsBack++;
    if (!this.keepsStep()) {
      this.depth.set(0);
    }
  }
}

describe('Given a dialog whose page moves on to a further step inside it', () => {
  let fixture: ComponentFixture<SteppedHost>;
  let history: FakeDialogHistory;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SteppedHost],
      providers: [{ provide: DialogHistory, useClass: FakeDialogHistory }],
    });
    history = TestBed.inject(DialogHistory) as unknown as FakeDialogHistory;
    fixture = TestBed.createComponent(SteppedHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('when the page moves one step deeper, then the dialog asks for a history step of its own', async () => {
    fixture.componentInstance.depth.set(1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(history.steps.at(-1)).toBe(1);
  });

  it('when the visitor goes back from that step, then the page is told to step back and the dialog stays open', async () => {
    fixture.componentInstance.depth.set(1);
    fixture.detectChanges();
    await fixture.whenStable();

    history.listener?.stepBack();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.stepsBack).toBe(1);
    expect(history.steps.at(-1)).toBe(0);
    expect(fixture.nativeElement.querySelector('dialog')?.open).toBe(true);
  });

  it('when the page keeps its step after the visitor went back, then the dialog asks for that step again', async () => {
    fixture.componentInstance.depth.set(1);
    fixture.componentInstance.keepsStep.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const showStep = vi.spyOn(history, 'showStep');

    history.listener?.stepBack();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(showStep).toHaveBeenCalledWith(1, history.listener);
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

@Component({
  imports: [Dialog, SuspendsDialogs],
  template: `
    <div [appSuspendsDialogs]="suspended()">
      @if (open()) {
        <app-dialog labelledBy="kept-title" (dismissed)="dismissals = dismissals + 1">
          <h2 id="kept-title">Odejít bez uložení?</h2>
        </app-dialog>
      }
    </div>
  `,
})
class KeptPageHost {
  readonly open = signal(false);
  readonly suspended = signal(false);
  dismissals = 0;
}

describe('Given a dialog inside a part of the page that something may cover for a while', () => {
  let fixture: ComponentFixture<KeptPageHost>;
  let host: KeptPageHost;

  const native = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeptPageHost],
      providers: [{ provide: DialogHistory, useClass: FakeDialogHistory }],
    }).compileComponents();
    fixture = TestBed.createComponent(KeptPageHost);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  describe('when the dialog is open and that part gets covered', () => {
    beforeEach(async () => {
      host.open.set(true);
      fixture.detectChanges();
      host.suspended.set(true);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('then the dialog steps aside without asking to be dismissed, so it blocks nothing in front', () => {
      expect(native().open).toBe(false);
      expect(host.dismissals).toBe(0);
    });

    it('and Back is pressed meanwhile, then the dialog stays, keeps its history entry and comes back when uncovered', async () => {
      const history = TestBed.inject(DialogHistory) as unknown as FakeDialogHistory;
      const entry = history.listener!;

      entry.close();
      TestBed.tick();
      await fixture.whenStable();
      expect(host.dismissals).toBe(0);
      expect(history.listener).toBe(entry);

      host.suspended.set(false);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(native().open).toBe(true);
    });

    it('and that part is uncovered again, then the same dialog opens as a modal dialog again', async () => {
      host.suspended.set(false);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(native().open).toBe(true);
      expect(host.dismissals).toBe(0);
    });
  });

  it('when a dialog asks to open while that part is covered, then it waits and opens once it is uncovered', async () => {
    host.suspended.set(true);
    fixture.detectChanges();
    host.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(native().open).toBe(false);

    host.suspended.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(native().open).toBe(true);
  });
});
