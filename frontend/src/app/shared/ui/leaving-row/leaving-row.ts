export function neighbourAfterRowLeaves(
  row: Element | null,
  controls: Iterable<HTMLElement>,
): () => HTMLElement | null {
  return () => (row === null ? (Array.from(controls)[0] ?? null) : null);
}
