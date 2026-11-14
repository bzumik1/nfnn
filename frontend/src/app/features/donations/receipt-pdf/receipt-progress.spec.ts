import {
  cancelledReceiptProgress,
  readyReceiptProgress,
  receiptPhaseProgress,
  savedReceiptProgress,
  sharedReceiptProgress,
} from './receipt-progress';

describe('Given the progress of a receipt PDF', () => {
  it('when its data are read, then the line names that phase', () => {
    expect(receiptPhaseProgress({ kind: 'phase', phase: 'data', page: 0, pages: 0 })).toEqual({
      kind: 'running',
      text: 'Připravujeme údaje potvrzení…',
    });
  });

  it('when the tools load, then the line names that phase without a share of an estimate', () => {
    expect(receiptPhaseProgress({ kind: 'phase', phase: 'tools', page: 0, pages: 2 })).toEqual({
      kind: 'running',
      text: 'Načítáme nástroje pro PDF…',
    });
  });

  it('when the worker draws a page, then the line names the page it reported', () => {
    expect(receiptPhaseProgress({ kind: 'phase', phase: 'drawing', page: 3, pages: 2 })).toEqual({
      kind: 'running',
      text: 'Vytváříme PDF… · strana 3',
    });
  });

  it('when the PDF waits for a second tap, then the brief says it is ready and the sentence how to open it', () => {
    expect(readyReceiptProgress('Potvrzení x.pdf je připravené.')).toEqual({
      kind: 'ready',
      text: 'Potvrzení x.pdf je připravené.',
      brief: 'PDF je připravené',
    });
  });

  it('when the PDF is saved, then the brief says so and the sentence where to find it', () => {
    expect(savedReceiptProgress('x.pdf')).toEqual({
      kind: 'done',
      text: 'Potvrzení x.pdf je stažené. Najdete ho ve stažených souborech.',
      brief: 'PDF je stažené',
    });
  });

  it('when the PDF is shared, then the brief says it was handed on', () => {
    expect(sharedReceiptProgress('x.pdf')).toEqual({
      kind: 'done',
      text: 'Potvrzení x.pdf jste předali z nabídky sdílení.',
      brief: 'PDF jste předali',
    });
  });

  it('when the preparation is cancelled, then the brief says so', () => {
    expect(cancelledReceiptProgress('Přípravu PDF jste zrušili.')).toEqual({
      kind: 'cancelled',
      text: 'Přípravu PDF jste zrušili.',
      brief: 'Příprava je zrušená',
    });
  });
});
