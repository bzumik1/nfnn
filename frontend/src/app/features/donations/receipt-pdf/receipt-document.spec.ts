import { receiptDocument, ReceiptUnprintable } from './receipt-document';
import {
  COMPANY_REPLACEMENT,
  frozenCase,
  SINGLE_MANUAL,
  SINGLE_PERSON_CS,
  SINGLE_SIGNATURE,
  TEST_CAPTIONS,
  YEARLY_120,
  YEARLY_BILINGUAL,
} from './testing/receipt-fixtures';

const ISSUED_AT = '2027-01-15T09:30:00Z';

describe('Given the frozen single receipt of a person in Czech', () => {
  const document = receiptDocument(frozenCase(SINGLE_PERSON_CS), ISSUED_AT, TEST_CAPTIONS);

  it('when it is mapped, then the header names the title, number and issue day with two-digit day and month', () => {
    expect(document.title).toEqual({ cs: 'Potvrzení o přijetí daru', en: null });
    expect(document.numberLine.cs).toBe('Číslo potvrzení: 2027-000001');
    expect(document.issuedOnLine.cs).toBe('Datum vystavení: 15. 01. 2027');
    expect(document.bilingual).toBe(false);
    expect(document.replaces).toBeNull();
  });

  it('when it is mapped, then the donee and the donor read as the frozen texts fill them', () => {
    expect(document.donee.heading.cs).toBe('Obdarovaný');
    expect(document.donee.lines.map((line) => line.cs)).toEqual([
      'Název: Nová naděje - nadační fond',
      'IČO: 27278794',
      'Sídlo: Jiráskova 436, 473 01 Nový Bor',
      'zapsaný v nadačním rejstříku, spisová značka N 78, rejstříkový soud: Krajský soud v Ústí nad Labem',
    ]);
    expect(document.donor.heading.cs).toBe('Dárce');
    expect(document.donor.lines.map((line) => line.cs)).toEqual([
      'Jméno a příjmení: Jana Nováková',
      'Bydliště: Dlouhá 12, 400 01 Ústí nad Labem',
      'Variabilní symbol: 4821937560',
    ]);
  });

  it('when it is mapped, then the gift lines, the declaration and the signature block carry the gift', () => {
    expect(document.giftTable).toBeNull();
    expect(document.singleGift?.map((line) => line.cs)).toEqual([
      'Forma daru: peněžitý dar, bankovní převod',
      'Datum připsání na účet: 15. 03. 2026',
      'Částka: 500\u00a0Kč',
      'Účet příjemce: 5544332217/2010',
    ]);
    expect(document.declaration.cs).toContain(
      'přijal dne 15. 03. 2026 peněžitý dar ve výši 500\u00a0Kč',
    );
    expect(document.signature.issuedAt.cs).toBe('V Novém Boru, dne 15. 01. 2027');
    expect(document.signature.forFoundation.cs).toBe('Za Nová naděje - nadační fond:');
    expect(document.signature.name).toBe('Petr Vzorový');
    expect(document.signature.role).toBe('předseda správní rady');
    expect(document.signature.signatureImage).toBeNull();
    expect(document.signature.portraitImage).toBeNull();
  });

  it('when it is mapped, then the footer, the file name, the metadata and the proof come from the frozen receipt', () => {
    expect(document.footer).toBe(
      'Nová naděje - nadační fond · IČO 27278794 · Jiráskova 436, 473 01 Nový Bor · Číslo potvrzení: 2027-000001',
    );
    expect(document.fileName).toBe('potvrzeni-o-daru-2027-000001.pdf');
    expect(document.author).toBe('Nová naděje - nadační fond');
    expect(document.issuedAt).toBe(ISSUED_AT);
    expect(document.verification.qrText).toBe(frozenCase(SINGLE_PERSON_CS).verification.qrText);
    expect(document.verification.heading).toEqual({ cs: 'Ověření potvrzení', en: null });
  });

  it('when every text is mapped, then none is left with a placeholder', () => {
    const texts = JSON.stringify(document);
    expect(texts).not.toMatch(/\{\d\}/);
  });
});

describe('Given the frozen yearly receipt of a person who prefers English', () => {
  const document = receiptDocument(frozenCase(YEARLY_BILINGUAL), ISSUED_AT, TEST_CAPTIONS);

  it('when it is mapped, then every line has its English twin and the file has the English name', () => {
    expect(document.bilingual).toBe(true);
    expect(document.title).toEqual({
      cs: 'Potvrzení o přijatých darech za rok\u00a02026',
      en: 'Confirmation of donations received in\u00a02026',
    });
    expect(document.donee.heading).toEqual({ cs: 'Obdarovaný', en: 'Donee' });
    expect(document.fileName).toBe('donation-summary-2026.pdf');
    expect(document.verification.heading).toEqual({ cs: 'Ověření potvrzení', en: 'Verification' });
  });

  it('when it is mapped, then each gift row gives the Czech value and the English one in brackets', () => {
    expect(document.singleGift).toBeNull();
    expect(document.giftTable?.columns).toEqual({
      receivedOn: { cs: 'Datum připsání na účet', en: 'Date credited to the account' },
      amount: { cs: 'Částka', en: 'Amount' },
    });
    expect(document.giftTable?.rows[0].receivedOn.en).toMatch(/^\(\d{1,2} [A-Z][a-z]+ 2026\)$/);
    expect(document.giftTable?.rows[0].amount.en).toMatch(/^\(CZK [\d,.]+\)$/);
    expect(document.giftTable?.count).toEqual({ cs: 'Počet darů: 2', en: 'Number of gifts: 2' });
    expect(document.signature.issuedAt.en).toMatch(/^In Nový Bor, on \d{1,2} [A-Z][a-z]+ \d{4}$/);
  });
});

