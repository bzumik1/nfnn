export type Handoff = 'shared' | 'dismissed' | 'refused' | 'downloaded';

export function spaydFile(text: string): File {
  return new File([text], 'stub');
}

export function imageFile(png: Blob): File {
  return new File([png], 'stub');
}

export function deviceShares(_file: File): boolean {
  return false;
}

export async function handOver(_file: File, _title: string): Promise<Handoff> {
  return 'refused';
}
