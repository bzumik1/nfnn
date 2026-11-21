import { restoringPlace } from '../navigation/growing-page';

const AT_THE_END_WITHIN_PX = 2;

export interface ScrolledView {
  readonly scrollY: number;
  readonly innerHeight: number;
  readonly visualViewport?: { readonly height: number } | null;
  readonly document: { readonly documentElement: { readonly scrollHeight: number } };
  scrollTo(options: ScrollToOptions): void;
}

export interface HeldScroll {
  readonly holding: boolean;
}

function standsAtTheEnd(view: ScrolledView): boolean {
  const { scrollHeight } = view.document.documentElement;
  const shownHeight = view.visualViewport?.height ?? view.innerHeight;
  return view.scrollY > 0 && view.scrollY + shownHeight >= scrollHeight - AT_THE_END_WITHIN_PX;
}

export function keepThePageEnd(
  view: ScrolledView | null,
  scrollHold: HeldScroll,
  addRoom: () => void,
  restoring: () => boolean = restoringPlace,
): void {
  const placeIsKept = scrollHold.holding || restoring();
  const atTheEnd = view !== null && !placeIsKept && standsAtTheEnd(view);
  addRoom();
  if (atTheEnd) {
    view.scrollTo({ top: view.document.documentElement.scrollHeight, behavior: 'instant' });
  }
}
