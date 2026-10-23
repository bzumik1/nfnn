import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarkdownPreview } from './markdown-preview';

describe('Given the preview under a Markdown field', () => {
  let fixture: ComponentFixture<MarkdownPreview>;
  const element = () => fixture.nativeElement as HTMLElement;
  const toggle = () => element().querySelector('button') as HTMLButtonElement;
  const region = () => element().querySelector('[role="region"]') as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MarkdownPreview] }).compileComponents();
    fixture = TestBed.createComponent(MarkdownPreview);
    fixture.componentRef.setInput('previewId', 'news-body-preview');
    fixture.componentRef.setInput('text', 'Díky **vám**.');
    await fixture.whenStable();
  });

  it('when it renders, then it warns to check the look and keeps the preview closed', () => {
    expect(element().textContent).toContain('zkontrolujte v náhledu');
    expect(toggle().textContent?.trim()).toBe('Ukázat náhled');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe('news-body-preview');
    expect(region().id).toBe('news-body-preview');
    expect(region().hidden).toBe(true);
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

      fixture.componentRef.setInput('text', '  ');
      await fixture.whenStable();
      expect(region().textContent).toContain('Zatím není co ukázat.');

      toggle().click();
      await fixture.whenStable();
      expect(region().hidden).toBe(true);
    });
  });
});
