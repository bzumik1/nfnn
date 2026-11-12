import { stillCopyOf } from './still-copy';

function page(): HTMLElement {
  const shell = document.createElement('app-public-shell');
  shell.innerHTML = `
    <main id="obsah"><h1 id="titulek">Článek</h1>
      <input id="castka" name="castka" autofocus>
      <input type="radio" name="frekvence" value="mesicne" checked>
      <svg><defs><linearGradient id="prechod"></linearGradient></defs></svg>
      <iframe title="Mapa"></iframe>
    </main>
    <app-tab-bar><nav>Záložky</nav></app-tab-bar>`;
  document.body.append(shell);
  return shell;
}

describe('Given the page a visitor leaves', () => {
  let shell: HTMLElement;

  beforeEach(() => {
    shell = page();
  });

  afterEach(() => shell.remove());

  it('when it is copied, then the copy looks the same but holds no id, name or autofocus a live page needs', () => {
    (shell.querySelector('#castka') as HTMLInputElement).value = '500';

    const copy = stillCopyOf(shell);

    expect(copy.querySelector('h1')?.textContent).toBe('Článek');
    expect(copy.querySelectorAll('main [id]:not(svg *), [name], [autofocus]')).toHaveLength(0);
    expect((copy.querySelector('input') as HTMLInputElement).value).toBe('500');
    expect((copy.querySelector('input[type=radio]') as HTMLInputElement).checked).toBe(true);
    expect((shell.querySelector('input[type=radio]') as HTMLInputElement).checked).toBe(true);
  });

  it('when it is copied, then the ids inside a drawing stay, so its gradients still draw', () => {
    expect(stillCopyOf(shell).querySelector('#prechod')).not.toBeNull();
  });

  it('when it is copied, then nothing in the copy loads a frame again', () => {
    expect(stillCopyOf(shell).querySelector('iframe')).toBeNull();
  });

  it('when a sheet is open over the page, then the copy holds the page without the sheet', () => {
    const sheet = document.createElement('dialog');
    sheet.setAttribute('open', '');
    sheet.textContent = 'Účet';
    shell.append(sheet);

    const copy = stillCopyOf(shell);

    expect(copy.querySelector('dialog')).toBeNull();
    expect(copy.querySelector('h1')?.textContent).toBe('Článek');
    expect(copy.querySelector('app-tab-bar')).not.toBeNull();
  });

  it('when it is copied, then the page itself is left as it was', () => {
    stillCopyOf(shell);

    expect(shell.querySelector('#obsah')).not.toBeNull();
    expect(shell.querySelector('app-tab-bar')).not.toBeNull();
  });
});
