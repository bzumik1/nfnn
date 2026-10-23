import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RadioGroup } from './radio-group';

@Component({
  imports: [RadioGroup],
  template: `<div appRadioGroup aria-label="Způsob">
    @for (option of options; track option) {
      <button
        type="button"
        role="radio"
        [attr.aria-checked]="chosen() === option"
        [tabindex]="chosen() === option ? 0 : -1"
        (click)="chosen.set(option)"
      >
        {{ option }}
      </button>
    }
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly options = ['Heslem', 'Klíčem', 'Kódem'];
  readonly chosen = signal('Heslem');
}

describe('Given a group of choices that behave as radio buttons', () => {
  let fixture: ComponentFixture<Host>;

  const group = () => fixture.nativeElement.querySelector('[appRadioGroup]') as HTMLElement;
  const radios = () =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
  const checked = () => radios().find((radio) => radio.getAttribute('aria-checked') === 'true');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  async function press(key: string, on: HTMLElement = checked()!): Promise<KeyboardEvent> {
    on.focus();
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    on.dispatchEvent(event);
    await fixture.whenStable();
    return event;
  }

  it('when it renders, then it is a radio group and only the chosen option is reached by Tab', () => {
    expect(group().getAttribute('role')).toBe('radiogroup');
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
  });

  it('when the right arrow is pressed, then the next option is chosen and focused', async () => {
    const event = await press('ArrowRight');

    expect(event.defaultPrevented).toBe(true);
    expect(checked()?.textContent?.trim()).toBe('Klíčem');
    expect(document.activeElement).toBe(checked());
    expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('when the down arrow is pressed on the last option, then the first one is chosen', async () => {
    await press('End');

    await press('ArrowDown');

    expect(checked()?.textContent?.trim()).toBe('Heslem');
    expect(document.activeElement).toBe(checked());
  });

  it('when the left or up arrow is pressed on the first option, then the last one is chosen', async () => {
    await press('ArrowLeft');
    expect(checked()?.textContent?.trim()).toBe('Kódem');

    await press('ArrowUp');
    expect(checked()?.textContent?.trim()).toBe('Klíčem');
  });

  it('when Home is pressed, then the first option is chosen', async () => {
    await press('End');

    await press('Home');

    expect(checked()?.textContent?.trim()).toBe('Heslem');
  });

  it('when another key is pressed, then nothing changes and the key keeps its usual meaning', async () => {
    const event = await press('Tab');

    expect(event.defaultPrevented).toBe(false);
    expect(checked()?.textContent?.trim()).toBe('Heslem');
  });
});
