import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { checkerboard } from '../qr-code/testing/qr-matrices';
import { DialogAnnouncer } from '../dialog/dialog-announcer';
import { DialogHistory } from '../dialog/dialog-history';
import { FakeDialogHistory } from '../dialog/testing/fake-dialog-history';
import { ZoomContent } from './zoom-content';
import { ZoomViewer } from './zoom-viewer';

const PHOTO: ZoomContent = {
  kind: 'photo',
  src: '/api/content/media/photo-1/1920',
  alt: 'Děti sázejí stromek',
  width: 1920,
  height: 1200,
};

const QR: ZoomContent = {
  kind: 'qr',
  matrix: checkerboard(25),
  label: 'QR platba na účet Nadačního fondu Nová naděje',
};

@Component({
  imports: [ZoomViewer],
  template: `
    @if (open()) {
      <app-zoom-viewer [content]="content()" (closed)="closings = closings + 1; open.set(false)" />
    }
  `,
})
class Host {
  readonly open = signal(true);
  readonly content = signal<ZoomContent>(PHOTO);
  closings = 0;
}

describe('Given the zoom viewer', () => {
  let fixture: ComponentFixture<Host>;

  const dialog = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement | null;
  const stage = () => fixture.nativeElement.querySelector('.zoom-stage') as HTMLElement;
  const button = (name: string) =>
    Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) =>
      (candidate.getAttribute('aria-label') ?? candidate.textContent ?? '').includes(name),
    ) as HTMLButtonElement;
  const level = () => button('původní velikost').textContent?.trim();
  const unavailable = (name: string) => button(name).getAttribute('aria-disabled') === 'true';
  const announced = () => dialog()?.querySelector('[role="status"]')?.textContent?.trim();

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function pointer(type: string, id: number, x: number, y: number): void {
    stage().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: id,
        pointerType: 'touch',
        isPrimary: id === 1,
        clientX: x,
        clientY: y,
      }),
    );
  }

  async function tap(x: number, y: number): Promise<void> {
    pointer('pointerdown', 1, x, y);
    pointer('pointerup', 1, x, y);
    await settle();
  }

  async function render(content: ZoomContent): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: DialogHistory, useClass: FakeDialogHistory }],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.content.set(content);
    document.body.appendChild(fixture.nativeElement);
    await settle();
  }

  function key(name: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    stage().dispatchEvent(event);
    return event;
  }

  afterEach(() => {
    vi.useRealTimers();
    fixture.nativeElement.remove();
  });

  describe('Given a photo opened in it', () => {
    beforeEach(() => render(PHOTO));

    it('when it opens, then it is a modal dialog named as a zoomed photo that shows the photo with its description', () => {
      expect(dialog()?.open).toBe(true);
      const title = dialog()?.querySelector(`#${dialog()?.getAttribute('aria-labelledby')}`);
      expect(title?.textContent?.trim()).toBe('Zvětšená fotka');
      const photo = stage().querySelector('img') as HTMLImageElement;
      expect(photo.getAttribute('src')).toBe(PHOTO.src);
      expect(photo.getAttribute('alt')).toBe('Děti sázejí stromek');
    });

    it('when it opens, then it shows the photo at its fitted size and offers only zooming in', () => {
      expect(level()).toBe('100\u00a0%');
      expect(unavailable('Oddálit')).toBe(true);
      expect(unavailable('Přiblížit')).toBe(false);
      expect(button('Oddálit').disabled).toBe(false);
    });

    it('when it opens, then the stage tells how to zoom without a pointer', () => {
      const hint = document.getElementById(stage().getAttribute('aria-describedby') ?? '');
      expect(stage().getAttribute('tabindex')).toBe('0');
      expect(hint?.textContent).toContain('plus a minus');
    });

    describe('when the plus button is pressed', () => {
      beforeEach(async () => {
        button('Přiblížit').click();
        await settle();
      });

      it('then the photo grows by half and the new size is announced', () => {
        expect(level()).toBe('150\u00a0%');
        expect(announced()).toBe('Přiblíženo na 150\u00a0%');
        expect(unavailable('Oddálit')).toBe(false);
      });

      it('and the size button is pressed, then the photo returns to its fitted size and says so', async () => {
        button('původní velikost').click();
        await settle();

        expect(level()).toBe('100\u00a0%');
        expect(announced()).toBe('Původní velikost');
      });

      it('and the minus button is pressed, then the photo shrinks back and that is announced', async () => {
        button('Oddálit').click();
        await settle();

        expect(level()).toBe('100\u00a0%');
        expect(announced()).toBe('Oddáleno na 100\u00a0%');
      });

      it('and the viewer closes, then its announcement is gone from the next dialog', async () => {
        button('Zavřít').click();
        await settle();

        expect(TestBed.inject(DialogAnnouncer).message()).toBe('');
      });
    });

    it('when the plus button is pressed until the limit, then it stops at 400 %, offers only zooming out and keeps the focus', async () => {
      button('Přiblížit').focus();
      for (let press = 0; press < 6; press++) {
        button('Přiblížit').click();
        await settle();
      }

      expect(level()).toBe('400\u00a0%');
      expect(unavailable('Přiblížit')).toBe(true);
      expect(document.activeElement).toBe(button('Přiblížit'));
    });

    it('when the minus button is pressed at the fitted size, then nothing changes and the focus stays on it', async () => {
      button('Oddálit').focus();
      button('Oddálit').click();
      await settle();

      expect(level()).toBe('100\u00a0%');
      expect(document.activeElement).toBe(button('Oddálit'));
    });

    it('when two fingers spread apart and one of them is cancelled, then the other one goes on without counting as a tap', async () => {
      pointer('pointerdown', 1, 100, 300);
      pointer('pointerdown', 2, 200, 300);
      pointer('pointermove', 2, 250, 300);
      stage().dispatchEvent(
        new PointerEvent('pointercancel', { bubbles: true, pointerId: 2, pointerType: 'touch' }),
      );
      pointer('pointerup', 1, 100, 300);
      await tap(100, 300);
      await settle();

      expect(level()).toBe('150\u00a0%');
    });

    it('when two fingers spread apart on it, then the photo grows with them', async () => {
      pointer('pointerdown', 1, 100, 300);
      pointer('pointerdown', 2, 200, 300);
      pointer('pointermove', 2, 250, 300);
      pointer('pointermove', 1, 50, 300);
      pointer('pointerup', 1, 50, 300);
      pointer('pointerup', 2, 250, 300);
      await settle();

      expect(level()).toBe('200\u00a0%');
    });

    describe('when it is tapped twice', () => {
      beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));

      it('within 300 ms and 30 px, then it zooms in, and twice again, then it returns', async () => {
        await tap(120, 300);
        vi.setSystemTime(Date.now() + 300);
        await tap(141, 321);

        expect(level()).toBe('250\u00a0%');

        await tap(120, 300);
        await tap(120, 300);

        expect(level()).toBe('100\u00a0%');
      });

      it('more than 300 ms apart, then nothing zooms', async () => {
        await tap(120, 300);
        vi.setSystemTime(Date.now() + 301);
        await tap(120, 300);

        expect(level()).toBe('100\u00a0%');
      });

      it('more than 30 px apart, then nothing zooms', async () => {
        await tap(120, 300);
        await tap(120, 331);

        expect(level()).toBe('100\u00a0%');
      });

      it('after the first press slid away, then nothing zooms', async () => {
        pointer('pointerdown', 1, 120, 300);
        pointer('pointermove', 1, 120, 311);
        pointer('pointerup', 1, 120, 311);
        await tap(120, 311);

        expect(level()).toBe('100\u00a0%');
      });
    });

    it('when the mouse wheel turns forward over it, then it zooms in and the page does not scroll', async () => {
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -347 });
      stage().dispatchEvent(wheel);
      await settle();

      expect(level()).toBe('200\u00a0%');
      expect(wheel.defaultPrevented).toBe(true);
    });

    it('when plus and then zero are typed on the stage, then it zooms in and back', async () => {
      key('+');
      await settle();
      expect(level()).toBe('150\u00a0%');

      key('0');
      await settle();
      expect(level()).toBe('100\u00a0%');
    });

    it('when equals and then minus are typed on the stage, then it zooms in and out', async () => {
      key('=');
      await settle();
      expect(level()).toBe('150\u00a0%');

      key('-');
      await settle();
      expect(level()).toBe('100\u00a0%');
    });

    it('when plus is typed with Ctrl or Cmd, then the browser zooms the page as usual and the photo stays', async () => {
      const withCtrl = key('+', { ctrlKey: true });
      const withCmd = key('=', { metaKey: true });
      await settle();

      expect(level()).toBe('100\u00a0%');
      expect(withCtrl.defaultPrevented).toBe(false);
      expect(withCmd.defaultPrevented).toBe(false);
    });

    it('when a trackpad pinches over it, then it zooms faster than a wheel turn by the same amount', async () => {
      stage().dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -69.4, ctrlKey: true }),
      );
      await settle();

      expect(level()).toBe('200\u00a0%');
    });

    describe('when one finger drags it at its fitted size', () => {
      const shown = () => fixture.nativeElement.querySelector('.zoom-content') as HTMLElement;

      it('far down, then the viewer closes', async () => {
        pointer('pointerdown', 1, 200, 100);
        pointer('pointermove', 1, 200, 200);
        pointer('pointermove', 1, 210, 300);
        pointer('pointerup', 1, 210, 300);
        await settle();

        expect(fixture.componentInstance.closings).toBe(1);
      });

      it('a little down, then the photo follows the finger and returns, and the viewer stays', async () => {
        pointer('pointerdown', 1, 200, 100);
        pointer('pointermove', 1, 205, 120);
        await settle();
        const followed = shown().style.translate;
        pointer('pointerup', 1, 205, 120);
        await settle();

        expect(followed).toBe('5px 20px');
        expect(shown().style.translate).toBe('');
        expect(fixture.componentInstance.closings).toBe(0);
      });

      it('up, then the viewer stays', async () => {
        pointer('pointerdown', 1, 200, 300);
        pointer('pointermove', 1, 200, 100);
        pointer('pointerup', 1, 200, 100);
        await settle();

        expect(fixture.componentInstance.closings).toBe(0);
      });

      it('down while a second finger joins, then the fingers pinch and the viewer stays', async () => {
        pointer('pointerdown', 1, 100, 100);
        pointer('pointermove', 1, 100, 200);
        pointer('pointerdown', 2, 200, 200);
        pointer('pointermove', 2, 300, 200);
        pointer('pointerup', 2, 300, 200);
        pointer('pointerup', 1, 100, 300);
        await settle();

        expect(fixture.componentInstance.closings).toBe(0);
        expect(shown().style.translate).toBe('');
      });
    });

    it('when it is zoomed in and one finger drags it down, then the photo moves and the viewer stays', async () => {
      button('Přiblížit').click();
      await settle();
      pointer('pointerdown', 1, 200, 100);
      pointer('pointermove', 1, 200, 300);
      pointer('pointerup', 1, 200, 300);
      await settle();

      expect(fixture.componentInstance.closings).toBe(0);
    });

    it('when a mouse drags it down, then the viewer stays', async () => {
      stage().setPointerCapture = () => undefined;
      stage().dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 9,
          pointerType: 'mouse',
          clientX: 200,
          clientY: 100,
        }),
      );
      stage().dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 9,
          pointerType: 'mouse',
          clientX: 200,
          clientY: 400,
        }),
      );
      stage().dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 9,
          pointerType: 'mouse',
          clientX: 200,
          clientY: 400,
        }),
      );
      await settle();

      expect(fixture.componentInstance.closings).toBe(0);
    });

    it('when the close button is pressed, then the viewer closes', async () => {
      button('Zavřít').click();
      await settle();

      expect(fixture.componentInstance.closings).toBe(1);
      expect(dialog()).toBeNull();
    });
  });

  describe('Given a payment QR code opened in it', () => {
    beforeEach(() => render(QR));

    it('when it opens, then it is named as a zoomed QR code and shows the code under its label', () => {
      const title = dialog()?.querySelector(`#${dialog()?.getAttribute('aria-labelledby')}`);
      expect(title?.textContent?.trim()).toBe('Zvětšený QR kód');
      const code = stage().querySelector('svg[role="img"]');
      expect(code?.getAttribute('aria-label')).toBe(QR.label);
    });
  });
});
