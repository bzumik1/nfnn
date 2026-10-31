export interface VectorPath {
  readonly d: string;
  readonly fill: string;
  readonly opacity: number;
}

export interface VectorArt {
  readonly viewBox: readonly [number, number, number, number];
  readonly paths: readonly VectorPath[];
}

export function parseVectorArt(json: string): VectorArt {
  throw new Error(`not implemented ${json.length}`);
}
