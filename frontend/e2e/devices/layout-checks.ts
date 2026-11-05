import type { Page } from '@playwright/test';

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
  known?: string;
}

export const MINIMUM_TARGET_PX = 24;
const STACKED_SHARE = 0.25;

export const LIMITS = { minimumTarget: MINIMUM_TARGET_PX, stackedShare: STACKED_SHARE };
const LISTED = 6;

export interface Findings {
  pageWidth: number;
  viewportWidth: number;
  wideElements: string[];
  cutOff: string[];
  clippedControls: string[];
  stacked: string[];
  covered: string[];
  focusCovered: string[];
  smallTargets: string[];
  clippedText: string[];
}

export function collectFindings(limits: { minimumTarget: number; stackedShare: number }): Findings {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const modal = document.querySelector('dialog:modal');
  const scope: ParentNode = modal ?? document;
  const controlSelector = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="switch"]',
  ].join(',');

  const describe = (element: Element): string => {
    const label =
      element.getAttribute('aria-label') ??
      (element as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') ??
      '';
    const classes = [...element.classList].slice(0, 2).join('.');
    const tag = element.tagName.toLowerCase() + (classes ? `.${classes}` : '');
    const box = element.getBoundingClientRect();
    const where = `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}`;
    return `${tag}${label ? ` "${label.slice(0, 40)}"` : ''} at ${where}`;
  };

  const shown = (element: Element): boolean => {
    if (element.closest('[inert]')) {
      return false;
    }
    const box = element.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) {
      return false;
    }
    return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };

  const layer = (element: Element): Element | null => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      if (position === 'fixed' || position === 'sticky') {
        return node;
      }
    }
    return null;
  };

  const insideScroller = (element: Element, axis: 'x' | 'y'): boolean => {
    for (
      let node = element.parentElement;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      const overflow = axis === 'x' ? style.overflowX : style.overflowY;
      const scrolls =
        axis === 'x' ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight;
      if ((overflow === 'auto' || overflow === 'scroll') && scrolls) {
        return true;
      }
    }
    return false;
  };

  const intersection = (a: DOMRect, b: DOMRect): number =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  const inViewport = (box: DOMRect): boolean =>
    box.right > 0 && box.left < viewportWidth && box.bottom > 0 && box.top < viewportHeight;

  const controls = [...scope.querySelectorAll(controlSelector)].filter(shown);
  const onScreen = controls.filter((element) => inViewport(element.getBoundingClientRect()));

  const wideElements = [...document.body.querySelectorAll('*')]
    .filter((element) => {
      const box = element.getBoundingClientRect();
      return (
        box.right > viewportWidth + 1 &&
        box.width > 0 &&
        !insideScroller(element, 'x') &&
        getComputedStyle(element).position !== 'fixed' &&
        ![...element.children].some(
          (child) => child.getBoundingClientRect().right > viewportWidth + 1,
        )
      );
    })
    .filter(shown)
    .map(describe);

  const cutOff = onScreen
    .filter((element) => {
      const box = element.getBoundingClientRect();
      const sideways =
        (box.left < -1 || box.right > viewportWidth + 1) && !insideScroller(element, 'x');
      const fixed =
        layer(element) !== null && getComputedStyle(layer(element)!).position === 'fixed';
      const vertically =
        fixed && (box.top < -1 || box.bottom > viewportHeight + 1) && !insideScroller(element, 'y');
      return sideways || vertically;
    })
    .map(describe);

  const clippedBy = (element: Element): boolean => {
    const box = element.getBoundingClientRect();
    let position = getComputedStyle(element).position;
    for (
      let node = element.parentElement;
      node && node !== document.body && position !== 'fixed';
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      const containsAbsolute = style.position !== 'static' || style.transform !== 'none';
      if (position === 'absolute' && !containsAbsolute) {
        continue;
      }
      if (style.position !== 'static') {
        position = style.position;
      }
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        return false;
      }
      if (style.overflowX === 'hidden' || style.overflowX === 'clip') {
        const bounds = node.getBoundingClientRect();
        const partlyInside = box.right > bounds.left && box.left < bounds.right;
        if (partlyInside && (box.left < bounds.left - 1 || box.right > bounds.right + 1)) {
          return true;
        }
      }
    }
    return false;
  };

  const clippedControls = controls
    .filter((element) => {
      const box = element.getBoundingClientRect();
      return box.right > 0 && box.left < viewportWidth;
    })
    .filter(clippedBy)
    .map(describe);

  const textField = (element: Element): boolean =>
    element.tagName === 'TEXTAREA' ||
    (element.tagName === 'INPUT' &&
      ![
        'button',
        'checkbox',
        'radio',
        'submit',
        'reset',
        'image',
        'range',
        'color',
        'file',
      ].includes((element as HTMLInputElement).type));
  const within = (inner: DOMRect, outer: DOMRect): boolean =>
    inner.left >= outer.left - 1 &&
    inner.right <= outer.right + 1 &&
    inner.top >= outer.top - 1 &&
    inner.bottom <= outer.bottom + 1;
  const buttonInField = (a: Element, boxA: DOMRect, b: Element, boxB: DOMRect): boolean =>
    (textField(a) && !textField(b) && within(boxB, boxA)) ||
    (textField(b) && !textField(a) && within(boxA, boxB));

  const stacked: string[] = [];
  onScreen.forEach((a, index) => {
    const boxA = a.getBoundingClientRect();
    for (const b of onScreen.slice(index + 1)) {
      if (a.contains(b) || b.contains(a) || layer(a) !== layer(b)) {
        continue;
      }
      const boxB = b.getBoundingClientRect();
      if (buttonInField(a, boxA, b, boxB)) {
        continue;
      }
      const smaller = Math.min(boxA.width * boxA.height, boxB.width * boxB.height);
      if (intersection(boxA, boxB) >= smaller * limits.stackedShare) {
        stacked.push(`${describe(a)} and ${describe(b)}`);
      }
    }
  });

  const coveredAtCentre = (element: Element): Element | null => {
    const box = element.getBoundingClientRect();
    const x = Math.min(Math.max(box.left + box.width / 2, 0), viewportWidth - 1);
    const y = Math.min(Math.max(box.top + box.height / 2, 0), viewportHeight - 1);
    const hit = document.elementFromPoint(x, y);
    if (!hit || element.contains(hit) || hit.contains(element)) {
      return null;
    }
    const label = hit.closest('label');
    if (label && (label.control === element || label.contains(element))) {
      return null;
    }
    return hit;
  };

  const openDisclosures = [...document.querySelectorAll('[aria-expanded="true"][aria-controls]')]
    .map((toggle) => document.getElementById(toggle.getAttribute('aria-controls') ?? ''))
    .filter((panel): panel is HTMLElement => panel !== null);
  const atTop = window.scrollY === 0;
  const atEnd = window.scrollY + viewportHeight >= document.documentElement.scrollHeight - 1;
  const scrolledUnder = (chrome: Element): boolean => {
    const box = chrome.getBoundingClientRect();
    return box.top + box.height / 2 > viewportHeight / 2 ? !atEnd : !atTop;
  };
  const covered = onScreen
    .map((element) => ({ element, hit: coveredAtCentre(element) }))
    .filter(({ element, hit }) => {
      if (
        !hit ||
        openDisclosures.some((panel) => panel.contains(hit) && !panel.contains(element))
      ) {
        return false;
      }
      const chrome = layer(hit);
      const scrolledUnderChrome =
        chrome !== null && chrome !== layer(element) && scrolledUnder(chrome);
      return !scrolledUnderChrome;
    })
    .map(({ element, hit }) => `${describe(element)} under ${describe(hit!)}`);

  const focused = document.activeElement;
  const focusCovered =
    focused &&
    focused.matches(controlSelector) &&
    shown(focused) &&
    inViewport(focused.getBoundingClientRect())
      ? [coveredAtCentre(focused)]
          .filter((hit): hit is Element => hit !== null && layer(hit) !== layer(focused))
          .map((hit) => `${describe(focused)} under ${describe(hit)}`)
      : [];

  const inlineInText = (element: Element): boolean => {
    if (element.tagName !== 'A' || getComputedStyle(element).display !== 'inline') {
      return false;
    }
    const block = element.parentElement;
    const own = (element.textContent ?? '').trim().length;
    return !!block && (block.textContent ?? '').trim().length > own;
  };

  const pageWidth = document.documentElement.scrollWidth;
  const targets = controls.filter((element) => {
    const box = element.getBoundingClientRect();
    return box.right > 0 && box.left < pageWidth && !inlineInText(element);
  });
  const undersized = (element: Element): boolean => {
    const box = element.getBoundingClientRect();
    const type = element.getAttribute('type');
    const labelled =
      (type === 'checkbox' || type === 'radio') && !!(element as HTMLInputElement).labels?.length;
    return (box.width < limits.minimumTarget || box.height < limits.minimumTarget) && !labelled;
  };
  const centre = (box: DOMRect) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const distanceToBox = (point: { x: number; y: number }, box: DOMRect): number =>
    Math.hypot(
      Math.max(box.left - point.x, 0, point.x - box.right),
      Math.max(box.top - point.y, 0, point.y - box.bottom),
    );
  const radius = limits.minimumTarget / 2;
  const tooClose = (element: Element): boolean => {
    const own = centre(element.getBoundingClientRect());
    return targets.some((other) => {
      if (
        other === element ||
        other.contains(element) ||
        element.contains(other) ||
        layer(other) !== layer(element)
      ) {
        return false;
      }
      const box = other.getBoundingClientRect();
      if (undersized(other)) {
        const theirs = centre(box);
        return Math.hypot(own.x - theirs.x, own.y - theirs.y) < limits.minimumTarget;
      }
      return distanceToBox(own, box) < radius;
    });
  };
  const smallTargets = targets
    .filter((element) => undersized(element) && tooClose(element))
    .map(describe);

  const clippedText = [...scope.querySelectorAll('*')]
    .filter((element) => {
      const hasText = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0,
      );
      if (!hasText || !shown(element)) {
        return false;
      }
      const style = getComputedStyle(element);
      const clips = style.overflowX === 'hidden' || style.overflowX === 'clip';
      return (
        clips && style.textOverflow !== 'ellipsis' && element.scrollWidth > element.clientWidth + 1
      );
    })
    .map(describe);

  return {
    pageWidth,
    viewportWidth,
    wideElements,
    cutOff,
    clippedControls,
    stacked,
    covered,
    focusCovered,
    smallTargets,
    clippedText,
  };
}

