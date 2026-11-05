import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FocalPoint } from '../../../shared/ui/focal-point/focal-point';
import { FocalPointPicker, PreviewShape } from './focal-point-picker';

const PHOTO_ID = '0199f3e0-0000-7000-8000-00000000c001';

@Component({
  imports: [FocalPointPicker],
  template: `<app-focal-point-picker
    inputId="news-focal-point"
    [imageId]="imageId"
    [shapes]="shapes"
    [(point)]="point"
  />`,
})
class Host {
  readonly imageId = PHOTO_ID;
  readonly shapes: readonly PreviewShape[] = [
    { shape: 'newsCard', label: 'Karta v Aktualitách' },
    { shape: 'articleTop', label: 'Nahoře v článku' },
  ];
  readonly point = signal<FocalPoint | null>(null);
}

describe('Given a photo whose focal point the administrator sets', () => {
  async function render(point: FocalPoint | null = null) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.point.set(point);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const frame = element.querySelector<HTMLButtonElement>('button.frame')!;
    const photo = frame.querySelector('img')!;
    photo.getBoundingClientRect = () => new DOMRect(10, 20, 400, 250);
    return { fixture, element, frame };
  }

  function status(element: HTMLElement): string {
    return element.querySelector('.picker-status')?.textContent?.trim() ?? '';
  }

  function previews(element: HTMLElement): { label: string; position: string }[] {
    return [...element.querySelectorAll('figure.preview')].map((figure) => ({
      label: figure.querySelector('figcaption')?.textContent?.trim() ?? '',
      position: figure.querySelector('img')?.style.objectPosition ?? '',
    }));
  }

  it('when nothing is set yet, then it says the site crops as before and every preview shows that crop', async () => {
    const { element, frame } = await render();

    expect(status(element)).toBe('Bez bodu výřezu: web fotku ořízne jako dosud.');
    expect(frame.getAttribute('aria-describedby')).toBe('news-focal-point-hint');
    expect(previews(element)).toEqual([
      { label: 'Karta v Aktualitách', position: '50% 30%' },
      { label: 'Nahoře v článku', position: '50% 50%' },
    ]);
    expect(element.querySelector('.marker')).toBeNull();
    expect(element.querySelector<HTMLButtonElement>('button.clear')?.disabled).toBe(true);
  });

  it('when the photo is tapped, then the point lands there, the previews follow it and the form gets it', async () => {
    const { fixture, element, frame } = await render();

    frame.dispatchEvent(
      new MouseEvent('click', { clientX: 10 + 168, clientY: 20 + 45, detail: 1 }),
    );
    await fixture.whenStable();

    expect(fixture.componentInstance.point()).toEqual({ x: 42, y: 18 });
    expect(status(element)).toBe('Bod výřezu: 42 % zleva, 18 % shora.');
    expect(previews(element).map((preview) => preview.position)).toEqual(['42% 18%', '42% 18%']);
    expect(element.querySelector<HTMLElement>('.marker')?.style.left).toBe('42%');
  });

  it('when a tap lands on the very edge, then the point stays on the photo', async () => {
    const { fixture, frame } = await render();

    frame.dispatchEvent(new MouseEvent('click', { clientX: 500, clientY: 0, detail: 1 }));
    await fixture.whenStable();

    expect(fixture.componentInstance.point()).toEqual({ x: 100, y: 0 });
  });

  it('when the arrow keys are pressed, then the point moves by five percent from the centre and stops at the edge', async () => {
    const { fixture, frame } = await render();

    frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.point()).toEqual({ x: 45, y: 50 });

    fixture.componentInstance.point.set({ x: 3, y: 98 });
    await fixture.whenStable();
    frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.point()).toEqual({ x: 0, y: 100 });
  });

  it('when the keyboard presses the photo, then no point is placed at its corner', async () => {
    const { fixture, frame } = await render();

    frame.dispatchEvent(new MouseEvent('click', { clientX: 0, clientY: 0, detail: 0 }));
    await fixture.whenStable();

    expect(fixture.componentInstance.point()).toBeNull();
  });

  it('when the point is removed, then the site crops as before again', async () => {
    const { fixture, element } = await render({ x: 42, y: 18 });

    element.querySelector<HTMLButtonElement>('button.clear')!.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.point()).toBeNull();
    expect(status(element)).toBe('Bez bodu výřezu: web fotku ořízne jako dosud.');
  });
});
