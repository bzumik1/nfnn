import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import type { SharedCaseLibrary } from './shared-cases';

const SHARED_CASES = fileURLToPath(new URL('../../../shared-cases/', import.meta.url));
const SCHEMAS = 'schemas/';

export default function provideSharedCases(project: TestProject): void {
  const files = readdirSync(SHARED_CASES, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith('.json'))
    .sort();
  const library: SharedCaseLibrary = {
    caseFiles: Object.fromEntries(
      files.filter((file) => !file.startsWith(SCHEMAS)).map((file) => [file, read(file)]),
    ),
    schemas: Object.fromEntries(
      files.filter((file) => file.startsWith(SCHEMAS)).map((file) => [file, read(file)]),
    ),
  };
  project.provide('sharedCases', library);
}

function read(file: string): unknown {
  return JSON.parse(readFileSync(join(SHARED_CASES, file), 'utf8'));
}
