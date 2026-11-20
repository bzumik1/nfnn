import type { Page } from '@playwright/test';

export async function keptTogetherOffScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offScreen: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (const run of text.matchAll(/[^ \t\r\n]*\u00a0[^ \t\r\n]*/g)) {
        const range = document.createRange();
        range.setStart(node, run.index);
        range.setEnd(node, run.index + run[0].length);
        for (const box of range.getClientRects()) {
          if (box.width > 0 && (box.left < 0 || box.right > window.innerWidth)) {
            offScreen.push(`${run[0]} ${Math.round(box.left)}..${Math.round(box.right)}`);
          }
        }
      }
    }
    return offScreen;
  });
}

const KEPT_TOGETHER_ON_MAIN = [
  /^\(?\d[\d\u00a0]*(?:,\d{2})?\u00a0(?:Kč|kB)\)?[.,]?$/u,
  /^\d{1,2}\.\u00a0\d{1,2}\.$/u,
  /^\d{1,2}\.\u00a0\p{L}+\u00a0\d{4}[.,]?$/u,
  /^\(EU\)\u00a02016\/679,$/u,
  /^č\.\u00a0110\/2019\u00a0Sb\.,$/u,
  /^(?:Pavel|Andrea|Zdeňka)\u00a0Znamenáč/u,
  /Ústí\u00a0nad\u00a0Labem/u,
  /^k\u00a0lepšímu$/u,
];

export async function keptTogetherTooWide(page: Page): Promise<string[]> {
  return page.evaluate(
    (sources) => {
      const keptOnMain = sources.map((source) => new RegExp(source, 'u'));
      const findings: string[] = [];
      const widthOf = (node: Node, from: number, to: number) => {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        return [...range.getClientRects()];
      };
      const scrollsSideways = (element: Element) => {
        for (let parent: Element | null = element; parent; parent = parent.parentElement) {
          if (['MAIN', 'BODY', 'HTML'].includes(parent.tagName) || parent.querySelector('h1')) {
            return false;
          }
          const overflow = getComputedStyle(parent).overflowX;
          if (['auto', 'scroll'].includes(overflow) && parent.scrollWidth > parent.clientWidth) {
            return true;
          }
        }
        return false;
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        if (!text.includes('\u00a0')) {
          continue;
        }
        let holder = node.parentElement;
        while (holder && ['inline', 'contents'].includes(getComputedStyle(holder).display)) {
          holder = holder.parentElement;
        }
        if (
          !holder ||
          holder.closest('.visually-hidden, [hidden], [inert], [aria-hidden="true"]') ||
          getComputedStyle(holder).visibility === 'hidden' ||
          scrollsSideways(holder)
        ) {
          continue;
        }
        const style = getComputedStyle(holder);
        const edges = holder.getBoundingClientRect();
        const line =
          holder.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (line <= 0) {
          continue;
        }
        const where = `${holder.tagName.toLowerCase()}.${holder.className}`;
        for (const run of text.matchAll(/[^ \t\r\n]*\u00a0[^ \t\r\n]*/g)) {
          if (keptOnMain.some((pattern) => pattern.test(run[0]))) {
            continue;
          }
          const boxes = widthOf(node, run.index, run.index + run[0].length).filter(
            (box) => box.width > 0,
          );
          const group = boxes.reduce((sum, box) => sum + box.width, 0);
          if (/^\u00a0[–—]/.test(run[0])) {
            const right = Math.max(...boxes.map((box) => box.right));
            if (right > edges.right + 0.5) {
              findings.push(
                `dash past the edge: "${run[0]}" in ${where}, dash ends ${Math.round(right - edges.right)} px past a line of ${Math.round(line)} px`,
              );
            }
            continue;
          }
          let offset = run.index;
          let widest = 0;
          for (const word of run[0].split('\u00a0')) {
            const width = widthOf(node, offset, offset + word.length).reduce(
              (sum, box) => sum + box.width,
              0,
            );
            widest = Math.max(widest, width);
            offset += word.length + 1;
          }
          if (group > line + 0.5 && widest <= line + 0.5) {
            findings.push(
              `wider than the line: "${run[0]}" in ${where}, group ${Math.round(group)} px, line ${Math.round(line)} px`,
            );
          }
        }
      }
      return findings;
    },
    KEPT_TOGETHER_ON_MAIN.map((pattern) => pattern.source),
  );
}

