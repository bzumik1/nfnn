---
paths:
  - "shared-cases/**"
  - "backend/src/test/**"
  - "frontend/src/testing/**"
  - "frontend/src/**/*.spec.ts"
  - "frontend/e2e/**"
  - "regression/v2/changes/**"
---
# Testing rules: logic on both sides

The general rules (TDD, given/when/then naming) are in `testing.md`. Which files exist, which runner on each side reads them, and how the runners and the sync tests work: `docs/system-overview.md` "Shared cases (logic on both sides)".

## Logic on both sides
- A computation the backend and the frontend both perform (local first, `backend.md`) is specified once as shared cases, inputs and expected outputs in one data file, and both suites run every case (Jakub 2026-10-28). A case is read from its file, never copied (`sharedcases/SharedCaseFilesTest` refuses a copy of a case file, of a case's expected value or of its QR matrix outside `shared-cases/`; e2e reads its payment QR matrices from `qr/payment.json`).
- The case files are the living specification, changed by hand. A PR that changes what one of them gives changes its cases first, in the same PR as the computation: its first commit edits the cases (and the schema, when the shape changes) and sets the file's `source` from `v2-baseline` to `edited`, the runners fail on exactly the cases that change, and the next commits change the computation on each side until both suites pass. Rewriting a case to match code that was not meant to change, or without the computation change it describes, is refused in review.
- The PR declares every case file and schema it changes in its `regression/v2/changes/<slice-or-PR>.json` as `{"kind": "shared-case", "caseFile": "shared-cases/…", "reason", "contract"}` (`*` allowed after the literal `shared-cases/`); `compare-v2.mjs --changed` fails otherwise, and an older declaration never covers a later PR.
- A runner compares the whole value (`SharedCaseRunner.assertGives`), so a field the computation gains or loses fails until the cases carry it, and a new field also fails the schema until the schema names it. The case file's diff is the reviewed statement of the new behaviour.
- Files: `shared-cases/<topic>/<name>.json`, `{source, logic, cases: [{name, input, expected}]}`, names unique in the file, each with its JSON Schema (draft 2020-12) `shared-cases/schemas/<topic>/<name>.schema.json` (shared parts in `schemas/defs/`). A new file comes with its schema, is registered in `SharedCaseTopics` (`src/testing/shared-cases.ts`) and gets its row in the overview's table; Vitest validates every file against its schema (the backend takes no schema library, plan decision 6), and `SharedCaseFilesTest` checks the envelope and that every file has its schema and every schema its file.
- A file holds one computation, so each side runs the whole value of every case: one that two sides compute in different slices, or only one side computes, is split where they part, and the parts chain by case name (`payment/spayd.json` → `qr/payment.json`, `totp/uri.json` → `qr/totp.json`; `shared-cases.spec.ts` fails when a value and its QR case part).
- A runner lives beside the code it calls, in that context's test package; `sharedcases/` holds only the infrastructure (`architecture/SharedCaseRulesTest`). A backend runner extends `SharedCaseRunner` (over donation rows `donations/DonationRowsSharedCaseRunner`, so a fork starts one context for all of them), writes a case's rows with `sharedcases/CaseRows.fromJson` and asks the real endpoint or service, so the queries run too. A case over database rows names only the columns the computation reads.
- In the frontend a spec gets a file's cases from `sharedCases(file)` and runs each as `describe('Given the shared case <name>')`; the cases are deep-frozen and shared, so a spec that edits one for a negative test clones it first; a watch run reads the files once, so restart it after editing a case.
- `receipts/v1/frozen.json` is written by nothing and changes only by hand; its cases name a recorded text set (`ReceiptTextsHistoryTest`), so a text change records a new set and leaves the cases as they are, and a new schema version is a new file beside it, never a rewrite.
- On `main` a case file changes only by hand; the v2 generators exist only at the baseline commit, where a v2 file is re-recorded (`testing-regression.md`).
