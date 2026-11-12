import { logWindow } from '../../testing/admin-fixtures';
import { mergeWindow, startTimeline } from './log-timeline';

describe('Given the lines of a log file loaded window by window', () => {
  const tail = startTimeline(
    logWindow({ from: 4, to: 8, hasOlder: true, hasNewer: false, text: 'c\nd\n' }),
  );

  it('when the tail is loaded, then the timeline holds its lines and knows older ones exist', () => {
    expect(tail).toEqual({
      lines: [
        { offset: 4, text: 'c' },
        { offset: 6, text: 'd' },
      ],
      from: 4,
      to: 8,
      hasOlder: true,
      hasNewer: false,
    });
  });

  it('when an older window that overlaps by a line is merged, then every line is kept once in file order', () => {
    const merged = mergeWindow(
      tail,
      logWindow({ from: 0, to: 6, hasOlder: false, hasNewer: true, text: 'a\nb\nc\n' }),
    );

    expect(merged.lines.map((line) => line.text)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged).toMatchObject({ from: 0, to: 8, hasOlder: false, hasNewer: false });
  });

  it('when a newer window is merged, then the end moves and says whether still newer lines follow', () => {
    const merged = mergeWindow(
      tail,
      logWindow({ from: 8, to: 12, hasOlder: true, hasNewer: false, text: 'e\nf\n' }),
    );

    expect(merged.lines.map((line) => line.text)).toEqual(['c', 'd', 'e', 'f']);
    expect(merged).toMatchObject({ from: 4, to: 12, hasOlder: true, hasNewer: false });
  });

  it('when a newer window brings nothing, then the timeline stays as it was', () => {
    const merged = mergeWindow(
      tail,
      logWindow({ from: 8, to: 8, hasOlder: true, hasNewer: false, text: '' }),
    );

    expect(merged).toEqual(tail);
  });
});
