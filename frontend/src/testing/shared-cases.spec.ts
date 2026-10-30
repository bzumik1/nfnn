import {
  createSchemaValidator,
  type QrSymbol,
  schemaIdOf,
  schemaOf,
  schemaViolations,
  SHARED_CASE_TOPICS,
  sharedCaseContent,
  sharedCaseFiles,
  sharedCases,
  topicSchemas,
} from './shared-cases';

interface EditableCaseFile {
  source: string;
  cases: {
    name: string;
    input: Record<string, unknown>;
    expected: Record<string, unknown> & { matrix?: string[]; refused?: Record<string, unknown> };
  }[];
}

const SPAYD_CASES = 'payment/spayd.json';
const PAYMENT_CASES = 'qr/payment.json';
const TOTP_CASES = 'qr/totp.json';
const RECEIPT_CASES = 'receipts/formatting.json';
const FINDER_SPAN = 17;
const MODULES_PER_VERSION = 4;

function editable(caseFile: string): EditableCaseFile {
  return structuredClone(sharedCaseContent(caseFile)) as EditableCaseFile;
}

function inconsistencies(symbol: QrSymbol): readonly string[] {
  const found: string[] = [];
  if (symbol.size !== FINDER_SPAN + MODULES_PER_VERSION * symbol.version) {
    found.push(`size ${symbol.size} is not that of version ${symbol.version}`);
  }
  if (symbol.matrix.length !== symbol.size) {
    found.push(`${symbol.matrix.length} rows for size ${symbol.size}`);
  }
  symbol.matrix.forEach((row, index) => {
    if (row.length !== symbol.size) {
      found.push(`row ${index} has ${row.length} modules for size ${symbol.size}`);
    }
  });
  return found;
}

function qrSymbols(): readonly { name: string; symbol: QrSymbol }[] {
  return [
    ...sharedCases('qr/payment.json').map((sharedCase) => ({
      name: sharedCase.name,
      symbol: sharedCase.expected,
    })),
    ...sharedCases('qr/totp.json').map((sharedCase) => ({
      name: sharedCase.name,
      symbol: sharedCase.expected,
    })),
  ];
}

describe('Given the shared case files the backend also runs', () => {
  it('when they are listed, then they are exactly the registered topics', () => {
    expect(sharedCaseFiles()).toEqual([...SHARED_CASE_TOPICS].sort());
  });

  it('when they are paired with the topic schemas, then each has its schema and each schema its file', () => {
    expect(sharedCaseFiles().map(schemaOf)).toEqual(topicSchemas());
  });

  for (const caseFile of sharedCaseFiles()) {
    it(`when ${caseFile} is checked against its JSON Schema, then it is valid and names each case once`, () => {
      expect(schemaViolations(caseFile, sharedCaseContent(caseFile))).toEqual([]);
      const names = (sharedCaseContent(caseFile) as EditableCaseFile).cases.map(
        (sharedCase) => sharedCase.name,
      );
      expect(new Set(names).size).toBe(names.length);
    });
  }
});

describe('Given a case file a spec has read', () => {
  it('when the spec changes one of its values, then the change is refused and the case stays as the file holds it', () => {
    const file = sharedCaseContent(TOTP_CASES) as EditableCaseFile;
    const firstRow = file.cases[0].expected.matrix?.[0];

    expect(() => {
      file.source = 'changed';
    }).toThrow(TypeError);
    expect(() => {
      file.cases[0].expected.matrix?.splice(0, 1);
    }).toThrow(TypeError);
    expect((sharedCaseContent(TOTP_CASES) as EditableCaseFile).cases[0].expected.matrix?.[0]).toBe(
      firstRow,
    );
  });
});

