import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { bytesToBase64Url } from '../../../core/device/crypto/device-bytes';
import type { IssuedReceipt } from '../receipt-pdf/frozen-receipt';
import type { ReceiptImageBytes, ReceiptSource } from '../receipt-pdf/receipts-api';
import { copyBackedReceiptSource } from './copy-receipt-source';
import type { DonorCopyView } from './donor-copy-view';

const SIGNATURE = new Uint8Array([1, 2, 3, 250]);

function receipt(overrides: Partial<IssuedReceipt> = {}): IssuedReceipt {
  return {
    id: 'receipt:1',
    status: 'ACTIVE',
    kind: 'YEARLY',
    number: '2026-000001',
    donationId: null,
    year: 2025,
    issuedAt: '2026-01-15T09:30:00Z',
    supersededAt: null,
    receipt: {} as IssuedReceipt['receipt'],
    ...overrides,
  };
}

function view(receipts: readonly IssuedReceipt[]): DonorCopyView {
  return {
    summary: {} as DonorCopyView['summary'],
    items: [],
    receipts,
    images: [
      { sha256: 'a'.repeat(64), mediaType: 'image/png', base64: bytesToBase64Url(SIGNATURE) },
    ],
    agrees: true,
  };
}

function online(answer: Observable<IssuedReceipt>): ReceiptSource & { images: string[] } {
  const images: string[] = [];
  return {
    images,
    receipt: () => answer,
    image: (sha256) => {
      images.push(sha256);
      return of<ReceiptImageBytes>({ bytes: new ArrayBuffer(1), mediaType: 'image/jpeg' });
    },
  };
}

const UNREACHABLE = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });

describe('Given a receipt drawn for a donor whose copy is on the device', () => {
  it('when the server answers, then its receipt is drawn', async () => {
    const served = receipt({ id: 'receipt:served' });
    const source = copyBackedReceiptSource(online(of(served)), () => view([receipt()]), {
      year: 2025,
    });

    expect(await firstValueFrom(source.receipt())).toBe(served);
  });

  it('when the server cannot be reached, then the copy’s active receipt of that year or gift is drawn', async () => {
    const yearly = receipt({ id: 'yearly' });
    const single = receipt({ id: 'single', kind: 'SINGLE', year: null, donationId: 'gift-1' });
    const copy = (): DonorCopyView =>
      view([receipt({ id: 'replaced', status: 'REPLACED' }), yearly, single]);

    expect(
      await firstValueFrom(
        copyBackedReceiptSource(online(throwError(() => UNREACHABLE)), copy, {
          year: 2025,
        }).receipt(),
      ),
    ).toBe(yearly);
    expect(
      await firstValueFrom(
        copyBackedReceiptSource(online(throwError(() => UNREACHABLE)), copy, {
          donationId: 'gift-1',
        }).receipt(),
      ),
    ).toBe(single);
  });

  it('when the server cannot be reached and the copy holds no such receipt, or the server refuses, then the failure stays', async () => {
    const refused = new HttpErrorResponse({ status: 409 });

    await expect(
      firstValueFrom(
        copyBackedReceiptSource(online(throwError(() => UNREACHABLE)), () => view([]), {
          year: 2025,
        }).receipt(),
      ),
    ).rejects.toBe(UNREACHABLE);
    await expect(
      firstValueFrom(
        copyBackedReceiptSource(online(throwError(() => UNREACHABLE)), () => null, {
          year: 2025,
        }).receipt(),
      ),
    ).rejects.toBe(UNREACHABLE);
    await expect(
      firstValueFrom(
        copyBackedReceiptSource(online(throwError(() => refused)), () => view([receipt()]), {
          year: 2025,
        }).receipt(),
      ),
    ).rejects.toBe(refused);
  });

  it('when an image is kept in the copy, then it comes from the copy, and any other from the server', async () => {
    const server = online(of(receipt()));
    const source = copyBackedReceiptSource(server, () => view([]), { year: 2025 });

    const kept = await firstValueFrom(source.image('a'.repeat(64)));
    const fetched = await firstValueFrom(source.image('b'.repeat(64)));

    expect(new Uint8Array(kept.bytes)).toEqual(SIGNATURE);
    expect(kept.mediaType).toBe('image/png');
    expect(fetched.mediaType).toBe('image/jpeg');
    expect(server.images).toEqual(['b'.repeat(64)]);
  });
});
