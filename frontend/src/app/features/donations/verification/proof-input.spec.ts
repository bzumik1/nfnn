import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { QrImage } from './qr-image';
import { QrReader } from './qr-reader';
import { LARGEST_FILE_BYTES, ProofInput, SCAN_ATTEMPTS, SCAN_INTERVAL_MS } from './proof-input';
import { SCAN_DEVICE, type ScanDevice } from './scan-device';

const DIGITS = '10031885061882060800046343990168929322040303989858395561963591784434255';
const LINK = `https://nfnn.cz/overit#${DIGITS}`;
const FOREIGN = 'https://example.org/overit#1003';
const FRAME: QrImage = { data: new Uint8ClampedArray(16), width: 2, height: 2 };

class FakeTrack {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

class FakeDevice implements ScanDevice {
  camera = true;
  readonly track = new FakeTrack();
  opening: () => Promise<MediaStream> = () =>
    Promise.resolve({ getTracks: () => [this.track] } as unknown as MediaStream);
  picturing: (file: Blob) => Promise<QrImage> = () => Promise.resolve(FRAME);
  framesTaken = 0;

  hasCamera(): boolean {
    return this.camera;
  }

  openCamera(): Promise<MediaStream> {
    return this.opening();
  }

  attach(): Promise<void> {
    return Promise.resolve();
  }

  frame(): QrImage | null {
    this.framesTaken++;
    return FRAME;
  }

  picture(file: Blob): Promise<QrImage> {
    return this.picturing(file);
  }
}

class FakeReader {
  answers: (readonly string[])[] = [];
  released = false;

  read(): Promise<readonly string[]> {
    return Promise.resolve(this.answers.shift() ?? []);
  }

