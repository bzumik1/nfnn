import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PairingHelp } from './pairing-help';

const HELP_ITEMS = [
  'S vaším symbolem Platbu s vaším variabilním symbolem 9876543210 přiřadíme vám, ať přijde z jakéhokoli účtu.',
  'Bez symbolu Platbu bez variabilního symbolu přiřadíme podle účtu, ze kterého přišla, pokud jste ho u nás ověřili. ' +
    'Tomuto přiřazování podle účtu říkáme párování. ' +
    'Účet ověříte tak, že z něj jednou pošlete platbu s vaším variabilním symbolem; stačí 1 Kč, návod najdete pod tlačítkem „Přidat účet“. ' +
    'Musí to být český účet, ale nemusí být veden na vaše jméno. ' +
    'Když účet ověříte poprvé a předtím ho neověřil jiný dárce, přiřadíme vám i dřívější platby z něj, které přišly bez symbolu. ' +
    'Účet, přes který posílá peníze víc lidí (třeba sběrný účet), můžeme z párování vyloučit; z takového účtu pak přiřazujeme jen platby s variabilním symbolem.',
  'S jiným symbolem Platbu se symbolem jiného dárce přiřadíme jemu, i když přijde z vašeho ověřeného účtu. ' +
    'Platbu se starším symbolem, který nemá žádný registrovaný dárce, vám přiřadíme, jen když ho u účtu potvrdíte jako svůj (viz Starší symbol). ' +
    'Pokud nám posíláte dary trvalým příkazem se starším symbolem, nejjistější je nastavit v něm váš variabilní symbol 9876543210. ' +
    'Platbu se symbolem 0 bereme jako platbu bez symbolu.',
  'Starší symbol Když nám z účtu pošlete 1 Kč s vaším variabilním symbolem a se zprávou „Ověření účtu“ (QR kód pod tlačítkem „Přidat účet“; běžný dar nestačí) ' +
    'a z tohoto účtu k nám do té doby kromě plateb s vaším symbolem nebo bez symbolu chodily platby s jediným dalším symbolem, ' +
    'který nemá žádný registrovaný dárce, zeptáme se vás u účtu, jestli jsou to vaše dary. ' +
    'Neptáme se u sdíleného účtu, u účtu, ze kterého přiřazujeme jen platby s variabilním symbolem, ' +
    'ani když podle jména v bance patří účet firmě a vy jste u nás jako osoba (nebo naopak). ' +
    'Po odpovědi „Ano, jsou moje“ vám platby s tímto symbolem z tohoto účtu přiřazujeme stejně jako platby bez symbolu, dřívější i další; ' +
    'po odpovědi „Ne, nejsou moje“ se už neptáme. ' +
    'Odpověď nejde změnit; kdybyste se spletli, napište nám.',
  'Vypnutí párování Párování můžete u účtu vypnout tlačítkem „Vypnout párování“. ' +
    'Platby bez symbolu ani platby se starším symbolem, který jste u účtu potvrdili, které z účtu přijdou ode dne po vypnutí, ' +
    'vám pak nepřiřadíme; dary přiřazené dříve zůstanou. ' +
    'Párování znovu zapnete tlačítkem „Zapnout párování“. ' +
    'Účet pak čeká na platbu: pošlete z něj 1 Kč (nebo jakýkoli dar) s vaším variabilním symbolem. ' +
    'Jakmile dorazí, přiřadíme vám z něj zase platby bez symbolu i se starším potvrzeným symbolem ode dne zapnutí. ' +
    'U účtu, ze kterého přiřazujeme jen platby s variabilním symbolem, párování znovu zapnout nejde.',
  'Sdílený účet Když stejný účet ověří i jiný dárce, označíme ho jako „Sdílený“ ' +
    'a platby bez variabilního symbolu ani se starším potvrzeným symbolem z něj nepřiřadíme nikomu. ' +
    'Pokud z něj dary neposíláte vy, vypněte si u něj párování. ' +
    'Jinak z něj prosím posílejte vždy s vaším variabilním symbolem.',
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
    return [...((fixture.nativeElement as HTMLElement).querySelectorAll(selector) as NodeListOf<HTMLElement>)].map((node) =>
      normalized(node.textContent ?? ''),
    );
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

  it('when it is open, then the labelled region explains every rule, the older symbol included, with the donor\'s symbol', async () => {
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
    expect(element<HTMLAnchorElement>('#accounts-help-panel .help-contact a')?.getAttribute('href')).toBe('mailto:info@nfnn.cz');
  });

  it('when the donor has no variable symbol yet, then it speaks of their variable symbol without a number', async () => {
    fixture.componentRef.setInput('variableSymbol', null);
    await open();

    expect(texts('#accounts-help-panel .help-list > li')).toEqual(
      HELP_ITEMS.map((item, index) =>
        index === 0
          ? 'S vaším symbolem Platbu s vaším variabilním symbolem přiřadíme vám, ať přijde z jakéhokoli účtu.'
          : index === 2
            ? 'S jiným symbolem Platbu se symbolem jiného dárce přiřadíme jemu, i když přijde z vašeho ověřeného účtu. ' +
              'Platbu se starším symbolem, který nemá žádný registrovaný dárce, vám přiřadíme, jen když ho u účtu potvrdíte jako svůj (viz Starší symbol). ' +
              'Pokud nám posíláte dary trvalým příkazem se starším symbolem, nejjistější je nastavit v něm váš variabilní symbol. ' +
              'Platbu se symbolem 0 bereme jako platbu bez symbolu.'
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
