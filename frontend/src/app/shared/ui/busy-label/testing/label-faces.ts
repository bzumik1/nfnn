export function labelFaces(element: Element | null): string[] {
  if (element === null) {
    return [];
  }
  return Array.from(element.querySelectorAll('.busy-label__face')).map((face) =>
    (face.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}
