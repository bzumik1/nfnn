const IMMUTABLE_RULE = 'add_header Cache-Control $immutable_cache_control always;';
const RECEIPT_FONT_LOCATION = '^/receipt-fonts/';

export function immutableLocations(conf) {
  const written = [...conf.matchAll(/location\s+~\*?\s+"([^"]+)"\s*\{([^{}]*)\}/g)]
    .filter((match) => match[2].split('\n').some((line) => line.trim() === IMMUTABLE_RULE))
    .map((match) => match[1]);
  const patterns = (texts) => texts.map((text) => new RegExp(text));
  return {
    bundles: patterns(written.filter((text) => !text.startsWith(RECEIPT_FONT_LOCATION))),
    receiptFonts: patterns(written.filter((text) => text.startsWith(RECEIPT_FONT_LOCATION))),
  };
}
