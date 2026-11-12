import { readFileSync, statSync } from 'node:fs';
import { importTs } from './ts-import.mjs';

const LARGEST_FILE_BYTES = 64 * 1024;
const REFUSED = 'Not a diagnostic file of nfnn.cz.';

const { DIAGNOSTICS_FORMAT, sanitizedDiagnostics } = await importTs(
  '../src/app/core/diagnostics/diagnostics-schema.ts',
);

function received(path) {
  if (path === undefined || statSync(path).size > LARGEST_FILE_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed?.format === DIAGNOSTICS_FORMAT ? parsed : null;
  } catch {
    return null;
  }
}

const file = received(process.argv[2]);
if (file === null) {
  console.error(REFUSED);
  process.exit(1);
}
console.log(JSON.stringify(sanitizedDiagnostics(file), null, 2));
