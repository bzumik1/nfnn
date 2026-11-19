import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetailsState } from './details-state';
import { Disclosure } from './disclosure';

@Component({
  imports: [DetailsState, Disclosure],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details appDetailsState #details="appDetailsState">
      <summary>Technické podrobnosti</summary>
      <div id="body" appDisclosure [closed]="!details.open()">
        <p>Backend nevidí složku záloh.</p>
      </div>
    </details>
  `,
})
class DetailsHost {}

describe('Given native details whose content is a disclosure', () => {
  let fixture: ComponentFixture<DetailsHost>;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function details(): HTMLDetailsElement {
    return fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
  }

  function body(): HTMLElement {
    return fixture.nativeElement.querySelector('#body') as HTMLElement;
  }

  async function toggled(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await settle();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(DetailsHost);
    await settle();
  });

  it('when the details are closed, then the content is hidden and inert', () => {
    expect(body().hidden).toBe(true);
    expect(body().hasAttribute('inert')).toBe(true);
  });

  it('when the summary opens the details, then the content is shown and reachable', async () => {
    fixture.nativeElement.querySelector('summary').click();
    await toggled();

    expect(details().open).toBe(true);
    expect(body().hidden).toBe(false);
    expect(body().hasAttribute('inert')).toBe(false);
  });

  it('when the summary closes the details again, then the content is hidden again', async () => {
    const summary = fixture.nativeElement.querySelector('summary') as HTMLElement;
    summary.click();
    await toggled();
    summary.click();
    await toggled();

    expect(details().open).toBe(false);
    expect(body().hidden).toBe(true);
  });
});
