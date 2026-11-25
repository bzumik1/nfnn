import { AnimationCallbackEvent } from '@angular/core';

export function leavesAsInTheBrowser(
  row: HTMLElement,
  leave: (event: AnimationCallbackEvent) => void,
  completes: (row: HTMLElement) => void,
  leavingWith: HTMLElement = row,
): () => void {
  const list = leavingWith.parentNode!;
  const siblings = Array.from(list.childNodes);
  const following = siblings.slice(siblings.indexOf(leavingWith) + 1);
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  row.getAnimations = () =>
    [
      {
        effect: { getComputedTiming: () => ({ endTime: 60_000 }) },
        playState: 'running',
        finished,
      },
    ] as never;
  const removal = new MutationObserver(() => {
    if (leavingWith.isConnected) {
      return;
    }
    removal.disconnect();
    list.insertBefore(leavingWith, following.find((node) => node.parentNode === list) ?? null);
    leave({ target: row, animationComplete: () => completes(row) } as AnimationCallbackEvent);
  });
  removal.observe(list, { childList: true });
  return finish;
}
