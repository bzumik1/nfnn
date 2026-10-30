import {
  schemaOf,
  schemaViolations,
  sharedCaseContent,
  sharedCaseFiles,
  sharedCases,
  topicSchemas,
} from './shared-cases';

interface PaymentCaseFile {
  cases: { expected: Record<string, unknown> & { matrix?: string[] } }[];
}

const PAYMENT_CASES = 'qr/payment.json';

function paymentCaseFile(): PaymentCaseFile {
  return structuredClone(sharedCaseContent(PAYMENT_CASES)) as PaymentCaseFile;
}

describe('Given the shared case files the backend also runs', () => {
  it('when they are listed, then every topic of both sides is there', () => {
    expect(sharedCaseFiles()).toEqual(
      expect.arrayContaining([
        'admin-overview/year-overview.json',
        'donor-summary/summary.json',
        'qr/payment.json',
        'qr/totp.json',
        'receipts/formatting.json',
      ]),
    );
  });

  it('when they are paired with the topic schemas, then each has its schema and each schema its file', () => {
    expect(sharedCaseFiles().map(schemaOf)).toEqual(topicSchemas());
  });

  for (const caseFile of sharedCaseFiles()) {
    it(`when ${caseFile} is checked against its JSON Schema, then it is valid and names each case once`, () => {
      expect(schemaViolations(caseFile, sharedCaseContent(caseFile))).toEqual([]);
      const names = sharedCases(caseFile).map((sharedCase) => sharedCase.name);
      expect(new Set(names).size).toBe(names.length);
    });
  }
});

describe('Given a payment case whose matrix holds a module other than 0 and 1', () => {
  it('when it is checked against its schema, then it is refused', () => {
    const file = paymentCaseFile();
    const matrix = file.cases[0].expected.matrix ?? [];
    matrix[0] = matrix[0].replace('1', '2');

    expect(schemaViolations(PAYMENT_CASES, file)).toContain(
      '/cases/0/expected/matrix/0 must match pattern "^[01]{21,177}$"',
    );
  });
});

describe('Given a payment case with a field its schema does not know', () => {
  it('when it is checked against its schema, then it is refused', () => {
    const file = paymentCaseFile();
    file.cases[0].expected['spaydText'] = 'SPD*1.0';

    expect(schemaViolations(PAYMENT_CASES, file)).toContain(
      '/cases/0/expected must NOT have unevaluated properties',
    );
  });
});

describe('Given a payment case without its expected value', () => {
  it('when it is checked against its schema, then it is refused', () => {
    const file = paymentCaseFile();
    delete (file.cases[0] as Partial<PaymentCaseFile['cases'][0]>).expected;

    expect(schemaViolations(PAYMENT_CASES, file)).toContain(
      "/cases/0 must have required property 'expected'",
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
