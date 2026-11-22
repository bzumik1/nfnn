import { leaveWithClass, markRowsLeaving, neighbourAfterRowLeaves } from './leaving-row';

describe('Given a list whose row is about to leave', () => {
  let list: HTMLUListElement;

  beforeEach(() => {
    list = document.createElement('ul');
    list.innerHTML = `
      <li id="first"><button id="first-action">Odhlásit</button></li>
      <li id="second"><button id="second-action">Odhlásit</button><button>Zrušit</button></li>
      <li id="third"><button id="third-action">Odhlásit</button></li>
    `;
    document.body.append(list);
  });

  afterEach(() => list.remove());

  function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
  }

  function actions(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>('li > button:first-child'));
  }

  it('when a row in the middle leaves, then its neighbour below takes the focus', () => {
    const neighbour = neighbourAfterRowLeaves(byId('second'), actions());
    byId('second').remove();

    expect(neighbour()).toBe(byId('third-action'));
  });

  it('when the last row leaves, then its neighbour above takes the focus', () => {
    const neighbour = neighbourAfterRowLeaves(byId('third'), actions());
    byId('third').remove();

    expect(neighbour()).toBe(byId('second-action'));
  });

  it('when the neighbour below left with it, then the nearest row above takes the focus', () => {
    const neighbour = neighbourAfterRowLeaves(byId('second'), actions());
    byId('second').remove();
    byId('third').remove();

    expect(neighbour()).toBe(byId('first-action'));
  });

  it('when the neighbour is still disabled or inert, then it is passed over', () => {
    const neighbour = neighbourAfterRowLeaves(byId('first'), actions());
    byId('first').remove();
    (byId('second-action') as HTMLButtonElement).disabled = true;
    byId('third').setAttribute('inert', '');

    expect(neighbour()).toBeNull();
  });

  it('when the controls of the leaving row are passed too, then none of them is chosen', () => {
    const neighbour = neighbourAfterRowLeaves(
      byId('second'),
      Array.from(list.querySelectorAll<HTMLElement>('button')),
    );

    expect(neighbour()).toBe(byId('third-action'));
  });

  it('when the only row leaves, then nothing is left to take the focus and the page names its heading', () => {
    const neighbour = neighbourAfterRowLeaves(byId('first'), [byId('first-action')]);
    byId('first').remove();

    expect(neighbour()).toBeNull();
  });

  it('when the leaving row is not found, then the first control of the list takes the focus', () => {
    const neighbour = neighbourAfterRowLeaves(null, actions());

    expect(neighbour()).toBe(byId('first-action'));
  });

  it('when rows are marked as leaving, then each is inert at once, so neither Tab nor a screen reader reaches its controls', () => {
    markRowsLeaving([byId('first'), null, byId('third')]);

    expect(byId('first').hasAttribute('inert')).toBe(true);
    expect(byId('first-action').closest('[inert]')).toBe(byId('first'));
    expect(byId('second').hasAttribute('inert')).toBe(false);
    expect(byId('third').hasAttribute('inert')).toBe(true);
  });

  it('when a row is marked as leaving before its neighbour is chosen, then its own controls are still passed over', () => {
    markRowsLeaving([byId('second')]);
    const neighbour = neighbourAfterRowLeaves(byId('second'), actions());

    expect(neighbour()).toBe(byId('third-action'));
  });
});

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
