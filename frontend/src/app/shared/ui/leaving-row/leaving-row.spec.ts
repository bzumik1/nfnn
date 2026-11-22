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

  beforeEach(() => {
    row = document.createElement('li');
    document.body.append(row);
    completions = 0;
  });

  afterEach(() => row.remove());

  function leave(animations: Pick<Animation, 'finished'>[]): void {
    Object.defineProperty(row, 'getAnimations', { value: () => animations });
    leaveWithClass('row--leaving')({
      target: row,
      animationComplete: () => (completions += 1),
    });
  }

  it('when it has no motion, then it carries the class and its leave is complete at once', () => {
    leave([]);

    expect(row.classList.contains('row--leaving')).toBe(true);
    expect(completions).toBe(1);
  });

  it('when its motion finishes, then its leave is complete and it keeps the class until it is removed', async () => {
    let finish: () => void = () => undefined;
    const finished = new Promise<Animation>((resolve) => (finish = () => resolve({} as Animation)));
    leave([{ finished }]);

    await Promise.resolve();
    expect(completions).toBe(0);
    finish();
    await finished;
    await Promise.resolve();

    expect(completions).toBe(1);
    expect(row.classList.contains('row--leaving')).toBe(true);
  });

  it('when its motion is cancelled, then its leave is complete all the same', async () => {
    const finished = Promise.reject(new DOMException('cancelled', 'AbortError'));
    leave([{ finished }]);

    await finished.catch(() => undefined);
    await Promise.resolve();

    expect(completions).toBe(1);
  });
});