export interface LongestKeptWord {
  readonly letters: number;
  readonly binding: string;
  readonly places: number;
}

export function oneLetterWordPairs(sources: readonly string[]): string[][] {
  const pairs = new Set<string>();
  for (const source of sources) {
    const text = source
      .replaceAll('&nbsp;', '\u00a0')
      .replaceAll('&#8209;', '\u2011')
      .replaceAll('\\u00a0', '\u00a0');
    for (const found of text.matchAll(
      /(?<=^|[\s(„“‚>"])([ksvzouaiKSVZOUAI])[ \t\r\n\u00a0]+([^\s\u00a0<>{}`$&\\"]+)/gu,
    )) {
      pairs.add(`${found[1]}\u00a0${found[2]}`);
    }
  }
  return [...pairs]
    .map((pair) => [pair, String(pair.slice(2).replace(/[^\p{L}\p{N}]/gu, '').length)])
    .filter(([, letters]) => letters !== '0');
}

export async function longestKeptWord(
  page: Page,
  pairs: readonly string[][],
): Promise<LongestKeptWord> {
  return page.evaluate((candidates) => {
    const ONE_LETTER_WORD = /(?:^|[\s(„“‚])[ksvzouaiKSVZOUAI][ \u00a0\n]/u;
    const PLACES = 'p, h1, h2, h3, h4, li, dd, th, td, .ui-badge, .ui-pill-button';
    const fontOf = (style: CSSStyleDeclaration) =>
      [
        style.fontStyle,
        style.fontWeight,
        style.fontSize,
        style.fontFamily,
        style.letterSpacing,
        style.wordSpacing,
      ].join('|');
    const shown = (element: HTMLElement) =>
      element.getBoundingClientRect().width > 1 &&
      !element.closest('.visually-hidden, [hidden], [inert], [aria-hidden="true"]');
    const ownText = (element: HTMLElement) =>
      [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join(' ');
    const contentWidth = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    };
    const lineOf = (element: HTMLElement) => {
      const display = getComputedStyle(element).display;
      const shrinks = display.startsWith('inline') || element.matches('.ui-badge, .ui-pill-button');
      return shrinks && element.parentElement
        ? contentWidth(element.parentElement)
        : contentWidth(element);
    };
    const places: { element: HTMLElement; font: string; style: CSSStyleDeclaration }[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(PLACES)) {
      if (!shown(element)) {
        continue;
      }
      if (ONE_LETTER_WORD.test(ownText(element))) {
        const style = getComputedStyle(element);
        places.push({ element, font: fontOf(style), style });
      }
      const label = element.dataset['label'];
      const before = getComputedStyle(element, '::before');
      if (label && ONE_LETTER_WORD.test(label) && before.content.includes(label)) {
        places.push({ element, font: fontOf(before), style: before });
      }
    }
    const widestByFont = new Map<string, Map<number, { pair: string; width: number }>>();
    let best = { letters: Number.POSITIVE_INFINITY, binding: 'every group fits its line' };
    for (const { element, font, style } of places) {
      const line = lineOf(element);
      if (line <= 0) {
        continue;
      }
      let widest = widestByFont.get(font);
      if (!widest) {
        widest = new Map();
        const probe = document.createElement('span');
        probe.style.cssText =
          'position: absolute; visibility: hidden; white-space: nowrap; inline-size: max-content;';
        probe.style.fontStyle = style.fontStyle;
        probe.style.fontWeight = style.fontWeight;
        probe.style.fontSize = style.fontSize;
        probe.style.fontFamily = style.fontFamily;
        probe.style.letterSpacing = style.letterSpacing;
        probe.style.wordSpacing = style.wordSpacing;
        document.body.append(probe);
        for (const [pair, letters] of candidates) {
          probe.textContent = pair;
          const width = probe.getBoundingClientRect().width;
          const length = Number(letters);
          if (width > (widest.get(length)?.width ?? -1)) {
            widest.set(length, { pair, width });
          }
        }
        probe.remove();
        widestByFont.set(font, widest);
      }
      const lengths = [...widest.keys()].sort((a, b) => a - b);
      const tooWide = lengths.find((length) => widest.get(length)!.width > line + 0.5);
      if (tooWide !== undefined && tooWide - 1 < best.letters) {
        const group = widest.get(tooWide)!;
        best = {
          letters: tooWide - 1,
          binding: `${element.tagName.toLowerCase()}.${element.className} line ${Math.round(line)} px: "${group.pair}" ${Math.round(group.width)} px`,
        };
      }
    }
    return { ...best, places: places.length };
  }, pairs);
}

export async function boldReservesApartFromTheirLabel(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const apart: string[] = [];
    const probe = document.createElement('span');
    probe.style.cssText =
      'position: absolute; visibility: hidden; white-space: pre; inline-size: max-content;';
    document.body.append(probe);
    const widthIn = (style: CSSStyleDeclaration, text: string) => {
      probe.style.fontStyle = style.fontStyle;
      probe.style.fontWeight = style.fontWeight;
      probe.style.fontSize = style.fontSize;
      probe.style.fontFamily = style.fontFamily;
      probe.style.letterSpacing = style.letterSpacing;
      probe.style.wordSpacing = style.wordSpacing;
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    };
    for (const element of document.querySelectorAll<HTMLElement>('[data-label]')) {
      const label = element.dataset['label'] ?? '';
      const shownText = (element.textContent ?? '').replace(/[ \t\r\n]+/g, ' ').trim();
      if (!label || !shownText.includes('\u00a0') || shownText.replace(/\u00a0/g, ' ') !== label) {
        continue;
      }
      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        if (!style.content.includes(label)) {
          continue;
        }
        const reserve = widthIn(style, label);
        const visible = widthIn(style, shownText);
        if (Math.abs(reserve - visible) > 0.5) {
          apart.push(
            `"${shownText}" in ${element.tagName.toLowerCase()}.${element.className}${pseudo}: reserve ${reserve.toFixed(1)} px, label ${visible.toFixed(1)} px`,
          );
        }
      }
    }
    probe.remove();
    return apart;
  });
}

