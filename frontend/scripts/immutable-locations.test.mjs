import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { immutableLocations } from './immutable-locations.mjs';

const RULE = 'add_header Cache-Control $immutable_cache_control always;';

describe('Given the nginx configuration of the frontend', () => {
  const conf = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');

  it('when its immutable locations are sorted, then the receipt fonts have one rule and the bundles one', () => {
    const { bundles, receiptFonts } = immutableLocations(conf);

    assert.equal(receiptFonts.length, 1);
    assert.equal(bundles.length, 1);
    assert.ok(receiptFonts[0].test('/receipt-fonts/body.0123456789abcdef.ttf'));
    assert.ok(bundles[0].test('/chunk-ABCDEFGH.js'));
  });
});

describe('Given immutable locations written with slashes', () => {
  const conf = `
    location ~ "^/receipt-fonts/heading\\.[0-9a-f]{16}\\.ttf$" {
        ${RULE}
    }
    location ~ "^/chunk-[A-Z]{8}\\.js$" {
        ${RULE}
    }
    location ~ "^/other\\.js$" {
        add_header Cache-Control "no-cache" always;
    }`;

  it('when they are sorted, then each lands by the text written in the configuration and an uncached one is left out', () => {
    const { bundles, receiptFonts } = immutableLocations(conf);

    assert.deepEqual(
      receiptFonts.map((pattern) => pattern.test('/receipt-fonts/heading.0123456789abcdef.ttf')),
      [true],
    );
    assert.deepEqual(
      bundles.map((pattern) => pattern.test('/chunk-ABCDEFGH.js')),
      [true],
    );
  });
});
