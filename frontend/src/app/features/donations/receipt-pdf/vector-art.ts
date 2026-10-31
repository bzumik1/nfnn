export interface VectorPath {
  readonly d: string;
  readonly fill: string;
  readonly opacity: number;
}

export interface VectorArt {
  readonly viewBox: readonly [number, number, number, number];
  readonly paths: readonly VectorPath[];
}

export const MAX_VECTOR_PATHS = 2000;
export const MAX_VECTOR_BYTES = 256 * 1024;

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/;
const PATH_START = /^\s*[Mm]/;
const HEX_COLOUR = /^#[0-9a-f]{6}$/;

function refused(reason: string): never {
  throw new Error(`The vector signature is refused: ${reason}.`);
}

function exactKeys(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refused(`${what} is not an object`);
  }
  const own = Object.keys(value);
  if (own.length !== keys.length || !keys.every((key) => own.includes(key))) {
    refused(`${what} has the fields ${own.join(', ')}`);
  }
  return value as Record<string, unknown>;
}

function viewBoxOf(value: unknown): VectorArt['viewBox'] {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((part) => typeof part === 'number' && Number.isFinite(part))
  ) {
    refused('the view box is not four numbers');
  }
  const [x, y, width, height] = value as number[];
  if (width <= 0 || height <= 0) {
    refused('the view box has no area');
  }
  return [x, y, width, height];
}

function pathOf(value: unknown): VectorPath {
  const path = exactKeys(value, ['d', 'fill', 'opacity'], 'a path');
  const { d, fill, opacity } = path;
  if (typeof d !== 'string' || !PATH_DATA.test(d) || !PATH_START.test(d)) {
    refused('a path has data outside the canonical commands');
  }
  if (typeof fill !== 'string' || !HEX_COLOUR.test(fill)) {
    refused('a path has no six-digit hex fill');
  }
  if (typeof opacity !== 'number' || !(opacity >= 0 && opacity <= 1)) {
    refused('a path has an opacity outside 0 to 1');
  }
  return { d, fill, opacity };
}

export function parseVectorArt(json: string): VectorArt {
  if (json.length > MAX_VECTOR_BYTES) {
    refused('it is larger than a signature ever is');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    refused('it is not JSON');
  }
  const art = exactKeys(parsed, ['viewBox', 'paths'], 'the art');
  const { paths } = art;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_VECTOR_PATHS) {
    refused(`it has no paths or more than ${MAX_VECTOR_PATHS}`);
  }
  return { viewBox: viewBoxOf(art['viewBox']), paths: paths.map(pathOf) };
}
