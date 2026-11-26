import { leaveWithClass } from './leave-with-class';

describe('Given a row that leaves through its leaving class', () => {
  let row: HTMLLIElement;
  let completions: number;
  let left: HTMLElement[];

  interface FakeMotion {
    readonly finished: Promise<Animation>;
    playState: AnimationPlayState;
    readonly effect: { getComputedTiming: () => { endTime: number } };
    finish: () => void;
  }

  beforeEach(() => {
    row = document.createElement('li');
    document.body.append(row);
    completions = 0;
    left = [];
  });

  afterEach(() => {
    row.remove();
    vi.useRealTimers();
  });

  function motion(endTime: number): FakeMotion {
    let resolve: (value: Animation) => void = () => undefined;
    const finished = new Promise<Animation>((done) => (resolve = done));
    const fake: FakeMotion = {
      finished,
      playState: 'running',
      effect: { getComputedTiming: () => ({ endTime }) },
      finish: () => {
        fake.playState = 'finished';
        resolve({} as Animation);
      },
    };
    return fake;
  }

  function cancelled(): FakeMotion {
    const fake = motion(150);
    Object.assign(fake, { finished: Promise.reject(new DOMException('cancelled', 'AbortError')) });
    fake.finished.catch(() => undefined);
    return fake;
  }

  function leave(motions: FakeMotion[], leaves?: (target: HTMLElement) => boolean): void {
    Object.defineProperty(row, 'getAnimations', {
      value: () => motions.filter((one) => one.playState !== 'idle'),
    });
    leaveWithClass('row--leaving', { leaves, left: (target) => left.push(target) })({
      target: row,
      animationComplete: () => (completions += 1),
    });
  }

  async function settle(): Promise<void> {
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }
  }

  it('when it does not really leave, then its leave is complete at once, without the class and without inert', () => {
    leave([motion(150)], () => false);

    expect(completions).toBe(1);
    expect(row.classList.contains('row--leaving')).toBe(false);
    expect(row.hasAttribute('inert')).toBe(false);
    expect(left).toEqual([]);
  });

  it('when it has no motion, then it is inert, carries the class and its leave is complete at once', () => {
    leave([]);

    expect(row.hasAttribute('inert')).toBe(true);
    expect(row.classList.contains('row--leaving')).toBe(true);
    expect(completions).toBe(1);
    expect(left).toEqual([row]);
  });

  it('when it was made inert before it leaves, then its inert is not written again', async () => {
    row.setAttribute('inert', '');
    const writes: string[] = [];
    const watch = new MutationObserver((records) =>
      writes.push(...records.map((record) => record.attributeName ?? '')),
    );
    watch.observe(row, { attributes: true, attributeFilter: ['inert'] });

    leave([]);
    await settle();
    watch.disconnect();

    expect(writes).toEqual([]);
    expect(row.hasAttribute('inert')).toBe(true);
  });

  it('when it has several motions, then its leave is complete only once all of them finished, and it keeps the class', async () => {
    const short = motion(150);
    const long = motion(200);
    leave([short, long]);

    short.finish();
    row.dispatchEvent(new Event('animationend'));
    await settle();
    expect(completions).toBe(0);
    expect(row.hasAttribute('inert')).toBe(true);

    long.finish();
    await settle();
    expect(completions).toBe(1);
    expect(left).toEqual([row]);
    expect(row.classList.contains('row--leaving')).toBe(true);
  });

  it('when the end of its last motion arrives as an animationend, then its leave is complete once', async () => {
    const only = motion(150);
    leave([only]);
    only.playState = 'finished';

    row.dispatchEvent(new Event('animationend'));
    expect(completions).toBe(1);
    only.finish();
    await settle();

    expect(completions).toBe(1);
  });

  it('when an animationend of something inside it arrives, then its leave goes on', () => {
    const inside = document.createElement('span');
    row.append(inside);
    leave([motion(150)]);

    inside.dispatchEvent(new Event('animationend', { bubbles: true }));

    expect(completions).toBe(0);
  });

  it('when its motion is cancelled, then its leave is complete all the same', async () => {
    const motions = [cancelled()];
    leave(motions);
    motions[0].playState = 'idle';

    row.dispatchEvent(new Event('animationcancel'));
    await settle();

    expect(completions).toBe(1);
  });

  it('when no end of its motion ever arrives, then its leave is complete 300 ms after the longest one would have ended', () => {
    vi.useFakeTimers();
    leave([motion(150), motion(200)]);

    vi.advanceTimersByTime(499);
    expect(completions).toBe(0);
    vi.advanceTimersByTime(1);

    expect(completions).toBe(1);
    expect(left).toEqual([row]);
  });
});

