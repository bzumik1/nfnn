import { titleParts } from './title-parts';

describe('Given the title of a log entry', () => {
  it('when it is a class name, then it may break only where a new word starts', () => {
    expect(titleParts('ImportBankPaymentsService')).toEqual([
      'Import',
      'Bank',
      'Payments',
      'Service',
    ]);
  });

  it('when a class name holds an acronym or a digit, then the acronym stays whole', () => {
    expect(titleParts('HTTPClient2Adapter')).toEqual(['HTTPClient2', 'Adapter']);
  });

  it('when it is a request, then it may break only after a slash', () => {
    expect(titleParts('GET /api/admin/operations/logs')).toEqual([
      'GET /',
      'api/',
      'admin/',
      'operations/',
      'logs',
    ]);
  });

  it('when it is one word, then it stays one part', () => {
    expect(titleParts('ROOT')).toEqual(['ROOT']);
  });
});
