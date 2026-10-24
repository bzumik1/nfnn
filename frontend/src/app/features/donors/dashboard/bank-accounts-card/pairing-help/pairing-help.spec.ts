import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PairingHelp } from './pairing-help';

const HELP_ITEMS = [
  'Jak se k vám dostane můj dar? Platbu s vaším variabilním symbolem 9876543210 přiřadíme vám, ať přijde z jakéhokoli účtu.',
  'Co když pošlu platbu bez symbolu? Přiřadíme ji podle účtu, ze kterého přišla, pokud jste ho ověřili platbou s vaším symbolem (stačí 1 Kč přes „Přidat účet“). ' +
    'Když účet ověříte jako první dárce, přiřadíme vám i dřívější platby z něj bez symbolu.',
  'Posílám trvalým příkazem se starým symbolem Nejjistější je změnit v příkazu symbol na váš 9876543210. ' +
    'Jinak pošlete z účtu 1 Kč se zprávou z QR kódu v „Přidat účet“ (běžný dar nestačí) a my se vás u účtu obvykle zeptáme, jestli jsou platby se starým symbolem vaše.',
  'Co se stane po odpovědi na otázku? Po „Ano, jsou moje“ vám platby s tímto symbolem z účtu přiřazujeme stejně jako platby bez symbolu, dřívější i další; ' +
    'po „Ne, nejsou moje“ se už neptáme. Odpověď nejde změnit; kdybyste se spletli, napište nám.',
  'Co znamená Sdílený účet? Stejný účet ověřil i jiný dárce, proto z něj platby bez symbolu ani se starším potvrzeným symbolem nepřiřazujeme nikomu. ' +
    'Posílejte z něj prosím vždy s vaším variabilním symbolem.',
  'Jak přestat přiřazovat platby z účtu? Stiskněte u účtu „Nepřiřazovat platby z tohoto účtu“; ' +
    'od dalšího dne vám z něj platby bez symbolu ani se starším potvrzeným symbolem nepřiřadíme a dřívější dary zůstanou. ' +
    'Tlačítkem „Znovu přiřazovat platby z účtu“ a platbou 1 Kč s vaším symbolem to vrátíte.',
  'Výjimky Platbu se symbolem jiného dárce přiřadíme jemu a symbol 0 bereme jako platbu bez symbolu. ' +
    'Z účtu, přes který posílá peníze víc lidí (třeba sběrný účet), přiřazujeme jen platby s variabilním symbolem.',
];

describe('Given the help on how payments are paired', () => {
  let fixture: ComponentFixture<PairingHelp>;
  let closeRequests: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PairingHelp] }).compileComponents();
    fixture = TestBed.createComponent(PairingHelp);
    fixture.componentRef.setInput('variableSymbol', '9876543210');
    closeRequests = 0;
    fixture.componentInstance.closeRequested.subscribe(() => closeRequests++);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  function element<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selector) as T | null;
  }

  function text(selector: string): string {
    return normalized(element(selector)?.textContent ?? '');
  }

  function texts(selector: string): string[] {
    return [
      ...((fixture.nativeElement as HTMLElement).querySelectorAll(
        selector,
      ) as NodeListOf<HTMLElement>),
    ].map((node) => normalized(node.textContent ?? ''));
  }

  function normalized(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  function panel(): HTMLElement {
    return element('#accounts-help-panel') as HTMLElement;
  }

  async function open(): Promise<void> {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('when it is not open, then the panel is in the page but hidden', () => {
    expect(panel().hidden).toBe(true);
    expect((fixture.nativeElement as HTMLElement).hidden).toBe(false);
  });

  it("when it is open, then the labelled region answers every question in short, the older symbol included, with the donor's symbol", async () => {
    await open();

    expect(panel().hidden).toBe(false);
    expect(panel().getAttribute('role')).toBe('region');
    expect(panel().getAttribute('aria-labelledby')).toBe('accounts-help-title');
    expect(element('#accounts-help-title')?.tagName).toBe('H3');
    expect(text('#accounts-help-title')).toBe('Jak přiřazujeme platby');
    expect(texts('#accounts-help-panel .help-list > li')).toEqual(HELP_ITEMS);
    expect(texts('#accounts-help-panel .help-symbol')).toEqual(['9876543210', '9876543210']);
    expect(text('#accounts-help-panel .help-contact')).toBe(
      'Chybí vám nějaký dar, nebo tu vidíte dar, který není váš? Napište nám na info@nfnn.cz.',
    );
    expect(
      element<HTMLAnchorElement>('#accounts-help-panel .help-contact a')?.getAttribute('href'),
    ).toBe('mailto:info@nfnn.cz');
  });

  it('when the donor has no variable symbol yet, then it speaks of their variable symbol without a number', async () => {
    fixture.componentRef.setInput('variableSymbol', null);
    await open();

    expect(texts('#accounts-help-panel .help-list > li')).toEqual(
      HELP_ITEMS.map((item, index) =>
        index === 0
          ? 'Jak se k vám dostane můj dar? Platbu s vaším variabilním symbolem přiřadíme vám, ať přijde z jakéhokoli účtu.'
          : index === 2
            ? 'Posílám trvalým příkazem se starým symbolem Nejjistější je změnit v příkazu symbol na váš. ' +
              'Jinak pošlete z účtu 1 Kč se zprávou z QR kódu v „Přidat účet“ (běžný dar nestačí) a my se vás u účtu obvykle zeptáme, jestli jsou platby se starým symbolem vaše.'
            : item,
      ),
    );
    expect(element('#accounts-help-panel .help-symbol')).toBeNull();
  });

  it('when Escape is pressed inside the open panel, then it asks to be closed', async () => {
    await open();
    const link = element<HTMLAnchorElement>('#accounts-help-panel a') as HTMLAnchorElement;
    link.focus();

    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closeRequests).toBe(1);
  });

  it('when another key is pressed inside the open panel, then it does not ask to be closed', async () => {
    await open();
    const link = element<HTMLAnchorElement>('#accounts-help-panel a') as HTMLAnchorElement;

    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(closeRequests).toBe(0);
  });
});
