const LIVE_ONLY_ATTRIBUTES = ['name', 'autofocus', 'for', 'form'];
const LEFT_OUT = 'iframe, video, audio, object, embed, dialog';

export function stillCopyOf(page: HTMLElement): HTMLElement {
  const copy = page.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(LEFT_OUT).forEach((element) => element.remove());
  [copy, ...Array.from(copy.querySelectorAll('*'))].forEach((element) => {
    if (element.closest('svg') === null) {
      element.removeAttribute('id');
    }
    LIVE_ONLY_ATTRIBUTES.forEach((attribute) => element.removeAttribute(attribute));
  });
  return copy;
}
