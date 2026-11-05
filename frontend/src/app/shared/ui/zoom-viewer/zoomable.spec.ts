import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { checkerboard } from '../qr-code/testing/qr-matrices';
import { DialogHistory } from '../dialog/dialog-history';
import { FakeDialogHistory } from '../dialog/testing/fake-dialog-history';
import { ZoomContent } from './zoom-content';
import { Zoomable } from './zoomable';

@Component({
  imports: [Zoomable],
  template: `
    <app-zoomable [content]="content()">
      <img src="/api/content/media/photo-1/960" alt="Děti sázejí stromek" />
    </app-zoomable>
  `,
})
class Host {
  readonly content = signal<ZoomContent>({
    kind: 'photo',
    src: '/api/content/media/photo-1/1920',
    alt: 'Děti sázejí stromek',
    width: 1920,
    height: 1200,
  });
}

describe('Given something on the page that can be enlarged', () => {
  let fixture: ComponentFixture<Host>;

  const trigger = () =>
    fixture.nativeElement.querySelector('app-zoomable > button') as HTMLButtonElement;
  const dialog = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement | null;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: DialogHistory, useClass: FakeDialogHistory }],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await settle();
  });

  afterEach(() => fixture.nativeElement.remove());

  describe('Given a photo', () => {
    it('when it renders, then the photo is a button that says it enlarges the photo and opens a dialog', () => {
      expect(trigger().getAttribute('type')).toBe('button');
      expect(trigger().getAttribute('aria-label')).toBe('Zvětšit fotku: Děti sázejí stromek');
      expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
      expect(trigger().querySelector('img')?.getAttribute('alt')).toBe('Děti sázejí stromek');
      expect(dialog()).toBeNull();
    });

    it('when the photo has no description, then the button still says what it does', async () => {
      fixture.componentInstance.content.update((photo) => ({ ...photo, alt: '' }));
      await settle();

      expect(trigger().getAttribute('aria-label')).toBe('Zvětšit fotku');
    });

    describe('when it is pressed', () => {
      beforeEach(async () => {
        trigger().focus();
        trigger().click();
        await settle();
      });

      it('then the viewer opens with the larger photo', () => {
        expect(dialog()?.open).toBe(true);
        expect(dialog()?.querySelector('.zoom-stage img')?.getAttribute('src')).toBe(
          '/api/content/media/photo-1/1920',
        );
      });

      it('and the viewer is closed, then focus returns to the photo', async () => {
        (dialog()?.querySelector('.dialog-close') as HTMLButtonElement).click();
        await settle();

        expect(dialog()).toBeNull();
        expect(document.activeElement).toBe(trigger());
      });
    });
  });

  describe('Given a payment QR code', () => {
    beforeEach(async () => {
      fixture.componentInstance.content.set({
        kind: 'qr',
        matrix: checkerboard(25),
        label: 'QR platba na účet Nadačního fondu Nová naděje',
      });
      await settle();
    });

    it('when it renders, then the button names the code it enlarges', () => {
      expect(trigger().getAttribute('aria-label')).toBe(
        'Zvětšit: QR platba na účet Nadačního fondu Nová naděje',
      );
    });
  });
});
