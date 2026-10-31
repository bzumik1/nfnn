import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ReceiptRestart } from './receipt-restart';

describe('Given a receipt download whose drawing tools went missing after a new release', () => {
  let assign: ReturnType<typeof vi.fn<(url: string) => void>>;
  let restart: ReceiptRestart;

  beforeEach(() => {
    sessionStorage.clear();
    assign = vi.fn<(url: string) => void>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: { location: { href: 'https://nfnn.cz/darce/potvrzeni?x=1', assign } },
        },
      ],
    });
    restart = TestBed.inject(ReceiptRestart);
  });

  afterEach(() => sessionStorage.clear());

  it('when it fails the first time, then the page loads again with the download named in the address', () => {
    expect(restart.tryRestart('rok-2025')).toBe(true);

    expect(assign).toHaveBeenCalledWith('https://nfnn.cz/darce/potvrzeni?x=1&stahnout=rok-2025');
  });

  it('when the same download fails again after the reload, then it does not reload a second time', () => {
    restart.tryRestart('rok-2025');

    expect(restart.tryRestart('rok-2025')).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('when a restarted download finished, then a later failure may restart once again', () => {
    restart.tryRestart('rok-2025');
    restart.finished();

    expect(restart.tryRestart('rok-2025')).toBe(true);
  });

  it('when the reloaded page asks whether to resume the download its address names, then only the download this tab reloaded for is resumed', () => {
    restart.tryRestart('rok-2025');

    expect(restart.resumes('rok-2025')).toBe(true);
    expect(restart.resumes('rok-2024')).toBe(false);
    expect(restart.resumes('dar-d-1')).toBe(false);
  });

  it('when a page opens with a download in its address but this tab never reloaded for it, then it is not resumed', () => {
    expect(restart.resumes('rok-2025')).toBe(false);
  });

  it('when the browser keeps no session storage, then it never reloads, so it cannot loop', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(restart.tryRestart('rok-2025')).toBe(false);
    expect(assign).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
