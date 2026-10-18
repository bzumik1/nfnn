import { saveBlob } from './file-download';

describe('Given a downloaded file', () => {
  const blob = new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' });
  const objectUrl = 'blob:http://localhost/receipt';
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clicked: { link: HTMLAnchorElement; attached: boolean }[];

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => objectUrl);
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ link: this, attached: document.body.contains(this) });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('when it is saved, then a download link to its object URL under its file name is clicked inside the page', () => {
    saveBlob({ blob, fileName: 'potvrzeni-o-darech-2025.pdf' });

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].link.href).toBe(objectUrl);
    expect(clicked[0].link.download).toBe('potvrzeni-o-darech-2025.pdf');
    expect(clicked[0].attached).toBe(true);
  });

  it('when it is saved, then the link leaves the page right after the click', () => {
    saveBlob({ blob, fileName: 'potvrzeni-o-darech-2025.pdf' });

    expect(document.body.contains(clicked[0].link)).toBe(false);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('when it is saved, then the object URL is revoked only after the click has been handled', () => {
    saveBlob({ blob, fileName: 'potvrzeni-o-darech-2025.pdf' });

    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });
});
