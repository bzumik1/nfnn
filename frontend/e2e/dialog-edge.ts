import { Locator } from '@playwright/test';
import { expect } from './fixtures';

interface PanelEdge {
  actionBottom: number;
  visibleBottom: number;
  moreBelow: boolean;
  cuedAtEdge: boolean;
}

export async function expectActionInSightOrCuedBelow(
  panel: Locator,
  action: Locator,
): Promise<void> {
  const edge = await panel.evaluate(
    (element, button): PanelEdge => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        actionBottom: (button as Element).getBoundingClientRect().bottom,
        visibleBottom: Math.min(box.bottom, window.innerHeight),
        moreBelow: element.scrollHeight - element.clientHeight - element.scrollTop > 1,
        cuedAtEdge:
          (style.backgroundImage.match(/linear-gradient/g) ?? []).length >= 2 &&
          style.backgroundAttachment.includes('local') &&
          style.backgroundAttachment.includes('scroll'),
      };
    },
    await action.elementHandle(),
  );
  if (edge.actionBottom <= edge.visibleBottom) {
    return;
  }
  expect(edge.moreBelow).toBe(true);
  expect(edge.cuedAtEdge).toBe(true);
}
