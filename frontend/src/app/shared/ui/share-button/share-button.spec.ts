import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShareButton } from './share-button';

const TITLE = 'Zahrada pro děti';
const URL = 'https://nfnn.cz/aktuality/zahrada-pro-deti';

type ShareFn = (data: ShareData) => Promise<void>;
type CanShareFn = (data: ShareData) => boolean;

function giveNavigator(share: ShareFn | undefined, canShare?: CanShareFn): void {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
}

function forgetNavigatorStubs(): void {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
}

function abort(): DOMException {
  return new DOMException('Share canceled', 'AbortError');
}

describe('Given a share button for a news article', () => {
  let fixture: ComponentFixture<ShareButton>;
  let writeText: ReturnType<typeof vi.fn>;

  async function render(): Promise<void> {
    await TestBed.configureTestingModule({ imports: [ShareButton] }).compileComponents();
    fixture = TestBed.createComponent(ShareButton);
    fixture.componentRef.setInput('pageTitle', TITLE);
    fixture.componentRef.setInput('url', URL);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => forgetNavigatorStubs());

  const buttons = () =>
    [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
  const buttonTexts = () =>
    buttons().map((button) => button.textContent?.replace(/\s+/g, ' ').trim());
  const alert = () =>
    (
      fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null
    )?.textContent?.trim() ?? '';
  const statuses = () =>
    ([...fixture.nativeElement.querySelectorAll('[role="status"]')] as HTMLElement[])
      .map((element) => element.textContent?.trim())
      .filter((text) => text);

  async function press(button: HTMLButtonElement): Promise<void> {
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  describe('when the browser can share', () => {
    let share: ReturnType<typeof vi.fn<ShareFn>>;

    beforeEach(async () => {
      share = vi.fn<ShareFn>().mockResolvedValue(undefined);
      giveNavigator(share, () => true);
      await render();
    });

    it('then it offers one Sdílet button', () => {
      expect(buttonTexts()).toEqual(['Sdílet']);
    });

    it('and it is pressed, then the device shares the title and the address of the page', async () => {
      await press(buttons()[0]);

      expect(share).toHaveBeenCalledExactlyOnceWith({ title: TITLE, url: URL });
      expect(alert()).toBe('');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('and the page has been shared, then the button shares again on the next press', async () => {
      await press(buttons()[0]);

      expect(buttons()[0].getAttribute('aria-disabled')).toBeNull();

      await press(buttons()[0]);

      expect(share).toHaveBeenCalledTimes(2);
    });

    it('and the visitor closes the share sheet, then nothing is said and the button shares again', async () => {
      share.mockRejectedValueOnce(abort());

      await press(buttons()[0]);

      expect(buttonTexts()).toEqual(['Sdílet']);
      expect(alert()).toBe('');
      expect(statuses()).toEqual([]);
      expect(buttons()[0].getAttribute('aria-disabled')).toBeNull();

      await press(buttons()[0]);

      expect(share).toHaveBeenCalledTimes(2);
    });

    it('and it is pressed again while the share sheet is open, then the device is asked once', async () => {
      let finish: () => void = () => undefined;
      share.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

      buttons()[0].click();
      fixture.detectChanges();

      expect(buttons()[0].getAttribute('aria-disabled')).toBe('true');

      buttons()[0].click();
      finish();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(share).toHaveBeenCalledOnce();
      expect(buttons()[0].getAttribute('aria-disabled')).toBeNull();
    });

    it('and the device refuses to share, then it says so and offers to copy the link', async () => {
      share.mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'));

      await press(buttons()[0]);

      expect(alert()).toBe('Sdílení se nepodařilo. Odkaz na stránku si můžete zkopírovat.');
      expect(buttonTexts()).toEqual(['Sdílet', 'Kopírovat odkaz']);

      await press(buttons()[1]);

      expect(writeText).toHaveBeenCalledWith(URL);
    });

    it('and the device refuses, then the visitor tries again and closes the sheet, then the offer to copy the link stays', async () => {
      share.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'));
      await press(buttons()[0]);

      let close: (failure: unknown) => void = () => undefined;
      share.mockReturnValueOnce(new Promise<void>((_, reject) => (close = reject)));
      buttons()[0].click();
      fixture.detectChanges();

      expect(buttonTexts()).toEqual(['Sdílet', 'Kopírovat odkaz']);

      close(abort());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(buttonTexts()).toEqual(['Sdílet', 'Kopírovat odkaz']);
    });

    it('and the device refuses twice in a row, then the second refusal is announced again', async () => {
      share.mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'));
      await press(buttons()[0]);

      buttons()[0].click();
      fixture.detectChanges();

      expect(alert()).toBe('');
      expect(buttonTexts()).toEqual(['Sdílet', 'Kopírovat odkaz']);

      await fixture.whenStable();
      fixture.detectChanges();

      expect(alert()).toBe('Sdílení se nepodařilo. Odkaz na stránku si můžete zkopírovat.');
    });

    it('and the device refuses and later shares, then the offer to copy the link goes away', async () => {
      share.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'));
      await press(buttons()[0]);

      await press(buttons()[0]);

      expect(buttonTexts()).toEqual(['Sdílet']);
      expect(alert()).toBe('');
    });
  });

  describe('when the browser has no Web Share API', () => {
    beforeEach(async () => {
      giveNavigator(undefined, undefined);
      await render();
    });

    it('then it offers to copy the link instead', () => {
      expect(buttonTexts()).toEqual(['Kopírovat odkaz']);
    });

    it('and the copy button is pressed, then the address is in the clipboard and it says so', async () => {
      await press(buttons()[0]);

      expect(writeText).toHaveBeenCalledWith(URL);
      expect(buttonTexts()).toEqual(['Zkopírováno']);
      expect(statuses()).toEqual(['Odkaz je zkopírovaný, můžete ho vložit do zprávy.']);
    });

    it('and the browser refuses to copy, then it points to the address bar', async () => {
      writeText.mockRejectedValue(new Error('denied'));

      await press(buttons()[0]);

      expect(statuses()).toEqual([
        'Zkopírovat se nepodařilo. Odkaz najdete v adresním řádku prohlížeče.',
      ]);
    });
  });

  describe('when the browser can share but refuses this page', () => {
    let share: ReturnType<typeof vi.fn<ShareFn>>;
    let canShare: ReturnType<typeof vi.fn<CanShareFn>>;

    beforeEach(async () => {
      share = vi.fn<ShareFn>().mockResolvedValue(undefined);
      canShare = vi.fn<CanShareFn>().mockReturnValue(false);
      giveNavigator(share, canShare);
      await render();
    });

    it('then it asks about the title and the address and offers to copy the link', () => {
      expect(canShare).toHaveBeenCalledWith({ title: TITLE, url: URL });
      expect(buttonTexts()).toEqual(['Kopírovat odkaz']);
      expect(share).not.toHaveBeenCalled();
    });
  });

  describe('when the browser can share and has no canShare', () => {
    beforeEach(async () => {
      giveNavigator(vi.fn<ShareFn>().mockResolvedValue(undefined), undefined);
      await render();
    });

    it('then it offers the Sdílet button', () => {
      expect(buttonTexts()).toEqual(['Sdílet']);
    });
  });
});