describe('Given a list whose row leaves while the rows below it settle into its place', () => {
  let list: HTMLUListElement;
  let completions: (() => void)[];

  beforeEach(() => {
    vi.useFakeTimers();
    list = document.createElement('ul');
    list.innerHTML = `
      <li id="first"></li>
      <li id="second"></li>
      <li id="third"></li>
      <li id="fourth"></li>
    `;
    document.body.append(list);
    completions = [];
  });

  afterEach(() => {
    list.remove();
    vi.useRealTimers();
  });

  function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
  }

  function settling(): string[] {
    return Array.from(list.querySelectorAll('.row--settling')).map((row) => row.id);
  }

  function leave(id: string): void {
    const row = byId(id);
    let finish: (value: Animation) => void = () => undefined;
    const finished = new Promise<Animation>((done) => (finish = done));
    Object.defineProperty(row, 'getAnimations', {
      value: () => [
        { finished, playState: 'running', effect: { getComputedTiming: () => ({ endTime: 150 }) } },
      ],
    });
    leaveWithClass('row--leaving', { settling: 'row--settling' })({
      target: row,
      animationComplete: () => row.remove(),
    });
    completions.push(() => finish({} as Animation));
  }

  async function finishLeave(index: number): Promise<void> {
    completions[index]();
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }
  }

  it('when a row in the middle starts to leave, then only the rows below it settle, and they stay out of the reach of presses only, never inert', () => {
    leave('second');

    expect(settling()).toEqual(['third', 'fourth']);
    expect(byId('third').hasAttribute('inert')).toBe(false);
    expect(byId('fourth').hasAttribute('inert')).toBe(false);
  });

  it('when its leave is complete, then the rows below keep settling for a double tap of 300 ms, and then take presses again', async () => {
    leave('second');
    await finishLeave(0);

    vi.advanceTimersByTime(299);
    expect(settling()).toEqual(['third', 'fourth']);
    vi.advanceTimersByTime(1);

    expect(settling()).toEqual([]);
  });

  it('when no end of its motion ever arrives, then the rows below settle until 300 ms after its leave is complete', () => {
    leave('second');

    vi.advanceTimersByTime(450 + 299);
    expect(settling()).toEqual(['third', 'fourth']);
    vi.advanceTimersByTime(1);

    expect(settling()).toEqual([]);
  });

  it('when a second row leaves while the rows below still settle, then they settle until 300 ms after the later leave is complete', async () => {
    leave('first');
    await finishLeave(0);
    vi.advanceTimersByTime(200);
    leave('second');
    vi.advanceTimersByTime(100);
    expect(settling()).toEqual(['third', 'fourth']);

    await finishLeave(1);
    vi.advanceTimersByTime(299);
    expect(settling()).toEqual(['third', 'fourth']);
    vi.advanceTimersByTime(1);

    expect(settling()).toEqual([]);
  });

  it('when a row with no motion of its own leaves, then the rows below still settle for a double tap of 300 ms, and then take presses again', () => {
    const row = byId('second');
    Object.defineProperty(row, 'getAnimations', { value: () => [] });

    leaveWithClass('row--leaving', { settling: 'row--settling' })({
      target: row,
      animationComplete: () => row.remove(),
    });

    expect(byId('second')).toBeNull();
    vi.advanceTimersByTime(299);
    expect(settling()).toEqual(['third', 'fourth']);
    vi.advanceTimersByTime(1);

    expect(settling()).toEqual([]);
  });

  it('when a row leaves without settling the rows below, then none of them carries a class', () => {
    leaveWithClass('row--leaving')({ target: byId('second'), animationComplete: () => undefined });

    expect(list.querySelectorAll('[class]')).toHaveLength(1);
  });
});
