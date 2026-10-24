import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarkdownPreview } from './markdown-preview';
import { MarkdownToolbar } from './markdown-toolbar';

@Component({
  imports: [MarkdownToolbar, MarkdownPreview],
  template: `
    <app-markdown-toolbar [target]="area" [preview]="preview" />
    <textarea #area></textarea>
    <app-markdown-preview #preview [text]="text()" previewId="news-body-preview" />
  `,
})
class Host {
  readonly text = signal('Díky **vám**.');
}

describe('Given the preview under a Markdown field', () => {
  let fixture: ComponentFixture<Host>;
  const element = () => fixture.nativeElement as HTMLElement;
  const toggle = () => element().querySelector('.tool--preview') as HTMLButtonElement;
  const region = () => element().querySelector('[role="region"]') as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('when it renders, then its switch is the last formatting tool and the preview stays closed', () => {
    const tools = [...element().querySelectorAll('[role="group"] button')];
    expect(tools.at(-1)).toBe(toggle());
    expect(toggle().textContent?.trim()).toBe('Ukázat náhled');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe('news-body-preview');
    expect(region().id).toBe('news-body-preview');
    expect(region().hidden).toBe(true);
    expect(element().querySelector('.ui-callout')).toBeNull();
  });

  describe('when the preview is opened', () => {
    beforeEach(async () => {
      toggle().click();
      await fixture.whenStable();
    });

    it('then the text is shown formatted and the button closes it again', async () => {
      expect(region().hidden).toBe(false);
      expect(region().getAttribute('aria-label')).toBe('Náhled textu');
      expect(region().querySelector('strong')?.textContent).toBe('vám');
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(toggle().textContent?.trim()).toBe('Skrýt náhled');

      fixture.componentInstance.text.set('  ');
      await fixture.whenStable();
      expect(region().textContent).toContain('Zatím není co ukázat.');

      toggle().click();
      await fixture.whenStable();
      expect(region().hidden).toBe(true);
    });
  });
});