describe('Given the frozen receipt of a company that replaces an earlier one', () => {
  const document = receiptDocument(frozenCase(COMPANY_REPLACEMENT), ISSUED_AT, TEST_CAPTIONS);

  it('when it is mapped, then the replacement line and the company lines appear', () => {
    expect(document.replaces?.cs).toMatch(
      /^Toto potvrzení nahrazuje potvrzení č\. \d{4}-\d{6} ze dne \d{2}\. \d{2}\. \d{4}, které tímto pozbývá platnosti\.$/,
    );
    expect(document.donor.lines.map((line) => line.cs.split(':')[0])).toEqual([
      'Název',
      'IČO',
      'Sídlo',
      'Variabilní symbol',
    ]);
  });
});

describe('Given the frozen yearly receipt with 120 gifts', () => {
  const frozen = frozenCase(YEARLY_120);
  const document = receiptDocument(frozen, ISSUED_AT, TEST_CAPTIONS);

  it('when it is mapped, then every gift is a row in the frozen order and the totals follow', () => {
    expect(document.giftTable?.rows).toHaveLength(120);
    expect(document.giftTable?.rows[0]).toEqual({
      receivedOn: { cs: '01. 01. 2026', en: null },
      amount: { cs: '100\u00a0Kč', en: null },
    });
    expect(document.giftTable?.count.cs).toBe('Počet darů: 120');
    expect(document.giftTable?.total.cs).toMatch(
      /^Celkem darováno v roce 2026: [\d\u00a0]+(,\d\d)?\u00a0Kč$/,
    );
    expect(document.fileName).toBe('potvrzeni-o-darech-2026.pdf');
  });
});

describe('Given a frozen receipt of a gift recorded by hand', () => {
  it('when it is mapped, then the form of the gift is the manual one', () => {
    const document = receiptDocument(frozenCase(SINGLE_MANUAL), ISSUED_AT, TEST_CAPTIONS);

    expect(document.singleGift?.[0].cs).toBe('Forma daru: peněžitý dar');
  });
});

describe('Given a frozen receipt that names a signature image and a portrait', () => {
  it('when it is mapped, then the signature block names both digests and their descriptions', () => {
    const frozen = frozenCase(SINGLE_SIGNATURE);
    const document = receiptDocument(
      {
        ...frozen,
        signatory: { ...frozen.signatory, portraitImage: { sha256: 'a'.repeat(64) } },
      },
      ISSUED_AT,
      TEST_CAPTIONS,
    );

    expect(document.signature.signatureImage).toBe(frozen.signatory.signatureImage?.sha256);
    expect(document.signature.portraitImage).toBe('a'.repeat(64));
    expect(document.signature.signatureAlt).toBe('Podpis');
    expect(document.signature.portraitAlt).toBe('Portrét');
  });
});

describe('Given a frozen receipt whose issue text is changed to the typographer variant', () => {
  it('when it is mapped, then the place and date read without the comma', () => {
    const frozen = frozenCase(SINGLE_PERSON_CS);
    const document = receiptDocument(
      {
        ...frozen,
        texts: { ...frozen.texts, cs: { ...frozen.texts.cs, 'receipt.issuedAt': '{0} dne {1}' } },
      },
      ISSUED_AT,
      TEST_CAPTIONS,
    );

    expect(document.signature.issuedAt.cs).toBe('V Novém Boru dne 15. 01. 2027');
  });
});

describe('Given a frozen receipt whose donor name carries invisible format characters and a decomposed letter', () => {
  const frozen = frozenCase(SINGLE_PERSON_CS);
  const document = receiptDocument(
    {
      ...frozen,
      donor: {
        ...frozen.donor,
        name: '\ufeffJana\u200b \u202eNova\u0301kova\u0301\u202c',
        address: { ...frozen.donor.address, street: 'Dlouha\u0301\u00ad 12' },
      },
    },
    ISSUED_AT,
    TEST_CAPTIONS,
  );

  it('when it is mapped, then the lines print the name and street without them and with the letters composed', () => {
    expect(document.donor.lines.map((line) => line.cs).slice(0, 2)).toEqual([
      'Jméno a příjmení: Jana Nováková',
      'Bydliště: Dlouhá 12, 400 01 Ústí nad Labem',
    ]);
  });
});

describe('Given a frozen receipt with characters no receipt can print', () => {
  it('when it is mapped, then it is refused naming each of them once, before anything is drawn', () => {
    const frozen = frozenCase(SINGLE_PERSON_CS);

    let refused: unknown;
    try {
      receiptDocument(
        {
          ...frozen,
          donor: { ...frozen.donor, name: 'Jana 中 Nováková 中' },
          signatory: { ...frozen.signatory, role: 'předseda 😀' },
        },
        ISSUED_AT,
        TEST_CAPTIONS,
      );
    } catch (failure: unknown) {
      refused = failure;
    }

    expect(refused).toBeInstanceOf(ReceiptUnprintable);
    expect((refused as ReceiptUnprintable).outside).toEqual([0x4e2d, 0x1f600]);
  });
});
