import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Markdown } from './markdown';

describe('Given a Markdown body', () => {
  let fixture: ComponentFixture<Markdown>;

  async function render(text: string): Promise<HTMLElement> {
    fixture.componentRef.setInput('text', text);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Markdown] }).compileComponents();
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
});