function list(items: string[]): string {
  if (items.length === 0) {
    return 'none';
  }
  const more = items.length > LISTED ? `, and ${items.length - LISTED} more` : '';
  return items.slice(0, LISTED).join('; ') + more;
}

export async function layoutChecks(page: Page, pageErrors: string[]): Promise<Check[]> {
  return checksFrom(await page.evaluate(collectFindings, LIMITS), pageErrors);
}

export function checksFrom(found: Findings, pageErrors: string[]): Check[] {
  return [
    { name: 'no script error', pass: pageErrors.length === 0, detail: list(pageErrors) },
    {
      name: 'no sideways scroll of the page',
      pass: found.pageWidth <= found.viewportWidth + 1,
      detail:
        found.pageWidth <= found.viewportWidth + 1
          ? 'none'
          : `${found.pageWidth} px wide in ${found.viewportWidth} px: ${list(found.wideElements)}`,
    },
    {
      name: 'no control cut off by the screen edge',
      pass: found.cutOff.length === 0,
      detail: list(found.cutOff),
    },
    {
      name: 'no control cut off by a box that hides its overflow',
      pass: found.clippedControls.length === 0,
      detail: list(found.clippedControls),
    },
    {
      name: 'no controls stacked on each other',
      pass: found.stacked.length === 0,
      detail: list(found.stacked),
    },
    {
      name: 'no control covered by another element',
      pass: found.covered.length === 0,
      detail: list(found.covered),
    },
    {
      name: 'the focused control is not under a fixed bar',
      pass: found.focusCovered.length === 0,
      detail: list(found.focusCovered),
    },
    {
      name: `every target at least ${MINIMUM_TARGET_PX} px`,
      pass: found.smallTargets.length === 0,
      detail: list(found.smallTargets),
    },
    {
      name: 'no text cut off by its box',
      pass: found.clippedText.length === 0,
      detail: list(found.clippedText),
    },
  ];
}
