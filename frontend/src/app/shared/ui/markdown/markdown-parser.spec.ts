import { parseMarkdown } from './markdown-parser';

describe('Given a body written as plain text', () => {
  it('when it is parsed, then blank lines split paragraphs and single line breaks stay', () => {
    expect(parseMarkdown('První odstavec\npokračuje.\n\n\nDruhý odstavec.')).toEqual([
      {
        kind: 'paragraph',
        content: [
          { kind: 'text', text: 'První odstavec' },
          { kind: 'break' },
          { kind: 'text', text: 'pokračuje.' },
        ],
      },
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Druhý odstavec.' }] },
    ]);
  });

  it('when it holds HTML, then the tags stay plain text', () => {
    expect(parseMarkdown('<script>alert(1)</script> <b>tučně</b>')).toEqual([
      {
        kind: 'paragraph',
        content: [{ kind: 'text', text: '<script>alert(1)</script> <b>tučně</b>' }],
      },
    ]);
  });

  it('when it is empty or blank, then there is nothing to show', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown(' \n\n  ')).toEqual([]);
  });
});

describe('Given a body with Markdown blocks', () => {
  it('when headings are parsed, then one or two hashes give a level 2 heading and more give level 3', () => {
    expect(parseMarkdown('# Velký\n## Druhý\n### Menší\n#### Ještě menší\n#bez mezery')).toEqual([
      { kind: 'heading', level: 2, content: [{ kind: 'text', text: 'Velký' }] },
      { kind: 'heading', level: 2, content: [{ kind: 'text', text: 'Druhý' }] },
      { kind: 'heading', level: 3, content: [{ kind: 'text', text: 'Menší' }] },
      { kind: 'heading', level: 3, content: [{ kind: 'text', text: 'Ještě menší' }] },
      { kind: 'paragraph', content: [{ kind: 'text', text: '#bez mezery' }] },
    ]);
  });

  it('when bullet and numbered lines are parsed, then they become lists and an indented line continues an item', () => {
    expect(
      parseMarkdown(
        'Nakoupili jsme:\n- vozík\n* polohovací\n  lůžko\n\n1. podání žádosti\n2) schválení',
      ),
    ).toEqual([
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Nakoupili jsme:' }] },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'vozík' }], [{ kind: 'text', text: 'polohovací lůžko' }]],
      },
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', text: 'podání žádosti' }], [{ kind: 'text', text: 'schválení' }]],
      },
    ]);
  });

  it('when quoted lines are parsed, then they become one quote with line breaks', () => {
    expect(parseMarkdown('> Děkujeme všem\n> dárcům.\nKonec.')).toEqual([
      {
        kind: 'quote',
        content: [
          { kind: 'text', text: 'Děkujeme všem' },
          { kind: 'break' },
          { kind: 'text', text: 'dárcům.' },
        ],
      },
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Konec.' }] },
    ]);
  });
});

describe('Given text with Markdown emphasis and links', () => {
  const inline = (text: string) => {
    const [block] = parseMarkdown(text);
    return block.kind === 'list' ? block.items[0] : block.content;
  };

  it('when bold and italic are parsed, then they nest', () => {
    expect(inline('Je **velmi *rád*** a _moc_ děkuje.')).toEqual([
      { kind: 'text', text: 'Je ' },
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'velmi ' },
          { kind: 'em', children: [{ kind: 'text', text: 'rád' }] },
        ],
      },
      { kind: 'text', text: ' a ' },
      { kind: 'em', children: [{ kind: 'text', text: 'moc' }] },
      { kind: 'text', text: ' děkuje.' },
    ]);
  });

  it('when a marker has no partner, sits inside a word or is escaped, then it stays text', () => {
    expect(inline('5 * 3 = 15, soubor muj_vozik_2.jpg, \\*hvězdička\\* a **nedokončené')).toEqual([
      {
        kind: 'text',
        text: '5 * 3 = 15, soubor muj_vozik_2.jpg, *hvězdička* a **nedokončené',
      },
    ]);
  });

  it('when a link has a web, e-mail or site address, then it becomes a link', () => {
    expect(
      inline(
        'Viz [výroční zpráva](https://nfnn.cz/zprava), [napište nám](mailto:info@nfnn.cz) a [projekty](/projekty).',
      ),
    ).toEqual([
      { kind: 'text', text: 'Viz ' },
      {
        kind: 'link',
        href: 'https://nfnn.cz/zprava',
        children: [{ kind: 'text', text: 'výroční zpráva' }],
      },
      { kind: 'text', text: ', ' },
      {
        kind: 'link',
        href: 'mailto:info@nfnn.cz',
        children: [{ kind: 'text', text: 'napište nám' }],
      },
      { kind: 'text', text: ' a ' },
      { kind: 'link', href: '/projekty', children: [{ kind: 'text', text: 'projekty' }] },
      { kind: 'text', text: '.' },
    ]);
  });

  it('when a link has another kind of address, then the whole link stays text', () => {
    expect(inline('[klikni](javascript:alert(1)) a [tady](//jinde.cz)')).toEqual([
      { kind: 'text', text: '[klikni](javascript:alert(1)) a [tady](//jinde.cz)' },
    ]);
  });

  it('when a bare web address is written, then it becomes a link without the trailing punctuation', () => {
    expect(inline('Více na https://nfnn.cz/projekty.')).toEqual([
      { kind: 'text', text: 'Více na ' },
      {
        kind: 'link',
        href: 'https://nfnn.cz/projekty',
        children: [{ kind: 'text', text: 'https://nfnn.cz/projekty' }],
      },
      { kind: 'text', text: '.' },
    ]);
  });
});