export async function oneLetterGroupsPastTheirLine(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const past: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      let holder = node.parentElement;
      while (holder && ['inline', 'contents'].includes(getComputedStyle(holder).display)) {
        holder = holder.parentElement;
      }
      if (
        !text.includes('\u00a0') ||
        !holder ||
        holder.closest('.visually-hidden, [hidden], [inert], [aria-hidden="true"]') ||
        getComputedStyle(holder).visibility === 'hidden'
      ) {
        continue;
      }
      const style = getComputedStyle(holder);
      const edges = holder.getBoundingClientRect();
      const start = edges.left + holder.clientLeft + parseFloat(style.paddingLeft);
      const end =
        edges.left + holder.clientLeft + holder.clientWidth - parseFloat(style.paddingRight);
      for (const group of text.matchAll(
        /(?<=^|[\s(„“‚])[ksvzouaiKSVZOUAI](?:\u00a0[ksvzouaiKSVZOUAI])*\u00a0[^\s\u00a0]+/gu,
      )) {
        const range = document.createRange();
        range.setStart(node, group.index);
        range.setEnd(node, group.index + group[0].length);
        for (const box of range.getClientRects()) {
          if (box.width > 0 && (box.left < start - 0.5 || box.right > end + 0.5)) {
            past.push(
              `"${group[0]}" in ${holder.tagName.toLowerCase()}.${holder.className} reaches ${Math.round(box.left)}..${Math.round(box.right)} px, its line ${Math.round(start)}..${Math.round(end)} px`,
            );
            break;
          }
        }
      }
    }
    return past;
  });
}
