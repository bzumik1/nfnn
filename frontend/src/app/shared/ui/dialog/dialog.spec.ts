import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dialog } from './dialog';

@Component({
  imports: [Dialog],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">Otevřít</button>
    @if (open()) {
      <app-dialog labelledBy="title" [wide]="wide()" (dismissed)="dismissals = dismissals + 1">
        <h2 id="title">Název</h2>
        <input id="first" />
      </app-dialog>
    }
  `,
})
class Host {
  readonly open = signal(false);
  readonly wide = signal(false);
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
});
