import { PageTransitionKind } from './page-transition-kind';
import {
  BarItem,
  FollowedTitle,
  IN_SHEET_CLASS,
  KeptPage,
  liveDialogs,
  motionAllowed,
  ON_GROUND_CLASS,
  PAGE_COVER_LONGEST_MS,
  PAGE_TRANSITION_CLASS,
  PageTransitions,
  PANEL_SCROLL,
  PlacedPage,
  Running,
  SHEET_PANEL,
  SheetLooks,
  SheetStep,
  STANDING_DIALOG,
} from './page-transitions';
import { stillCopyOf } from './still-copy';

const SHEET_HEAD = 'app-sheet-head';
const HEADS_HELD_CLASS = `${PAGE_TRANSITION_CLASS}--heads-held`;
const SHEET_TITLE = '.sheet-head-title';
const BACKDROP_LOOKS = [
  'background-color',
  'opacity',
  'backdrop-filter',
  '-webkit-backdrop-filter',
];

export const SHEET_STEPPING: SheetLooks = { stepInSheet, standingSheetCopy, holdHeads };

function stepInSheet(stage: PageTransitions, step: SheetStep): void {
  const view = stage.document.defaultView;
  const handOver = stage.sheetHandOver;
  if (handOver !== null) {
    stage.sheetHandOver = null;
    step.change();
    stage.afterRender(() => {
      step.placed();
      if (stage.running === handOver) {
        stage.finish();
      }
    });
    return;
  }
  const moves = view !== null && stage.compact() && motionAllowed(view) && stage.running === null;
  const leaving = moves ? standingSheetCopy(stage) : null;
  if (view === null || leaving === null) {
    step.change();
    stage.afterRender(step.placed);
    return;
  }
  if (step.kind === 'push') {
    stage.keptSheets.set(step.depth - 1, {
      sheet: leaving,
      width: view.innerWidth,
      owner: step.owner,
    });
  }
  const overlay = sheetOverlay(stage, step.kind);
  const left = stage.place(
    overlay,
    sheetOnly(stage, leaving),
    step.kind === 'push' ? 'under' : 'over',
  );
  stage.dressChrome(overlay, left, null);
  const running: Running = {
    kind: step.kind,
    overlay,
    swiping: false,
    sheet: leaving,
    revealed: true,
  };
  stage.running = running;
  stage.sheetUnder(leaving);
  stage.finishing = view.setTimeout(() => stage.finish(), PAGE_COVER_LONGEST_MS);
  step.change();
  stage.afterRender(() => {
    step.placed();
    if (stage.running !== running) {
      return;
    }
    const arriving = standingSheetCopy(stage);
    if (arriving === null) {
      stage.finish();
      return;
    }
    stage.moveTo(running, view, sheetOnly(stage, arriving));
  });
}

export function sheetOnly(stage: PageTransitions, sheet: HTMLElement): KeptPage {
  return {
    copy: null,
    scrollY: 0,
    ground: 'transparent',
    width: stage.document.defaultView?.innerWidth ?? 0,
    sheet,
  };
}

export function sheetOverlay(stage: PageTransitions, kind: PageTransitionKind): HTMLElement {
  const overlay = stage.overlay(kind);
  overlay.classList.add(ON_GROUND_CLASS, IN_SHEET_CLASS);
  return overlay;
}

export function standingSheetCopy(stage: PageTransitions): HTMLElement | null {
  const document = stage.document;
  const top = liveDialogs(document, STANDING_DIALOG).at(-1);
  const view = document.defaultView;
  if (top === undefined || view === null) {
    return null;
  }
  const layer = document.createElement('div');
  layer.className = `${PAGE_TRANSITION_CLASS}__sheet`;
  const backdrop = document.createElement('div');
  backdrop.className = `${PAGE_TRANSITION_CLASS}__sheet-backdrop`;
  const look = view.getComputedStyle(top, '::backdrop');
  BACKDROP_LOOKS.forEach((property) =>
    backdrop.style.setProperty(property, look.getPropertyValue(property)),
  );
  layer.append(backdrop, stillCopyOf(top));
  const panel = top.querySelector<HTMLElement>(SHEET_PANEL);
  layer.dataset[PANEL_SCROLL] = String(panel?.scrollTop ?? 0);
  return layer;
}

function holdHeads(
  stage: PageTransitions,
  overlay: HTMLElement,
  bar: HTMLElement,
  leaving: PlacedPage | null,
  arriving: PlacedPage | null,
  titles: FollowedTitle[],
): BarItem[] {
  const out = headOf(leaving);
  const into = headOf(arriving);
  const held = leaving !== null && arriving !== null && out !== null && into !== null;
  overlay.classList.toggle(HEADS_HELD_CLASS, held);
  if (!held) {
    if (arriving !== null) {
      stage.addTitle(titles, out?.querySelector<HTMLElement>(SHEET_TITLE), true, false);
      stage.addTitle(titles, into?.querySelector<HTMLElement>(SHEET_TITLE), false, false);
    }
    return [];
  }
  const standing = standingCopy(bar, into, arriving.box);
  const leavingHead = standingCopy(bar, out, leaving.box);
  stage.addTitle(titles, leavingHead.querySelector<HTMLElement>(SHEET_TITLE), true);
  stage.addTitle(titles, standing.querySelector<HTMLElement>(SHEET_TITLE), false);
  return [stage.barItem(standing, 'still'), stage.barItem(leavingHead, 'out')];
}

function headOf(page: PlacedPage | null): HTMLElement | null {
  return (
    page?.box.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__sheet ${SHEET_HEAD}`) ??
    page?.copy?.querySelector<HTMLElement>(SHEET_HEAD) ??
    null
  );
}

function standingCopy(bar: HTMLElement, head: HTMLElement, box: HTMLElement): HTMLElement {
  const place = head.getBoundingClientRect();
  const origin = box.getBoundingClientRect();
  const copy = head.cloneNode(true) as HTMLElement;
  copy.classList.add(`${PAGE_TRANSITION_CLASS}__head`);
  copy.style.position = 'absolute';
  copy.style.margin = '0';
  copy.style.top = `${place.top - origin.top}px`;
  copy.style.left = `${place.left - origin.left}px`;
  copy.style.width = `${place.width}px`;
  copy.style.height = `${place.height}px`;
  bar.append(copy);
  return copy;
}
