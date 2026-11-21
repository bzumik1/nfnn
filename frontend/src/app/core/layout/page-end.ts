const AT_THE_END_WITHIN_PX = 2;

export interface ScrolledView {
  readonly scrollY: number;
  readonly innerHeight: number;
  readonly visualViewport?: { readonly pageTop: number; readonly height: number } | null;
  readonly document: { readonly documentElement: { readonly scrollHeight: number } };
  scrollTo(options: ScrollToOptions): void;
}

export interface HeldScroll {
  readonly holding: boolean;
}

export interface SettlingPlacement {
  readonly settling: boolean;
}

function shownBottom(view: ScrolledView): number {
  const shown = view.visualViewport;
  return shown ? shown.pageTop + shown.height : view.scrollY + view.innerHeight;
}

function standsAtTheEnd(view: ScrolledView): boolean {
  const { scrollHeight } = view.document.documentElement;
  return view.scrollY > 0 && shownBottom(view) >= scrollHeight - AT_THE_END_WITHIN_PX;
}

export function keepThePageEnd(
  view: ScrolledView | null,
  scrollHold: HeldScroll,
  placement: SettlingPlacement,
  addRoom: () => void,
): void {
  const placeIsKept = scrollHold.holding || placement.settling;
  const atTheEnd = view !== null && !placeIsKept && standsAtTheEnd(view);
  addRoom();
  if (atTheEnd) {
    view.scrollTo({ top: view.document.documentElement.scrollHeight, behavior: 'instant' });
  }
}