describe('Given the schemas, which reference each other by their nfnn.cz ids', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('when a new validator compiles every topic schema, then it resolves them from the library and fetches nothing', () => {
    const fetching = vi.spyOn(globalThis, 'fetch');
    const validator = createSchemaValidator();

    for (const schema of topicSchemas()) {
      expect(validator.getSchema(schemaIdOf(schema))).toBeTypeOf('function');
    }
    expect(fetching).not.toHaveBeenCalled();
  });

  it('when a schema references an id outside the library, then it is refused without a request', () => {
    const fetching = vi.spyOn(globalThis, 'fetch');
    const validator = createSchemaValidator();
    validator.addSchema({
      $id: schemaIdOf('schemas/elsewhere.schema.json'),
      $ref: 'https://nfnn.cz/shared-cases/schemas/defs/nowhere.schema.json',
    });

    expect(() => validator.getSchema(schemaIdOf('schemas/elsewhere.schema.json'))).toThrow(
      /can't resolve reference/,
    );
    expect(fetching).not.toHaveBeenCalled();
  });
});

describe('Given the QR cases', () => {
  it('when each symbol is checked, then its size is that of its version and its matrix has size rows of size modules', () => {
    expect(qrSymbols().length).toBeGreaterThan(0);
    for (const { name, symbol } of qrSymbols()) {
      expect(inconsistencies(symbol), name).toEqual([]);
    }
  });

  it('when a symbol has lost a row and its size is off its version, then both are reported', () => {
    const symbol = structuredClone(qrSymbols()[0].symbol) as QrSymbol & { matrix: string[] };
    symbol.matrix.pop();

    expect(inconsistencies({ ...symbol, version: symbol.version + 1 })).toEqual([
      `size ${symbol.size} is not that of version ${symbol.version + 1}`,
      `${symbol.size - 1} rows for size ${symbol.size}`,
    ]);
  });
});

describe('Given a case file whose source is neither v2-baseline nor edited', () => {
  it('when it is checked against its schema, then it is refused', () => {
    const file = editable(PAYMENT_CASES);
    file.source = 'regenerated';

    expect(schemaViolations(PAYMENT_CASES, file)).toContain(
      '/source must be equal to one of the allowed values',
    );
  });
});

describe('Given the SPAYD cases and the payment QR cases', () => {
  function textsOfSpaydCases(): Record<string, string> {
    return Object.fromEntries(
      sharedCases('payment/spayd.json').flatMap((sharedCase) =>
        'spayd' in sharedCase.expected ? [[sharedCase.name, sharedCase.expected.spayd]] : [],
      ),
    );
  }

  it('when they are matched by case name, then every SPAYD text has its QR case and every QR case encodes the text of its SPAYD case', () => {
    const encodedTexts = Object.fromEntries(
      sharedCases('qr/payment.json').map((sharedCase) => [sharedCase.name, sharedCase.input.spayd]),
    );

    expect(Object.keys(encodedTexts).length).toBeGreaterThan(0);
    expect(encodedTexts).toEqual(textsOfSpaydCases());
  });
});

describe('Given a SPAYD case', () => {
  it('when its expected text is not SPAYD text, then it is refused', () => {
    const file = editable(SPAYD_CASES);
    file.cases[0].expected['spayd'] = 'spd*1.0*acc:cz2620100000005544332217';

    expect(schemaViolations(SPAYD_CASES, file)).toContain(
      '/cases/0/expected/spayd must match pattern "^SPD\\*1\\.0(\\*[A-Z-]+:[0-9A-Z $%+./:-]*)+$"',
    );
  });

  it('when it gives a text and a refusal at once, then it is refused', () => {
    const file = editable(SPAYD_CASES);
    file.cases[0].expected['refused'] = {
      status: 400,
      type: 'https://nfnn.cz/problems/validation',
      fields: [],
    };

    expect(schemaViolations(SPAYD_CASES, file)).toContain(
      '/cases/0/expected must match exactly one schema in oneOf',
    );
  });

  it('when it has no expected value, then it is refused', () => {
    const file = editable(SPAYD_CASES);
    delete (file.cases[0] as Partial<EditableCaseFile['cases'][0]>).expected;

    expect(schemaViolations(SPAYD_CASES, file)).toContain(
      "/cases/0 must have required property 'expected'",
    );
  });

  it('when its refusal names a problem type that is no problem type of the API, then it is refused', () => {
    const file = editable(SPAYD_CASES);
    const refusal = file.cases.find((sharedCase) => sharedCase.expected.refused !== undefined);
    if (refusal?.expected.refused === undefined) {
      throw new Error(`${SPAYD_CASES} holds no refusal`);
    }
    refusal.expected.refused['type'] = 'https://nfnn.cz/problems/anything/at all';

    expect(schemaViolations(SPAYD_CASES, file).join('\n')).toMatch(
      /\/cases\/\d+\/expected\/refused\/type must match pattern/,
    );
  });
});

