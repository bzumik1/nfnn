import { ErrorName, errorNameOf } from '../../../core/errors/error-vocabulary';

export interface ReceiptFontFiles {
  readonly body: string;
  readonly bold: string;
  readonly heading: string;
}

export interface LoadedReceiptFonts {
  readonly body: Uint8Array;
  readonly bold: Uint8Array;
  readonly heading: Uint8Array;
}

export type ReceiptFontLoad =
  | { readonly loaded: true; readonly fonts: LoadedReceiptFonts }
  | {
      readonly loaded: false;
      readonly reason: 'tools-missing' | 'fonts';
      readonly name: ErrorName;
    };

const GONE = 404;

class ReceiptFontGone extends Error {
  override readonly name = 'NotFoundError';
}

async function font(file: string, fetchFile: typeof fetch): Promise<Uint8Array> {
  const response = await fetchFile(`/receipt-fonts/${file}`);
  if (response.status === GONE) {
    throw new ReceiptFontGone(`The receipt font ${file} is gone.`);
  }
  if (!response.ok) {
    throw new Error(`The receipt font ${file} answered ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadReceiptFonts(
  files: ReceiptFontFiles,
  fetchFile: typeof fetch = fetch,
): Promise<ReceiptFontLoad> {
  try {
    const [body, bold, heading] = await Promise.all([
      font(files.body, fetchFile),
      font(files.bold, fetchFile),
      font(files.heading, fetchFile),
    ]);
    return { loaded: true, fonts: { body, bold, heading } };
  } catch (failure: unknown) {
    return {
      loaded: false,
      reason: failure instanceof ReceiptFontGone ? 'tools-missing' : 'fonts',
      name: errorNameOf(failure),
    };
  }
}
