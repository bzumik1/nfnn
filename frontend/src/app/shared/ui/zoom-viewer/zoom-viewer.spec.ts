import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { checkerboard } from '../qr-code/testing/qr-matrices';
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

  afterEach(() => fixture.nativeElement.remove());

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
      expect(button('Oddálit').disabled).toBe(true);
      expect(button('Přiblížit').disabled).toBe(false);
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
        expect(button('Oddálit').disabled).toBe(false);
      });

      it('and the size button is pressed, then the photo returns to its fitted size', async () => {
        button('původní velikost').click();
        await settle();

        expect(level()).toBe('100\u00a0%');
      });
    });

    it('when the plus button is pressed until the limit, then it stops at 400 % and offers only zooming out', async () => {
      for (let press = 0; press < 6; press++) {
        button('Přiblížit').click();
        await settle();
      }

      expect(level()).toBe('400\u00a0%');
      expect(button('Přiblížit').disabled).toBe(true);
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

    it('when it is tapped twice quickly, then it zooms in, and tapped twice again, then it returns', async () => {
      await tap(120, 300);
      await tap(122, 302);

      expect(level()).toBe('250\u00a0%');

      await new Promise((resolve) => setTimeout(resolve, 350));
      await tap(120, 300);
      await tap(120, 300);

      expect(level()).toBe('100\u00a0%');
    });

    it('when it is tapped twice slowly, then nothing zooms', async () => {
      await tap(120, 300);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await tap(120, 300);

      expect(level()).toBe('100\u00a0%');
    });

    it('when the mouse wheel turns forward over it, then it zooms in and the page does not scroll', async () => {
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -347 });
      stage().dispatchEvent(wheel);
      await settle();

      expect(level()).toBe('200\u00a0%');
      expect(wheel.defaultPrevented).toBe(true);
    });

    it('when plus and then zero are typed on the stage, then it zooms in and back', async () => {
      stage().dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      await settle();
      expect(level()).toBe('150\u00a0%');

      stage().dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
      await settle();
      expect(level()).toBe('100\u00a0%');
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
