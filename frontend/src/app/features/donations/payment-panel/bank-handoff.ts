import { saveBlob } from '../file-download';

export type Handoff = 'shared' | 'dismissed' | 'refused' | 'opened' | 'downloaded';

const SPAYD_FILE_NAME = 'platba.spayd';
export const SPAYD_MEDIA_TYPE = 'application/x-shortpaymentdescriptor';
export const IMAGE_FILE_NAME = 'qr-platba-nova-nadeje.png';
const IMAGE_MEDIA_TYPE = 'image/png';

export function spaydFile(text: string): File {
  return new File([text], SPAYD_FILE_NAME, { type: SPAYD_MEDIA_TYPE });
}

export function imageFile(png: Blob): File {
  return new File([png], IMAGE_FILE_NAME, { type: IMAGE_MEDIA_TYPE });
}

export function sharesPaymentFiles(): boolean {
  return deviceShares(spaydFile(''));
}

export function sharesImages(): boolean {
  return deviceShares(imageFile(new Blob([], { type: IMAGE_MEDIA_TYPE })));
}

export async function handOver(
  file: File,
  title: string,
  openLocally: () => Promise<Handoff | null> = () => Promise.resolve(null),
): Promise<Handoff> {
  if (!deviceShares(file)) {
    const local = await openLocally();
    if (local !== null) {
      return local;
    }
    saveBlob({ blob: file, fileName: file.name });
    return 'downloaded';
  }
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (failure) {
    return failure instanceof DOMException && failure.name === 'AbortError'
      ? 'dismissed'
      : 'refused';
  }
}

function deviceShares(file: File): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}
