import { writeFileSync } from 'node:fs';
import { ERROR_VOCABULARY } from '../src/app/core/errors/error-vocabulary.ts';

const target = new URL('../src/app/core/errors/error-vocabulary.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(ERROR_VOCABULARY, null, 2)}\n`);
console.log(`Wrote ${target.pathname}`);
