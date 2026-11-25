import { focusInView } from './focus-in-view';

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
