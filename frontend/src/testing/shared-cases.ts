import Ajv2020, { type AnySchemaObject } from 'ajv/dist/2020';
import { inject } from 'vitest';

export interface SharedCase<Input, Expected> {
  readonly name: string;
  readonly input: Input;
  readonly expected: Expected;
}

export interface SharedCaseFile<Input, Expected> {
  readonly source: string;
  readonly logic: string;
  readonly cases: readonly SharedCase<Input, Expected>[];
}

export interface SharedCaseLibrary {
  readonly caseFiles: Readonly<Record<string, unknown>>;
  readonly schemas: Readonly<Record<string, AnySchemaObject>>;
}

declare module 'vitest' {
  interface ProvidedContext {
    sharedCases: SharedCaseLibrary;
  }
}

const SCHEMA_ID_PREFIX = 'https://nfnn.cz/shared-cases/';
const SCHEMAS = 'schemas/';
const DEFINITIONS = `${SCHEMAS}defs/`;

let validator: Ajv2020 | undefined;

export function sharedCaseFiles(): readonly string[] {
  return Object.keys(inject('sharedCases').caseFiles).sort();
}

export function topicSchemas(): readonly string[] {
  return Object.keys(inject('sharedCases').schemas)
    .filter((schema) => !schema.startsWith(DEFINITIONS))
    .sort();
}

export function schemaOf(caseFile: string): string {
  return `${SCHEMAS}${caseFile.replace(/\.json$/, '.schema.json')}`;
}

export function sharedCaseContent(caseFile: string): unknown {
  return inject('sharedCases').caseFiles[caseFile];
}

export function schemaViolations(caseFile: string, content: unknown): readonly string[] {
  const validate = schemas().getSchema(SCHEMA_ID_PREFIX + schemaOf(caseFile));
  if (validate === undefined) {
    return [`${schemaOf(caseFile)} is missing`];
  }
  return validate(content)
    ? []
    : (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`);
}

export function sharedCases<Input, Expected>(
  caseFile: string,
): readonly SharedCase<Input, Expected>[] {
  const content = sharedCaseContent(caseFile);
  const violations = schemaViolations(caseFile, content);
  if (violations.length > 0) {
    throw new Error(`${caseFile} does not match ${schemaOf(caseFile)}: ${violations.join('; ')}`);
  }
  return (content as SharedCaseFile<Input, Expected>).cases;
}

function schemas(): Ajv2020 {
  if (validator === undefined) {
    validator = new Ajv2020({ allErrors: true, allowUnionTypes: true });
    for (const schema of Object.values(inject('sharedCases').schemas)) {
      validator.addSchema(schema);
    }
  }
  return validator;
}
