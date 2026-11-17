export interface TextPart {
  readonly text: string;
  readonly fileName: boolean;
}

export function fileNameParts(
  text: string,
  fileName: string | null | undefined,
): readonly TextPart[] {
  const at = fileName ? text.indexOf(fileName) : -1;
  if (!fileName || at < 0) {
    return [{ text, fileName: false }];
  }
  const parts: TextPart[] = [
    { text: text.slice(0, at), fileName: false },
    { text: fileName, fileName: true },
    { text: text.slice(at + fileName.length), fileName: false },
  ];
  return parts.filter((part) => part.text !== '');
}
