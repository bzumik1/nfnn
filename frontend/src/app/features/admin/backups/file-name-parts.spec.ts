import { fileNameParts } from './file-name-parts';

describe('Given a line that names a backup file', () => {
  it('when the line names the file, then the file name is its own part between the words around it', () => {
    expect(
      fileNameParts(
        '25. 10. 2026 3:00, 42 tabulek ze zálohy nfnn-2026-10-25_0300.dump',
        'nfnn-2026-10-25_0300.dump',
      ),
    ).toEqual([
      { text: '25. 10. 2026 3:00, 42 tabulek ze zálohy ', fileName: false },
      { text: 'nfnn-2026-10-25_0300.dump', fileName: true },
    ]);
  });

  it('when the file name starts the line, then no empty part comes before it', () => {
    expect(fileNameParts('nfnn-a.dump čeká.', 'nfnn-a.dump')).toEqual([
      { text: 'nfnn-a.dump', fileName: true },
      { text: ' čeká.', fileName: false },
    ]);
  });

  it('when the line names no file, then it stays one part', () => {
    expect(fileNameParts('Zatím žádná.', null)).toEqual([
      { text: 'Zatím žádná.', fileName: false },
    ]);
    expect(fileNameParts('Zatím žádná.', 'nfnn-a.dump')).toEqual([
      { text: 'Zatím žádná.', fileName: false },
    ]);
  });
});
