const AT_THE_END_WITHIN_PX = 2;

export interface ScrolledView {
  readonly scrollY: number;
  readonly innerHeight: number;
  readonly document: { readonly documentElement: { readonly scrollHeight: number } };
  scrollTo(options: ScrollToOptions): void;
}

function standsAtTheEnd(view: ScrolledView): boolean {
  const { scrollHeight } = view.document.documentElement;
  return view.scrollY > 0 && view.scrollY + view.innerHeight >= scrollHeight - AT_THE_END_WITHIN_PX;
}

export function keepThePageEnd(view: ScrolledView | null, addRoom: () => void): void {
  const atTheEnd = view !== null && standsAtTheEnd(view);
  addRoom();
  if (atTheEnd) {
    view.scrollTo({ top: view.document.documentElement.scrollHeight, behavior: 'instant' });
  }
}
