const LIVE_ONLY_ATTRIBUTES = ['name', 'autofocus', 'for', 'form'];
const RELOADING = 'iframe, video, audio, object, embed';

export interface StillCopyOptions {
  readonly withTabBar: boolean;
}

export function stillCopyOf(page: HTMLElement, options: StillCopyOptions): HTMLElement {
  const copy = page.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(RELOADING).forEach((element) => element.remove());
  if (!options.withTabBar) {
    copy.querySelectorAll('app-tab-bar').forEach((element) => element.remove());
  }
  [copy, ...Array.from(copy.querySelectorAll('*'))].forEach((element) => {
    if (element.closest('svg') === null) {
      element.removeAttribute('id');
    }
    LIVE_ONLY_ATTRIBUTES.forEach((attribute) => element.removeAttribute(attribute));
  });
  return copy;
}
