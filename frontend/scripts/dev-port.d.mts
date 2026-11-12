export declare const CI_PORT: number;

export declare const DERIVED_PORT_RANGE: { first: number; last: number };

export declare function devPort(options: {
  root: string;
  env?: Record<string, string | undefined>;
}): number;

export declare function checkoutMarkerPath(root: string): string;