  release(): void {
    this.released = true;
  }
}

function pdfFile(...uris: string[]): File {
  const body = uris
    .map((uri, index) => `${index + 1} 0 obj\n<< /A << /S /URI /URI (${uri}) >> >>\nendobj\n`)
    .join('');
  return new File([`%PDF-1.7\n${body}%%EOF\n`], 'potvrzeni.pdf', { type: 'application/pdf' });
}

describe('Given the ways to read a receipt code on the verification page', () => {
  let fixture: ComponentFixture<ProofInput>;
  let device: FakeDevice;
  let reader: FakeReader;
  let found: string[];

  async function render(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [ProofInput],
      providers: [
        { provide: SCAN_DEVICE, useValue: device },
        { provide: QrReader, useValue: reader },
      ],
    });
    fixture = TestBed.createComponent(ProofInput);
    found = [];
    fixture.componentInstance.found.subscribe((fragment) => found.push(fragment));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(name: string): HTMLButtonElement | undefined {
    return Array.from(element().querySelectorAll('button')).find(
      (each) => each.textContent?.trim() === name,
    );
  }

  function alertText(): string {
    return element().querySelector('[role="alert"]')?.textContent?.trim() ?? '';
  }

  function statusText(): string {
    return element().querySelector('[role="status"]')?.textContent?.trim() ?? '';
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 5; round++) {
      await Promise.resolve();
    }
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function choose(file: File): Promise<void> {
    const input = element().querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
    await settle();
  }

  async function paste(text: string): Promise<void> {
    const input = element().querySelector('#proof-link') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
    (element().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle();
  }

  beforeEach(() => {
    device = new FakeDevice();
    reader = new FakeReader();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('when it shows, then it offers the camera, a file and a pasted link, each under its own heading', async () => {
    await render();

    expect(
      Array.from(element().querySelectorAll('h2'), (heading) => heading.textContent?.trim()),
    ).toEqual(['Načíst fotoaparátem', 'Nahrát soubor', 'Vložit odkaz']);
    expect(button('Naskenovat QR kód')).toBeDefined();
    expect(element().querySelector('label[for="proof-file"]')?.textContent?.trim()).toBe(
      'Nahrát PDF nebo fotku',
    );
    expect((element().querySelector('#proof-file') as HTMLInputElement).accept).toBe(
      'application/pdf,image/*',
    );
    expect(element().querySelector('label[for="proof-link"]')?.textContent?.trim()).toBe(
      'Odkaz z QR kódu',
    );
  });

  it('when the browser cannot use a camera, then the camera part is left out', async () => {
    device.camera = false;
    await render();

    expect(button('Naskenovat QR kód')).toBeUndefined();
    expect(
      Array.from(element().querySelectorAll('h2'), (heading) => heading.textContent?.trim()),
    ).toEqual(['Nahrát soubor', 'Vložit odkaz']);
  });

  describe('when the visitor scans with the camera', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('and the camera sees the foundation code, then it hands the code over and turns the camera off', async () => {
      reader.answers = [[], [LINK]];
      await render();

      button('Naskenovat QR kód')?.click();
      await settle();
      expect(statusText()).toBe('Namiřte fotoaparát na QR kód z potvrzení.');
      expect(element().querySelector('video')?.getAttribute('aria-label')).toBe(
        'Náhled z fotoaparátu',
      );

      await vi.advanceTimersByTimeAsync(SCAN_INTERVAL_MS * 2);
      await settle();

      expect(found).toEqual([DIGITS]);
      expect(device.track.stopped).toBe(true);
      expect(button('Zastavit skenování')).toBeUndefined();
    });

    it('and the camera sees another code first, then it says so and keeps scanning', async () => {
      reader.answers = [[FOREIGN]];
      await render();

      button('Naskenovat QR kód')?.click();
      await settle();
      await vi.advanceTimersByTimeAsync(SCAN_INTERVAL_MS);
      await settle();

      expect(alertText()).toBe(
        'Tento QR kód nepatří k potvrzení fondu Nová naděje. Načtěte kód z potvrzení o daru.',
      );
      expect(device.track.stopped).toBe(false);

      reader.answers = [[FOREIGN, LINK]];
      await vi.advanceTimersByTimeAsync(SCAN_INTERVAL_MS);
      await settle();

      expect(found).toEqual([DIGITS]);
      expect(alertText()).toBe('');
    });

    it('and they stop it, then the camera turns off and the scan button returns, focused', async () => {
      await render();

      button('Naskenovat QR kód')?.click();
      await settle();
      button('Zastavit skenování')?.click();
      await settle();

      expect(device.track.stopped).toBe(true);
      expect(document.activeElement).toBe(button('Naskenovat QR kód'));
      const taken = device.framesTaken;
      await vi.advanceTimersByTimeAsync(SCAN_INTERVAL_MS * 3);
      expect(device.framesTaken).toBe(taken);
    });

    it('and no code is read for the whole scan, then it stops and says what to try', async () => {
      await render();

      button('Naskenovat QR kód')?.click();
      await settle();
      await vi.advanceTimersByTimeAsync(SCAN_INTERVAL_MS * (SCAN_ATTEMPTS + 2));
      await settle();

      expect(device.framesTaken).toBe(SCAN_ATTEMPTS);
      expect(device.track.stopped).toBe(true);
      expect(alertText()).toBe(
        'QR kód se nepodařilo přečíst. Zkuste to znovu s kódem zblízka a na světle, nebo nahrajte PDF či fotku kódu.',
      );
    });

    it('and the page is left while scanning, then the camera and the reader are released', async () => {
      await render();

      button('Naskenovat QR kód')?.click();
      await settle();
      fixture.destroy();

      expect(device.track.stopped).toBe(true);
      expect(reader.released).toBe(true);
    });

    for (const [name, error, text] of [
      [
        'the browser refuses the camera',
        'NotAllowedError',
        'Prohlížeč nedovolil použít fotoaparát. Povolte ho v nastavení prohlížeče, nebo nahrajte PDF či fotku kódu.',
      ],
      [
        'there is no camera',
        'NotFoundError',
        'Fotoaparát jsme v zařízení nenašli. Nahrajte PDF potvrzení nebo fotku jeho QR kódu.',
      ],
      [
        'the camera fails to start',
        'NotReadableError',
        'Fotoaparát se nepodařilo spustit. Zkuste to znovu, nebo nahrajte PDF či fotku kódu.',
      ],
    ]) {
      it(`and ${name}, then it says so and offers the scan again`, async () => {
        device.opening = () => Promise.reject(new DOMException('', error));
        await render();

        button('Naskenovat QR kód')?.click();
        await settle();

        expect(alertText()).toBe(text);
        expect(button('Naskenovat QR kód')).toBeDefined();
      });
    }
  });

  describe('when the visitor uploads a file', () => {
    it('and it is a receipt PDF, then it hands over the code from its verification link', async () => {
      await render();

      await choose(pdfFile('https://nfnn.cz/kontakt', LINK));

      expect(found).toEqual([DIGITS]);
    });

    it('and the PDF carries no verification link, then it says to upload the PDF from the site', async () => {
      await render();

      await choose(pdfFile('https://example.org'));

      expect(found).toEqual([]);
      expect(alertText()).toBe(
        'V tomto PDF jsme ověřovací kód nenašli. Nahrajte PDF potvrzení tak, jak jste ho stáhli z webu fondu, nebo načtěte jeho QR kód.',
      );
    });

    it('and it is a photo of the code, then it hands the code over', async () => {
      reader.answers = [[LINK]];
      await render();

      await choose(new File(['jpeg'], 'kod.jpg', { type: 'image/jpeg' }));

      expect(found).toEqual([DIGITS]);
    });

    it('and the photo shows no code, then it says how to take a better one', async () => {
      await render();

      await choose(new File(['jpeg'], 'kod.jpg', { type: 'image/jpeg' }));

      expect(found).toEqual([]);
      expect(alertText()).toBe(
        'Na obrázku jsme QR kód nenašli. Vyfoťte kód zblízka a ostře, nebo nahrajte PDF potvrzení.',
      );
    });

    it('and the photo shows another code, then it says the code is not the foundation’s', async () => {
      reader.answers = [[FOREIGN]];
      await render();

      await choose(new File(['jpeg'], 'kod.jpg', { type: 'image/jpeg' }));

      expect(alertText()).toBe(
        'Tento QR kód nepatří k potvrzení fondu Nová naděje. Načtěte kód z potvrzení o daru.',
      );
    });

    it('and the file is neither a PDF nor an image the browser opens, then it says so', async () => {
      device.picturing = () => Promise.reject(new Error('not an image'));
      await render();

      await choose(new File(['text'], 'poznamka.txt', { type: 'text/plain' }));

      expect(alertText()).toBe(
        'Soubor se nepodařilo otevřít. Nahrajte PDF potvrzení nebo fotku kódu ve formátu JPEG či PNG.',
      );
    });

    it('and the file is too large, then it reads nothing and says so', async () => {
      await render();
      const large = new File(['x'], 'velky.pdf', { type: 'application/pdf' });
      Object.defineProperty(large, 'size', { value: LARGEST_FILE_BYTES + 1 });

      await choose(large);

      expect(found).toEqual([]);
      expect(alertText()).toBe(
        'Soubor je příliš velký. Nahrajte PDF potvrzení nebo fotku kódu menší než 20 MB.',
      );
    });

    it('and the file is still being read, then a status line says so and the button waits', async () => {
      let picture: (image: QrImage) => void = () => undefined;
      device.picturing = () => new Promise((resolve) => (picture = resolve));
      await render();

      await choose(new File(['jpeg'], 'kod.jpg', { type: 'image/jpeg' }));

      expect(statusText()).toBe('Čteme kód ze souboru…');
      expect((element().querySelector('#proof-file') as HTMLInputElement).disabled).toBe(true);
      picture(FRAME);
      await settle();
      expect(statusText()).toBe('');
    });
  });

  describe('when the visitor pastes a link', () => {
    it('and it is the link of a verification code, then it hands the code over', async () => {
      await render();

      await paste(`  ${LINK}  `);

      expect(found).toEqual([DIGITS]);
    });

    it('and it is another link, then the field says what a verification link looks like', async () => {
      await render();

      await paste(FOREIGN);

      expect(found).toEqual([]);
      const field = element().querySelector('#proof-link') as HTMLInputElement;
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(field);
      expect(element().querySelector('#proof-link-error')?.textContent?.trim()).toBe(
        'Tohle není odkaz z QR kódu potvrzení. Musí začínat https://nfnn.cz/overit# a pokračovat číslicemi.',
      );
    });

    it('and the field is empty, then the field asks for the link', async () => {
      await render();

      await paste('');

      expect(found).toEqual([]);
      expect(element().querySelector('#proof-link-error')?.textContent?.trim()).toBe(
        'Vložte odkaz z QR kódu potvrzení.',
      );
    });
  });
});
