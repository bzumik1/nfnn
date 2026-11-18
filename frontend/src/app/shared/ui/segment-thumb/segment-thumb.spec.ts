import { placeThumb, restThumbOn } from './segment-thumb';

interface SegmentBox {
  left: number;
  top: number;
  width: number;
}

function laidOut(segment: HTMLElement, box: () => SegmentBox): void {
  Object.defineProperties(segment, {
    offsetLeft: { get: () => Math.round(box().left) },
    offsetTop: { get: () => Math.round(box().top) },
    offsetWidth: { get: () => Math.round(box().width) },
  });
  segment.getBoundingClientRect = () => {
    const { left, top, width } = box();
    return new DOMRect(left, top, width, 36);
  };
}

function group(boxes: SegmentBox[]): { group: HTMLElement; thumb: HTMLElement } {
  const element = document.createElement('div');
  for (const box of boxes) {
    const segment = document.createElement('button');
    laidOut(segment, () => box);
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

describe('Given a choice whose segments are laid out on fractions of a pixel', () => {
  const fractional = [
    { left: 2.4, top: 2.2, width: 160.6 },
    { left: 163, top: 2.2, width: 160.6 },
  ];

  it('when the second is selected, then the thumb takes the exact width and moves by exactly one segment', () => {
    const { group: choice, thumb } = group(fractional);

    expect(restThumbOn(choice, thumb, 1)).toBe(true);
    expect(thumb.style.width).toBe('160.6px');
    expect(thumb.style.translate).toBe('100% 0');
  });
});

describe('Given a gliding thumb whose choice widens to fractions of a pixel', () => {
  it('when the segments keep their share of the choice, then the thumb keeps gliding', () => {
    const {
      group: choice,
      thumb,
      layOut,
    } = resizableGroup([
      { left: 2, top: 2, width: 160 },
      { left: 162, top: 2, width: 160 },
    ]);
    placeThumb(choice, 0, true);
    placeThumb(choice, 1, true);
    layOut([
      { left: 2, top: 2, width: 180.4 },
      { left: 182.4, top: 2, width: 180.4 },
    ]);

    const states = classStatesDuring(choice, () => placeThumb(choice, 1, false));

    expect(states.every((state) => state.includes('ui-segmented--thumb-glides'))).toBe(true);
    expect(thumb.style.translate).toBe('100% 0');
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
    laidOut(segment, () => boxes[index]);
    element.append(segment);
  });
  const thumb = document.createElement('span');
  thumb.className = 'ui-segmented__thumb';
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

    expect(states.every((state) => state.includes('ui-segmented--thumb-glides'))).toBe(true);
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

    expect(choice.classList.contains('ui-segmented--thumb-glides')).toBe(false);
    expect(choice.classList.contains('ui-segmented--thumb')).toBe(false);
  });
});
