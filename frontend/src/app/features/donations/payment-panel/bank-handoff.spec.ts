import { handOver, imageFile, spaydFile } from './bank-handoff';

const SPAYD =
  'SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE';

interface Downloaded {
  readonly name: string;
  readonly href: string;
}

function recordDownloads(): Downloaded[] {
  const downloads: Downloaded[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ name: this.download, href: this.href });
  });
  return downloads;
}

function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

describe('Given a payment handed to a bank app', () => {
  let createdUrls: Blob[];

  beforeEach(() => {
    createdUrls = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        createdUrls.push(blob);
        return `blob:nfnn/${createdUrls.length}`;
      },
      revokeObjectURL: () => undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('when the SPAYD file is made, then it is platba.spayd of the short payment descriptor type holding exactly the SPAYD text', async () => {
    const file = spaydFile(SPAYD);

    expect(file.name).toBe('platba.spayd');
    expect(file.type).toBe('application/x-shortpaymentdescriptor');
    expect(await readText(file)).toBe(SPAYD);
  });

  it('when the QR image file is made, then it is the PNG qr-platba-nova-nadeje.png', () => {
    const file = imageFile(new Blob(['png'], { type: 'image/png' }));

    expect(file.name).toBe('qr-platba-nova-nadeje.png');
    expect(file.type).toBe('image/png');
  });

  describe('Given a phone that shares files', () => {
    let shared: ShareData[];
    let refusal: Error | null;

    beforeEach(() => {
      shared = [];
      refusal = null;
      vi.stubGlobal('navigator', {
        ...navigator,
        canShare: (data: ShareData) => (data.files ?? []).length > 0,
        share: async (data: ShareData) => {
          shared.push(data);
          if (refusal) {
            throw refusal;
          }
        },
      });
    });

    it('when the file is handed over, then the phone offers it under its title and nothing downloads', async () => {
      const downloads = recordDownloads();
      const file = spaydFile(SPAYD);

      const outcome = await handOver(file, 'QR platba');

      expect(outcome).toBe('shared');
      expect(shared).toEqual([{ files: [file], title: 'QR platba' }]);
      expect(downloads).toEqual([]);
    });

    it('when the visitor closes the offer without choosing an app, then the hand-over is dismissed', async () => {
      refusal = new DOMException('Share canceled', 'AbortError');

      expect(await handOver(spaydFile(SPAYD), 'QR platba')).toBe('dismissed');
    });

    it('when the phone refuses to share, then the hand-over is refused and nothing downloads', async () => {
      const downloads = recordDownloads();
      refusal = new DOMException('Not allowed', 'NotAllowedError');

      expect(await handOver(spaydFile(SPAYD), 'QR platba')).toBe('refused');
      expect(downloads).toEqual([]);
    });
  });

  describe('Given a browser that cannot share this kind of file', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        ...navigator,
        canShare: () => false,
        share: () => Promise.reject(new Error('must not be asked')),
      });
    });

    it('when the file is handed over, then it downloads under its own name', async () => {
      const downloads = recordDownloads();
      const file = spaydFile(SPAYD);

      const outcome = await handOver(file, 'QR platba');

      expect(outcome).toBe('downloaded');
      expect(downloads).toEqual([{ name: 'platba.spayd', href: 'blob:nfnn/1' }]);
      expect(createdUrls).toEqual([file]);
    });
  });

  describe('Given a browser without Web Share', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined });
    });

    it('when the file is handed over, then it downloads under its own name', async () => {
      const downloads = recordDownloads();

      expect(await handOver(spaydFile(SPAYD), 'QR platba')).toBe('downloaded');
      expect(downloads.map((download) => download.name)).toEqual(['platba.spayd']);
    });
  });
});