describe('Given a payment QR case', () => {
  it('when its matrix holds a module other than 0 and 1, then it is refused', () => {
    const file = editable(PAYMENT_CASES);
    const matrix = file.cases[0].expected.matrix ?? [];
    matrix[0] = matrix[0].replace('1', '2');

    expect(schemaViolations(PAYMENT_CASES, file)).toContain(
      '/cases/0/expected/matrix/0 must match pattern "^[01]{21,177}$"',
    );
  });

  it('when its expected symbol still carries the SPAYD text, then it is refused', () => {
    const file = editable(PAYMENT_CASES);
    file.cases[0].expected['spayd'] = file.cases[0].input['spayd'];

    expect(schemaViolations(PAYMENT_CASES, file)).toContain(
      '/cases/0/expected must NOT have unevaluated properties',
    );
  });

  it('when its input is not SPAYD text, then it is refused', () => {
    const file = editable(PAYMENT_CASES);
    file.cases[0].input['spayd'] = 'otpauth://totp/Nadace';

    expect(schemaViolations(PAYMENT_CASES, file).join('\n')).toMatch(
      /\/cases\/0\/input\/spayd must match pattern/,
    );
  });

  it('when its mode is not alphanumeric, then it is refused', () => {
    const file = editable(PAYMENT_CASES);
    file.cases[0].expected['mode'] = 'BYTE';

    expect(schemaViolations(PAYMENT_CASES, file)).toContain(
      '/cases/0/expected/mode must be equal to constant',
    );
  });
});

describe('Given a TOTP case', () => {
  it('when its mode is not BYTE, then it is refused', () => {
    const file = editable(TOTP_CASES);
    file.cases[0].expected['mode'] = 'ALPHANUMERIC';

    expect(schemaViolations(TOTP_CASES, file)).toContain(
      '/cases/0/expected/mode must be equal to constant',
    );
  });

  it('when it has no ECI header, then it is refused', () => {
    const file = editable(TOTP_CASES);
    file.cases[0].expected['eci'] = null;

    expect(schemaViolations(TOTP_CASES, file)).toContain(
      '/cases/0/expected/eci must be equal to constant',
    );
  });
});

describe('Given a receipt donor case', () => {
  function donorCase(file: EditableCaseFile, company: boolean): EditableCaseFile['cases'][0] {
    const found = file.cases.find(
      (sharedCase) =>
        sharedCase.input['format'] === 'donor' && sharedCase.input['company'] === company,
    );
    if (found === undefined) {
      throw new Error(`${RECEIPT_CASES} holds no donor case with company ${company}`);
    }
    return found;
  }

  it('when a person carries a company identifier, then it is refused', () => {
    const file = editable(RECEIPT_CASES);
    donorCase(file, false).input['companyIdentifier'] = '25596641';

    expect(schemaViolations(RECEIPT_CASES, file).join('\n')).toMatch(
      /\/cases\/\d+\/input\/companyIdentifier must be null/,
    );
  });

  it('when a company has no identifier, then it is refused', () => {
    const file = editable(RECEIPT_CASES);
    donorCase(file, true).input['companyIdentifier'] = null;

    expect(schemaViolations(RECEIPT_CASES, file).join('\n')).toMatch(
      /\/cases\/\d+\/input\/companyIdentifier must be string/,
    );
  });
});

describe('Given a shared case file without its schema', () => {
  it('when it is checked, then the missing schema is named', () => {
    expect(schemaViolations('unknown/topic.json', {})).toEqual([
      'schemas/unknown/topic.schema.json is missing',
    ]);
  });
});
