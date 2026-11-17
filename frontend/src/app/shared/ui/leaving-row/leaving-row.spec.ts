import { markRowsLeaving, neighbourAfterRowLeaves } from './leaving-row';

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
