export function restPillOn(bar: HTMLElement, pill: HTMLElement, tab: HTMLElement): void {
  const barBox = bar.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();
  pill.style.width = `${tabBox.width}px`;
  pill.style.height = `${tabBox.height}px`;
  pill.style.translate = `${tabBox.left - barBox.left - bar.clientLeft}px ${tabBox.top - barBox.top - bar.clientTop}px`;
}

export function settleStyle(pill: HTMLElement): void {
  void pill.ownerDocument.defaultView?.getComputedStyle(pill).translate;
}
