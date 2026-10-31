import { loadReceiptFonts } from './receipt-fonts';

const FILES = {
  body: 'body.0123456789abcdef.ttf',
  bold: 'body-bold.0123456789abcdef.ttf',
  heading: 'heading.0123456789abcdef.ttf',
};

function answering(status: (path: string) => number | 'cut-off'): typeof fetch {
  return (input) => {
    const path = String(input);
    const answer = status(path);
    if (answer === 'cut-off') {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    const body = answer === 200 ? new TextEncoder().encode(path) : null;
    return Promise.resolve(new Response(body, { status: answer }));
  };
}

describe('Given the receipt worker loading the theme fonts', () => {
  it('when every font answers, then it gives each font file by its role', async () => {
    const asked: string[] = [];
    const load = await loadReceiptFonts(FILES, (input) => {
      asked.push(String(input));
      return answering(() => 200)(input);
    });

    expect(asked).toEqual([
      '/receipt-fonts/body.0123456789abcdef.ttf',
      '/receipt-fonts/body-bold.0123456789abcdef.ttf',
      '/receipt-fonts/heading.0123456789abcdef.ttf',
    ]);
    expect(load.loaded && new TextDecoder().decode(load.fonts.bold)).toBe(
      '/receipt-fonts/body-bold.0123456789abcdef.ttf',
    );
  });

  it('when a font is gone, as after a deploy that changed the fonts, then the tools are missing and the error is named not found', async () => {
    const load = await loadReceiptFonts(
      FILES,
      answering((path) => (path.includes('heading') ? 404 : 200)),
    );

    expect(load).toEqual({ loaded: false, reason: 'tools-missing', name: 'NotFoundError' });
  });

  it('when the server fails to answer a font, then the fonts failed', async () => {
    const load = await loadReceiptFonts(
      FILES,
      answering(() => 503),
    );

    expect(load).toEqual({ loaded: false, reason: 'fonts', name: 'Error' });
  });

  it('when the connection drops, then the fonts failed with the closed name of the browser error', async () => {
    const load = await loadReceiptFonts(
      FILES,
      answering(() => 'cut-off'),
    );

    expect(load).toEqual({ loaded: false, reason: 'fonts', name: 'TypeError' });
  });
});
