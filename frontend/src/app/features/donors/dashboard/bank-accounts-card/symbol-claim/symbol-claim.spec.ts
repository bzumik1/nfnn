import { ComponentFixture, TestBed } from '@angular/core/testing';
import { symbolOffer } from '../../../../donations/testing/bank-account-fixtures';
import { SymbolClaim, SymbolClaimAnswer } from './symbol-claim';

describe('Given a question about payments with an older variable symbol from a verified account', () => {
  let fixture: ComponentFixture<SymbolClaim>;
  let answers: SymbolClaimAnswer[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SymbolClaim] }).compileComponents();
    fixture = TestBed.createComponent(SymbolClaim);
    fixture.componentRef.setInput('accountId', '0192f0c4-0000-7000-8000-000000000001');
    fixture.componentRef.setInput('offer', symbolOffer());
    fixture.componentRef.setInput('donorName', 'Jana Nováková');
    answers = [];
    fixture.componentInstance.answer.subscribe((answer) => answers.push(answer));
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
  }

  function text(selector: string): string {
    return normalized(element(selector)?.textContent ?? '');
  }

  function normalized(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  function show(overrides: Parameters<typeof symbolOffer>[0]): void {
    fixture.componentRef.setInput('offer', symbolOffer(overrides));
    fixture.detectChanges();
  }

  function setBusy(busy: boolean): void {
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
  }

  it('when it is shown, then it names the symbol, the number of payments, their months and the donor, and no amount', () => {
    expect(text('.claim-question')).toBe(
      'Z tohoto účtu k nám chodí i platby s variabilním symbolem 6123456789 (14 plateb, leden 2025 – říjen 2026). ' +
        'Jsou to dary od vás (Jana Nováková)?',
    );
    expect(text('.claim-symbol')).toBe('6123456789');
    expect(text('.claim-note')).toBe(
      'Když odpovíte „Ano, jsou moje“, přiřadíme vám tyto platby i další s tímto symbolem z tohoto účtu. ' +
        'Odpověď už nepůjde změnit; kdybyste se spletli, napište nám na info@nfnn.cz.',
    );
    expect(element<HTMLAnchorElement>('.claim-note a').getAttribute('href')).toBe('mailto:info@nfnn.cz');
    expect(text('.claim-yes')).toBe('Ano, jsou moje');
    expect(text('.claim-no')).toBe('Ne, nejsou moje');
    expect(text('.claim')).not.toContain('Kč');
  });

  it('when the number of payments changes, then the word for payments follows the Czech plural', () => {
    const counts = [1, 3, 14, 22].map((paymentCount) => {
      show({ paymentCount });
      return /\((.*),/.exec(text('.claim-question'))?.[1];
    });

    expect(counts).toEqual(['1 platba', '3 platby', '14 plateb', '22 plateb']);
    expect(element('.claim-question').textContent).toContain('22\u00a0plateb');
  });

  it('when all the payments came in one month, then only that month shows', () => {
    show({ paymentCount: 2, firstMonth: '2026-10', lastMonth: '2026-10' });

    expect(text('.claim-question')).toContain('(2 platby, říjen 2026)');
  });

  it('when the donor has no name, then it asks whether they are the donor\'s gifts without naming anyone', () => {
    fixture.componentRef.setInput('donorName', '');
    fixture.detectChanges();

    expect(text('.claim-question')).toBe(
      'Z tohoto účtu k nám chodí i platby s variabilním symbolem 6123456789 (14 plateb, leden 2025 – říjen 2026). Jsou to vaše dary?',
    );
  });

  it('when a screen reader reaches it, then the group is named by the question and Ano is described by the note', () => {
    const group = element('.claim');
    expect(group.getAttribute('role')).toBe('group');
    const question = element('.claim-question');
    expect(question.id).toBe('symbol-claim-0192f0c4-0000-7000-8000-000000000001-question');
    expect(group.getAttribute('aria-labelledby')).toBe(question.id);
    expect(element('.claim-yes').getAttribute('aria-describedby')).toBe(element('.claim-note').id);
    expect(element('.claim-note').id).toBe('symbol-claim-0192f0c4-0000-7000-8000-000000000001-note');
    expect(element('.claim-no').hasAttribute('aria-describedby')).toBe(false);
  });

  it('when the account id holds characters an id cannot, then they are replaced', () => {
    fixture.componentRef.setInput('accountId', 'a/b c');
    fixture.detectChanges();

    expect(element('.claim-question').id).toBe('symbol-claim-a_b_c-question');
    expect(element('.claim-note').id).toBe('symbol-claim-a_b_c-note');
  });

  it('when Ano is pressed, then it answers confirm', () => {
    element<HTMLButtonElement>('.claim-yes').click();

    expect(answers).toEqual(['confirm']);
  });

  it('when Ne is pressed, then it answers decline', () => {
    element<HTMLButtonElement>('.claim-no').click();

    expect(answers).toEqual(['decline']);
  });

  it('when the answer is being saved, then both buttons are aria-disabled, the pressed one is busy and keeps the focus, and another press answers nothing', () => {
    const yes = element<HTMLButtonElement>('.claim-yes');
    yes.focus();
    yes.click();
    setBusy(true);

    expect(yes.getAttribute('aria-disabled')).toBe('true');
    expect(element('.claim-no').getAttribute('aria-disabled')).toBe('true');
    expect(yes.getAttribute('aria-busy')).toBe('true');
    expect(element('.claim-no').getAttribute('aria-busy')).toBe('false');
    expect(yes.disabled).toBe(false);
    expect(document.activeElement).toBe(yes);

    yes.click();
    element<HTMLButtonElement>('.claim-no').click();

    expect(answers).toEqual(['confirm']);
  });

  it('when the save ends, then the buttons can be pressed again', () => {
    element<HTMLButtonElement>('.claim-no').click();
    setBusy(true);
    expect(element('.claim-no').getAttribute('aria-busy')).toBe('true');
    setBusy(false);

    expect(element('.claim-no').getAttribute('aria-disabled')).toBe('false');
    expect(element('.claim-no').getAttribute('aria-busy')).toBe('false');
    element<HTMLButtonElement>('.claim-no').click();

    expect(answers).toEqual(['decline', 'decline']);
  });
});
