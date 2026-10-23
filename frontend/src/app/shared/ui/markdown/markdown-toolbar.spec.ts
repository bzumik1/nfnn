import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MarkdownToolbar } from './markdown-toolbar';

@Component({
  imports: [FormsModule, MarkdownToolbar],
  template: `
    <app-markdown-toolbar [target]="area" />
    <textarea #area name="body" [(ngModel)]="body"></textarea>
  `,
})
class Host {
  readonly body = signal('');
}

describe('Given the formatting buttons above a text field', () => {
  let fixture: ComponentFixture<Host>;

  const area = () => fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
  const button = (name: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === name,
    ) as HTMLButtonElement;

  async function write(text: string, start: number, end = start): Promise<void> {
    fixture.componentInstance.body.set(text);
    await fixture.whenStable();
    area().setSelectionRange(start, end);
  }

  async function press(name: string): Promise<void> {
    button(name).click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('when it renders, then the buttons form a named group', () => {
    const group = fixture.nativeElement.querySelector('[role="group"]') as HTMLElement;

    expect(group.getAttribute('aria-label')).toBe('Formátování textu');
    expect([...group.querySelectorAll('button')].map((each) => each.textContent?.trim())).toEqual([
      'Tučně',
      'Kurzíva',
      'Nadpis',
      'Odrážky',
      'Číslování',
      'Odkaz',
    ]);
  });

  it('when a word is selected and Tučně is pressed, then the word is wrapped, the model follows and the word stays selected', async () => {
    await write('Děkujeme dárcům.', 0, 8);

    await press('Tučně');

    expect(fixture.componentInstance.body()).toBe('**Děkujeme** dárcům.');
    expect([area().selectionStart, area().selectionEnd]).toEqual([2, 10]);
    expect(document.activeElement).toBe(area());
  });

  it('when nothing is selected and Kurzíva is pressed, then a placeholder is inserted and selected', async () => {
    await write('Text ', 5);

    await press('Kurzíva');

    expect(fixture.componentInstance.body()).toBe('Text *text kurzívou*');
    expect(area().value.slice(area().selectionStart, area().selectionEnd)).toBe('text kurzívou');
  });

  it('when two lines are selected and Číslování is pressed, then each line gets its number', async () => {
    await write('Úvod\nžádost\nschválení', 6, 15);

    await press('Číslování');

    expect(fixture.componentInstance.body()).toBe('Úvod\n1. žádost\n2. schválení');
  });

  it('when the cursor is in a line and Nadpis or Odrážky is pressed, then the line gets the mark', async () => {
    await write('Co jsme koupili\nvozík', 3);
    await press('Nadpis');
    expect(fixture.componentInstance.body()).toBe('## Co jsme koupili\nvozík');

    area().setSelectionRange(21, 21);
    await press('Odrážky');
    expect(fixture.componentInstance.body()).toBe('## Co jsme koupili\n- vozík');
  });

  it('when a word is selected and Odkaz is pressed, then it becomes a link with the address selected for typing', async () => {
    await write('Viz web.', 4, 7);

    await press('Odkaz');

    expect(fixture.componentInstance.body()).toBe('Viz [web](https://).');
    expect(area().value.slice(area().selectionStart, area().selectionEnd)).toBe('https://');
  });
});
