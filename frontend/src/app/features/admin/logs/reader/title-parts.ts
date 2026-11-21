const WORD_STARTS = /(?<=[a-z0-9])(?=[A-Z])|(?<=\/)(?=.)/;

export function titleParts(title: string): string[] {
  return title.split(WORD_STARTS);
}
