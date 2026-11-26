import { Page, TestInfo } from '@playwright/test';

export async function probeTheReveal(page: Page, info: TestInfo): Promise<void> {
  if (info.retry === 0) {
    await page.context().tracing.start({ screenshots: true, snapshots: true });
  }
  await page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { probe2055: unknown[] }).probe2055 = log;
    const now = () => Math.round(performance.now() * 10) / 10;
    const name = (element: unknown) =>
      element instanceof Element
        ? `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}.${Array.from(element.classList).join('.')}`
        : String(element);
    const emptyText = () =>
      document.querySelector<HTMLElement>('.passkeys-empty, .passkeys-warning');
    const place = () => {
      const text = emptyText();
      const list = document.querySelector('ul.passkey-list');
      const note = document.querySelector('.account-row-note');
      return {
        scrollY: scrollY,
        textTop: text ? Math.round(text.getBoundingClientRect().top * 10) / 10 : null,
        textClass: text ? text.className : null,
        listTop: list ? Math.round(list.getBoundingClientRect().top * 10) / 10 : null,
        listHeight: list ? Math.round(list.getBoundingClientRect().height) : null,
        note: note !== null,
        focused: name(document.activeElement),
      };
    };
    const stack = () =>
      (new Error().stack ?? '')
        .split('\n')
        .slice(3, 8)
        .map((line) => line.trim())
        .join(' | ');
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (
      this: Element,
      options?: boolean | ScrollIntoViewOptions,
    ) {
      log.push({
        t: now(),
        ev: 'scrollIntoView',
        el: name(this),
        options,
        ...place(),
        stack: stack(),
      });
      scrollIntoView.call(this, options);
      log.push({ t: now(), ev: 'scrolledIntoView', ...place() });
    };
    for (const method of ['scrollTo', 'scrollBy'] as const) {
      const original = window[method] as (...args: unknown[]) => void;
      (window as unknown as Record<string, unknown>)[method] = function (
        this: Window,
        ...args: unknown[]
      ) {
        log.push({ t: now(), ev: method, args: JSON.stringify(args), scrollY, stack: stack() });
        original.apply(this, args);
      };
    }
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
      log.push({ t: now(), ev: 'focus()', el: name(this), options, stack: stack() });
      focus.call(this, options);
    };
    (window as unknown as { place2055: () => unknown }).place2055 = place;
    const getAnimations = Element.prototype.getAnimations;
    Element.prototype.getAnimations = function (this: Element, options?: GetAnimationsOptions) {
      const found = getAnimations.call(this, options);
      if (this.matches('.passkeys-empty, .passkeys-warning, .passkey-slot, .passkeys button')) {
        log.push({
          t: now(),
          ev: 'getAnimations',
          el: name(this),
          connected: this.isConnected,
          found: found.map((motion) => {
            const css = motion as Animation & {
              animationName?: string;
              transitionProperty?: string;
            };
            return `${css.animationName ?? css.transitionProperty ?? '?'}:${motion.playState}`;
          }),
          stack: stack(),
        });
      }
      return found;
    };
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes') {
            const element = record.target as Element;
            if (element.matches('.passkeys-empty, .passkeys-warning, .passkey-slot')) {
              log.push({ t: now(), ev: 'class', el: name(element), old: record.oldValue });
            }
            continue;
          }
          for (const node of Array.from(record.removedNodes)) {
            if (
              node instanceof Element &&
              node.matches(
                'ul.passkey-list, li.passkey-slot, .passkeys-empty, .passkeys-warning, .passkey-confirm, .account-row-note',
              )
            ) {
              log.push({ t: now(), ev: 'removed', el: name(node) });
            }
          }
          for (const node of Array.from(record.addedNodes)) {
            if (
              node instanceof Element &&
              node.matches('.passkeys-empty, .passkeys-warning, .account-row-note, ul.passkey-list')
            ) {
              log.push({ t: now(), ev: 'added', el: name(node) });
            }
          }
        }
      }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
      });
      new ResizeObserver(() =>
        log.push({
          t: now(),
          ev: 'page-size',
          scrollHeight: document.documentElement.scrollHeight,
          scrollY,
        }),
      ).observe(document.body);
    });
    for (const type of ['loading', 'loadingdone', 'loadingerror'] as const) {
      document.fonts.addEventListener(type, (event) =>
        log.push({
          t: now(),
          ev: `fonts-${type}`,
          faces: (event as FontFaceSetLoadEvent).fontfaces.map(
            (face) => `${face.family} ${face.weight} ${face.style} ${face.unicodeRange}`,
          ),
        }),
      );
    }
    addEventListener('scroll', () => log.push({ t: now(), ev: 'scroll', scrollY }), {
      capture: true,
      passive: true,
    });
    addEventListener(
      'focusin',
      (event) => log.push({ t: now(), ev: 'focusin', el: name(event.target) }),
      true,
    );
    addEventListener(
      'focusout',
      (event) => log.push({ t: now(), ev: 'focusout', el: name(event.target) }),
      true,
    );
    for (const type of [
      'animationstart',
      'animationend',
      'animationcancel',
      'transitionend',
      'transitioncancel',
    ]) {
      addEventListener(
        type,
        (event) => {
          const motion = event as AnimationEvent & TransitionEvent;
          log.push({
            t: now(),
            ev: type,
            el: name(event.target),
            n: motion.animationName ?? motion.propertyName,
          });
        },
        true,
      );
    }
    addEventListener(
      'click',
      (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.passkey-confirm')) {
          return;
        }
        log.push({ t: now(), ev: 'confirm-click', ...place() });
        const until = performance.now() + 3000;
        const sample = () => {
          log.push({ t: now(), ev: 'frame' });
          if (performance.now() < until) {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      },
      true,
    );
  });
}

export async function keepTheProbe(page: Page, info: TestInfo, outcome: string): Promise<void> {
  const log = await page.evaluate(() => {
    const probed = window as unknown as { probe2055: unknown[]; place2055: () => unknown };
    return [...probed.probe2055, { ev: 'end', ...(probed.place2055() as object) }];
  });
  await info.attach(`probe-2055-${outcome}`, {
    body: JSON.stringify(log, null, 1),
    contentType: 'application/json',
  });
  if (info.retry > 0) {
    return;
  }
  if (outcome.endsWith('failed')) {
    const path = info.outputPath('probe-2055-trace.zip');
    await page.context().tracing.stop({ path });
    await info.attach('probe-2055-trace', { path, contentType: 'application/zip' });
  } else {
    await page.context().tracing.stop();
  }
}
