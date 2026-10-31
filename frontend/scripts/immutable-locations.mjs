const IMMUTABLE_RULE = 'add_header Cache-Control $immutable_cache_control always;';
const RECEIPT_FONT_LOCATION = '^/receipt-fonts/';

export function immutableLocations(conf) {
  const patterns = [...conf.matchAll(/location\s+~\*?\s+"([^"]+)"\s*\{([^{}]*)\}/g)]
    .filter((match) => match[2].split('\n').some((line) => line.trim() === IMMUTABLE_RULE))
    .map((match) => new RegExp(match[1]));
  return {
    bundles: patterns.filter((pattern) => !pattern.source.startsWith(RECEIPT_FONT_LOCATION)),
    receiptFonts: patterns.filter((pattern) => pattern.source.startsWith(RECEIPT_FONT_LOCATION)),
  };
}
