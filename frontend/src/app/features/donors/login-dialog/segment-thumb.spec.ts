import { restThumbOn } from './segment-thumb';

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
