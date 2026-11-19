import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Fold } from './fold';

@Component({
  imports: [Fold],
  template: `<app-fold [open]="open()"
    ><button type="button">Otevřít v aplikaci banky</button></app-fold
  >`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FoldHost {
  readonly open = signal(true);
}

describe('Given a fold around a block', () => {
  let fixture: ComponentFixture<FoldHost>;

  const host = () => fixture.nativeElement.querySelector('app-fold') as HTMLElement;
  const fold = () => host().querySelector('.fold') as HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(FoldHost);
    fixture.detectChanges();
  });

  it('when it opens with the page, then the block shows as it is, without folding in', () => {
    expect(fold().hidden).toBe(false);
    expect(host().hasAttribute('inert')).toBe(false);
    expect(host().hasAttribute('aria-hidden')).toBe(false);
    expect(fold().classList.contains('fold--moves')).toBe(false);
  });

  it('when it is closed from the first render, then the class that hides it is there too, since the fold itself is a grid over the browser hiding', () => {
    fixture = TestBed.createComponent(FoldHost);
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    expect(fold().hidden).toBe(true);
    expect(fold().classList.contains('fold--moves')).toBe(true);
    expect(host().hasAttribute('inert')).toBe(true);
    expect(host().getAttribute('aria-hidden')).toBe('true');
  });

  it('when it closes, then the block is inert and out of the accessibility tree at once and folds away', () => {
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    expect(host().hasAttribute('inert')).toBe(true);
    expect(host().getAttribute('aria-hidden')).toBe('true');
    expect(fold().hidden).toBe(true);
    expect(fold().classList.contains('fold--moves')).toBe(true);
  });

  it('when it opens again, then the block folds in and takes input again', () => {
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    expect(host().hasAttribute('inert')).toBe(false);
    expect(host().hasAttribute('aria-hidden')).toBe(false);
    expect(fold().hidden).toBe(false);
    expect(fold().classList.contains('fold--moves')).toBe(true);
  });
});
