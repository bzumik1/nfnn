import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Markdown } from './markdown';

describe('Given a Markdown body', () => {
  let fixture: ComponentFixture<Markdown>;

  async function render(text: string): Promise<HTMLElement> {
    fixture.componentRef.setInput('text', text);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Markdown],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Markdown);
  });

  it('when it is shown, then headings, paragraphs with line breaks, lists, quotes, emphasis and links appear', async () => {
    const element = await render(
      [
        '## Co jsme koupili',
        'Díky vám má Dominik **nový vozík**\na *polohovací* lůžko.',
        '- vozík\n- lůžko',
        '1. žádost\n2. schválení',
        '> Děkujeme.',
        'Více na [webu](https://nfnn.cz/projekty).',
      ].join('\n\n'),
    );

    expect(element.querySelector('h2')?.textContent).toBe('Co jsme koupili');
    const paragraph = element.querySelector('p');
    expect(paragraph?.querySelector('strong')?.textContent).toBe('nový vozík');
    expect(paragraph?.querySelector('em')?.textContent).toBe('polohovací');
    expect(paragraph?.querySelectorAll('br')).toHaveLength(1);
    expect([...element.querySelectorAll('ul li')].map((item) => item.textContent)).toEqual([
      'vozík',
      'lůžko',
    ]);
    expect([...element.querySelectorAll('ol li')].map((item) => item.textContent)).toEqual([
      'žádost',
      'schválení',
    ]);
    expect(element.querySelector('blockquote')?.textContent?.trim()).toBe('Děkujeme.');
    const link = element.querySelector('a');
    expect(link?.textContent).toBe('webu');
    expect(link?.getAttribute('href')).toBe('https://nfnn.cz/projekty');
  });

  it('when it holds HTML, then the tags are shown as text and nothing is inserted', async () => {
    const element = await render('<img src=x onerror="alert(1)"> <script>alert(1)</script>');

    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('p')?.textContent).toBe(
      '<img src=x onerror="alert(1)"> <script>alert(1)</script>',
    );
  });

  describe('when a link in it is clicked', () => {
    let navigate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    });

    function click(link: Element, init: MouseEventInit = {}): MouseEvent {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
      link.dispatchEvent(event);
      return event;
    }

    it('and it leads to a page of the site, then the app opens it without loading the site again', async () => {
      const element = await render('Viz [projekty](/projekty?rok=2026#hotove).');

      const event = click(element.querySelector('a') as Element);

      expect(event.defaultPrevented).toBe(true);
      expect(navigate).toHaveBeenCalledExactlyOnceWith('/projekty?rok=2026#hotove');
    });

    it('and it leads to the site by its full address, then the app opens that page too', async () => {
      const element = await render(`Viz [projekty](${window.location.origin}/projekty).`);

      const event = click(element.querySelector('a') as Element);

      expect(event.defaultPrevented).toBe(true);
      expect(navigate).toHaveBeenCalledExactlyOnceWith('/projekty');
    });

    it('and it leads to another site, then the browser follows it', async () => {
      const element = await render('Viz [jinde](https://example.org/stranka).');

      const event = click(element.querySelector('a') as Element);

      expect(event.defaultPrevented).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('and it leads to a file the server serves, as a photo, then the browser follows it', async () => {
      const element = await render('[Foto](/api/content/media/1) a [logo](/images/logo.svg)');

      const events = [...element.querySelectorAll('a')].map((link) => click(link));

      expect(events.map((event) => event.defaultPrevented)).toEqual([false, false]);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('and it is clicked with a modifier key to open elsewhere, then the browser follows it', async () => {
      const element = await render('Viz [projekty](/projekty).');

      const event = click(element.querySelector('a') as Element, { metaKey: true });

      expect(event.defaultPrevented).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
