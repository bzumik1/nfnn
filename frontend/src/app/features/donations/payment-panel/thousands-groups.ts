const GROUP_SIZE = 3;

export function* thousandsGroups(digits: string): Generator<string> {
  let start = 0;
  let end = digits.length % GROUP_SIZE || GROUP_SIZE;
  while (start < digits.length) {
    yield digits.slice(start, end);
    start = end;
    end += GROUP_SIZE;
  }
}
