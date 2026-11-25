import { focusInView, viewBand } from './focus-in-view';

describe('Given a control the page gives the focus back to, under a head that covers the top of the page', () => {
  const head = 64;
  let control: HTMLButtonElement;
  let shown: ReturnType<typeof vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>>;

  beforeEach(() => {
    document.documentElement.style.scrollPaddingTop = `${head}px`;
    document.documentElement.style.scrollPaddingBottom = '80px';
    control = document.createElement('button');
    control.textContent = 'Upravit údaje';
    document.body.append(control);
    shown = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();
    control.scrollIntoView = shown;
  });

  afterEach(() => {
    control.remove();
    document.documentElement.style.scrollPaddingTop = '';
    document.documentElement.style.scrollPaddingBottom = '';
  });

  function at(top: number, height = 44): void {
    control.getBoundingClientRect = () => new DOMRect(0, top, 200, height);
  }

  it('when the whole control and its focus ring show, then it takes the focus and the page stays', () => {
    at(300);

    expect(focusInView(control)).toBe(true);

    expect(document.activeElement).toBe(control);
    expect(shown).not.toHaveBeenCalled();
  });

  it('when half the control lies under the head, then the page moves the least it can to show it whole, as a plain focus did before', () => {
    at(head - 22);

    focusInView(control);

    expect(document.activeElement).toBe(control);
    expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('when only its focus ring’s reach lies under the bottom band, then the page moves the least it can, so the ring shows whole', () => {
    control.style.scrollMarginTop = '5px';
    control.style.scrollMarginBottom = '5px';
    at(window.innerHeight - 80 - 44 - 2);

    focusInView(control);

    expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('when the control lies out of the window, then the page moves the least it can to show it', () => {
    at(window.innerHeight + 120);

    focusInView(control);

    expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
});

describe('Given Účet in the banner at the top of the page, which the room kept for the head does not cover, scrolled so that the button shows 1 px below the top', () => {
  let banner: HTMLElement;
  let account: HTMLButtonElement;
  let shown: ReturnType<typeof vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>>;
  let scrolled: ReturnType<typeof vi.fn<(options?: ScrollToOptions) => void>>;
  let page: Element;

  beforeEach(() => {
    document.documentElement.style.scrollPaddingTop = '64px';
    banner = document.createElement('header');
    account = document.createElement('button');
    account.textContent = 'Účet';
    account.style.scrollMarginTop = '5px';
    account.style.scrollMarginBottom = '5px';
    banner.append(account);
    document.body.append(banner);
    shown = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();
    account.scrollIntoView = shown;
    account.getBoundingClientRect = () => new DOMRect(300, 1, 44, 44);
    page = document.scrollingElement ?? document.documentElement;
    scrolled = vi.fn<(options?: ScrollToOptions) => void>();
    Object.defineProperty(page, 'scrollBy', { configurable: true, value: scrolled });
  });

  afterEach(() => {
    banner.remove();
    delete (page as { scrollBy?: unknown }).scrollBy;
    document.documentElement.style.scrollPaddingTop = '';
  });

  it('when the focus returns to it, then the page moves only the 4 px its focus ring lacks, never under the room kept for the head', () => {
    focusInView(account);

    expect(document.activeElement).toBe(account);
    expect(shown).not.toHaveBeenCalled();
    expect(scrolled).toHaveBeenCalledWith({ top: -4, behavior: 'instant' });
  });
});

describe('Given the view band sent to a page on its own, as Playwright sends a function by its source text', () => {
  it('when it is rebuilt from its own source and measures a control in the banner, then it measures the same band, needing nothing else of its module', () => {
    const banner = document.createElement('header');
    const account = document.createElement('button');
    banner.append(account);
    document.body.append(banner);
    const alone = new Function(`return (${viewBand.toString()})`)() as typeof viewBand;

    expect(alone(account)).toEqual(viewBand(account));

    banner.remove();
  });
});
