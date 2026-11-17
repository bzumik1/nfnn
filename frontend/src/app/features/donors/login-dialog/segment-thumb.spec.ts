import { placeThumb, restThumbOn } from './segment-thumb';

interface SegmentBox {
  left: number;
  top: number;
  width: number;
}

function group(boxes: SegmentBox[]): { group: HTMLElement; thumb: HTMLElement } {
  const element = document.createElement('div');
  for (const box of boxes) {
    const segment = document.createElement('button');
    Object.defineProperties(segment, {
      offsetLeft: { value: box.left },
      offsetTop: { value: box.top },
      offsetWidth: { value: box.width },
    });
    element.append(segment);
  }
  const thumb = document.createElement('span');
  element.append(thumb);
  return { group: element, thumb };
}

describe('Given a choice of two segments side by side', () => {
  const sideBySide = [
    { left: 2, top: 2, width: 160 },
    { left: 162, top: 2, width: 160 },
  ];

  it('when the second is selected, then the thumb takes its width at once and moves by its own width', () => {
    const { group: choice, thumb } = group(sideBySide);

    expect(restThumbOn(choice, thumb, 1)).toBe(true);
    expect(thumb.style.width).toBe('160px');
    expect(thumb.style.translate).toBe('100% 0');
  });

  it('when the first is selected, then the thumb rests at the start', () => {
    const { group: choice, thumb } = group(sideBySide);

    expect(restThumbOn(choice, thumb, 0)).toBe(true);
    expect(thumb.style.translate).toBe('0% 0');
  });
});

describe('Given a choice whose segments wrapped onto two rows', () => {
  it('when one is selected, then the thumb stays out and the segment shows the choice itself', () => {
    const { group: choice, thumb } = group([
      { left: 2, top: 2, width: 320 },
      { left: 2, top: 40, width: 320 },
    ]);

    expect(restThumbOn(choice, thumb, 1)).toBe(false);
    expect(thumb.style.translate).toBe('');
  });
});

describe('Given a choice that is not laid out yet', () => {
  it('when one is selected, then the thumb stays out', () => {
    const { group: choice, thumb } = group([
      { left: 0, top: 0, width: 0 },
      { left: 0, top: 0, width: 0 },
    ]);

    expect(restThumbOn(choice, thumb, 0)).toBe(false);
  });
});

function classStatesDuring(element: HTMLElement, change: () => void): string[] {
  const observer = new MutationObserver(() => undefined);
  observer.observe(element, { attributeFilter: ['class'], attributeOldValue: true });
  change();
  const states = observer.takeRecords().map((record) => record.oldValue ?? '');
  observer.disconnect();
  return [...states, element.className];
}

function resizableGroup(initial: SegmentBox[]): {
  group: HTMLElement;
  thumb: HTMLElement;
  layOut: (boxes: SegmentBox[]) => void;
} {
  let boxes = initial;
  const element = document.createElement('div');
  initial.forEach((_, index) => {
    const segment = document.createElement('button');
    Object.defineProperties(segment, {
      offsetLeft: { get: () => boxes[index].left },
      offsetTop: { get: () => boxes[index].top },
      offsetWidth: { get: () => boxes[index].width },
    });
    element.append(segment);
  });
  const thumb = document.createElement('span');
  thumb.className = 'segment-thumb';
  element.append(thumb);
  return {
    group: element,
    thumb,
    layOut: (next) => {
      boxes = next;
    },
  };
}

describe('Given a thumb gliding to the newly selected segment', () => {
  const narrow = [
    { left: 2, top: 2, width: 160 },
    { left: 162, top: 2, width: 160 },
  ];

  it('when the choice widens and the thumb keeps its share of it, then the thumb keeps gliding', () => {
    const { group: choice, thumb, layOut } = resizableGroup(narrow);
    placeThumb(choice, 0, true);
    placeThumb(choice, 1, true);
    layOut([
      { left: 2, top: 2, width: 220 },
      { left: 222, top: 2, width: 220 },
    ]);

    const states = classStatesDuring(choice, () => placeThumb(choice, 1, false));

    expect(states.every((state) => state.includes('segmented--thumb-glides'))).toBe(true);
    expect(thumb.style.translate).toBe('100% 0');
    expect(thumb.style.width).toBe('220px');
  });

  it('when the segments wrap onto two rows, then the thumb stops gliding and steps out', () => {
    const { group: choice, layOut } = resizableGroup(narrow);
    placeThumb(choice, 0, true);
    placeThumb(choice, 1, true);
    layOut([
      { left: 2, top: 2, width: 320 },
      { left: 2, top: 40, width: 320 },
    ]);

    placeThumb(choice, 1, false);

    expect(choice.classList.contains('segmented--thumb-glides')).toBe(false);
    expect(choice.classList.contains('segmented--thumb')).toBe(false);
  });
});
