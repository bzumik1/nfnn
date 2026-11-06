import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FocalPoint, FocalPointCrop, objectPosition, PHOTO_SHAPES } from './focal-point';

@Component({
  imports: [FocalPointCrop],
  template: `<img alt="" [appFocalPoint]="point()" [focalShape]="shape()" />`,
})
class Host {
  readonly point = signal<FocalPoint | null | undefined>(null);
  readonly shape = signal<keyof typeof PHOTO_SHAPES>('newsCard');
}

describe('Given a photo shown in a shape of the site', () => {
  describe('when it has no focal point', () => {
    it('then each shape crops as it always did', () => {
      expect(objectPosition(null, 'newsCard')).toBe('50% 30%');
      expect(objectPosition(undefined, 'projectCard')).toBe('50% 20%');
      expect(objectPosition(null, 'articleTop')).toBe('50% 50%');
    });

    it('then the wide band and its phone cut keep the upper part, where faces are, and the square the middle', () => {
      expect(PHOTO_SHAPES.band.ratio).toBe(3);
      expect(PHOTO_SHAPES.bandPhone.ratio).toBe(1.5);
      expect(objectPosition(null, 'bandPhone')).toBe('50% 30%');
      expect(PHOTO_SHAPES.square.ratio).toBe(1);
      expect(objectPosition(null, 'band')).toBe('50% 30%');
      expect(objectPosition(null, 'square')).toBe('50% 40%');
    });
  });

  describe('when it has a focal point', () => {
    it('then every shape keeps that spot in view', () => {
      expect(objectPosition({ x: 42, y: 18 }, 'newsCard')).toBe('42% 18%');
      expect(objectPosition({ x: 0, y: 100 }, 'articleTop')).toBe('0% 100%');
    });
  });

  it('when the photo is drawn and its point changes, then the image follows it and falls back to its shape without one', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.style.objectPosition).toBe('50% 30%');

    fixture.componentInstance.point.set({ x: 42, y: 18 });
    await fixture.whenStable();
    expect(image.style.objectPosition).toBe('42% 18%');

    fixture.componentInstance.point.set(null);
    fixture.componentInstance.shape.set('projectCard');
    await fixture.whenStable();
    expect(image.style.objectPosition).toBe('50% 20%');
  });
});
