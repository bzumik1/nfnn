---
paths:
  - "backend/src/main/resources/db/**"
  - "backend/src/main/resources/application*.yml"
  - "backend/src/main/java/**/infrastructure/persistence/**"
  - "backend/src/main/java/**/infrastructure/lock/**"
  - "backend/src/main/java/**/infrastructure/audit/**"
  - "backend/src/main/java/**/domain/**/*Repository.java"
  - "backend/src/test/java/**/infrastructure/persistence/**"
  - "backend/src/test/java/**/shared/infrastructure/schema/**"
  - "backend/src/test/java/**/*Concurrency*Test.java"
  - "backend/src/test/java/**/support/DatabaseCleaner*.java"
  - "backend/src/test/resources/migrations/**"
  - "deploy/postgres/**"
  - "deploy/backup/**"
---
# Database rules (database audit 2026-11-06, #470)

What a change to the schema, a query, a lock, a transaction or the datasource must keep true. It adds to `backend.md` (Application, Persistence), `reliability.md` (retry-safe writes, "Every database wait ends") and `security.md` (Logs), which still hold; the lock order and the session limits are explained in `docs/system-overview.md` (donors, "Writes to the donor row"; donations, pairing; shared, "Database sessions" and "Schema migrations and the audit trail").

## Writes and locks
- Read-modify-write of an aggregate takes its row lock first and holds it to the commit: the entities carry no `@Version`, and Hibernate's UPDATE writes every updatable column, so a writer that read without a lock writes the values it read back over a concurrent commit (#447: a profile save restored an old password hash and undid an erasure). Use a `findByIdForUpdate` finder (`@Lock(PESSIMISTIC_WRITE)`, `DonorRepository.findByIdForUpdate`, `ProjectJpaRepository`); it is `for no key update` on PostgreSQL, so inserting a child row (`for key share` on the parent) never waits for it. A check that counts sibling rows before acting (the last passkey, at most 10 passkeys, one open recovery) runs under the same lock, or two tabs both pass it.
- A column that only a conditional update may change is mapped `updatable = false` (`donor_device.ended_at`, `end_reason`; generated columns also `insertable = false`), so saving an entity read earlier cannot undo it.
- A single-use secret, counter or step is spent by a conditional UPDATE whose row count is checked (`markUsed … where used_at is null` returns `boolean`, `SecondFactorRepository.recordUse` only moves the step forward, #441), never by load, change and save; a readable code is cleared in the same update (`code = null` on the recovery, #485).
- Locks are taken in the documented order (donor row, then challenges, passkeys and second factor, then the donor's sessions lock, refresh tokens and devices, then the donations listeners' pairing lock and `donor_record`; pairing lock before `donor_record` in donations). A new lock or a new path takes its place in that order and `docs/system-overview.md` names it in the same PR; a path that cannot follow it is named there as an exception with what it risks (the second-factor recovery by payment). Several rows of one kind are locked in id order (`lockAllOfInIdOrder`, `lockSpentBeforeInIdOrder`), and a sweep that would otherwise lock them in scan order deadlocks against it (#453, `40P01`).
- Advisory locks only as constants of `shared/infrastructure/lock/AdvisoryLock` with a key of their own (`AdvisoryLockTest` refuses a shared key, `AdvisoryLockRulesTest` any `pg_advisory` outside it; never "today's date" picked in two branches, #452). The one-part form serializes a whole kind of write (`PAIRING`); the two-part form `acquireFor(entityManager, subject)` scopes it to a subject (`DONOR_SESSIONS` per donor) or to a row that does not exist yet (`DONOR_EMAIL_ADDRESSES` per address, #450), whose key must fit an `int`. A session-level lock (`SCHEMA_MIGRATION`) is only tried, on a connection that is never pooled.
- A race on a unique key is serialized before the insert, so the loser answers as the winner's repeat (a double registration is 202 twice, a second confirmation of one address the existing 400), never a 500 from the constraint. `on conflict … do nothing` where a duplicate means "already done" (`MonthlyReportJpaRepository`, `PushKeyJpaRepository`).
- A sweep that deletes rows others may be about to reference first locks its candidates `for update skip locked` and deletes those still unused in a second statement; every writer that links to such a row takes it `for key share` before its existence check (`MediaImageRepository.lockForUse`), so neither fails on the foreign key (#456). Deleting rows a running use case may hold (the erasure's challenges, recoveries and codes) uses `skip locked` too (`deleteAllOfWithoutWaiting`) and leaves them to the nightly cleanup instead of closing a cycle.
- Hibernate flushes inserts before deletes, so replacing a row under a unique key updates the leftover row instead of delete-then-insert (`JpaFormerSlugs`, #457).
- An adapter that runs its own locking SQL is a `@Repository`, so its failure is translated to Spring's exceptions that `ServerBusyHandler` answers with 503 `server-busy` (`PostgresPairingLock`, #449).

## Connections and waits
- The limits of `reliability.md` ("Every database wait ends") bind only the backend's pooled sessions, through pgjdbc `options` in `spring.datasource.hikari.data-source-properties`: never `ALTER ROLE` or a server setting, which a restore as `novanadeje_app` would inherit; Liquibase keeps its own connection (`MigrationDataSourceConfiguration`). `DatabaseWaitLimitsTest` reads them; a new datasource or connection sets the same `options` and `logServerErrorDetail=false`.
- No connection is held across work that needs none (BCrypt, a network call, image decoding): split into short transactions as `DonorAuthenticationService.login` does, which reads again and checks the row is unchanged before it writes. Each `REQUIRES_NEW` under a caller's transaction is one more connection; count them (#449: a registration held three).

## Reading
- No query per row: load the related rows of a page or a list by their ids in one query and group them in Java (`PasskeyRepository.countByDonors`, `findByDonorIdInOrderByCreatedAtAscIdAsc`), `@BatchSize` on a collection read per row (`DonorJpaEntity.roles`), never `join fetch` with paging (Hibernate pages in memory, HHH90003004). A test with Hibernate statistics proves a page of many takes as many statements as a page of one (`DonorAdministrationSearchStatementsTest`, #465).
- Select only what is served: one photo variant, not the whole entity with every size (`findVariantAtLeast`, #456); never `bytea` or a frozen JSON document for a list or a sync. A summary a hot read needs from a large document is a stored generated column (`issued_receipt.gift_count`, `total_amount_minor`, `certified_year`, `donations/027`), which PostgreSQL fills for the previous image too; reading it with JSON functions at query time was slower than parsing in Java (#489).
- On a hot path read rows through a JPQL constructor expression into a record (`IssuedReceiptSummaryRow`, `AdminActionSummaryRow`), not a Spring Data interface projection, whose per-row proxies took a third of the sync manifest's time (#489).
- A large set loaded as entities inside a transaction that then runs more queries is mapped and detached (`JpaBankPaymentRepository.findUnpairedOrderedByBooking`), because every auto-flush dirty-checks every managed entity: 28 s per import under the pairing lock before, 1.3 s after (#451).
- Several queries that must agree run in one `@Transactional(readOnly = true, isolation = REPEATABLE_READ)` snapshot (the sync services).
- A cursor page over a column that can repeat continues from the last row's sort key and id, `(performed_at, id) < (:before, :beforeId)`, with an index on exactly those columns (`ix_admin_action_performed_at_id`), or rows sharing a value are skipped (#458).

## Schema and migrations
- `backend.md` Persistence says what the previous image survives. Hibernate's `validate` checks tables and column types, not keys, indexes or extra columns. When the new code can write a state the previous image misreads, prove it (run the previous adapter against the migrated schema in a throwaway test), and name the residual risk, what triggers it and how to clear it in the PR and in `deploy/README.md` "Návrat na předchozí verzi" (#479, `content/016`).
- Before adding or dropping an index, `EXPLAIN` the queries it serves on a schema migrated by the master changelog and loaded with realistic volumes, and put the plans in the PR (#486, #492). No plain index repeats the leading columns of another (`UnusedIndexTest`), every foreign key leads one (`ForeignKeyIndexTest`). A drop carries an `indexExists` precondition with `onFail="MARK_RAN"`.
- The changeset number is the next free one in its folder counting the open PRs (`gh pr list`, their `db/changelog/` files), so two branches never take one number (#479 moved from 014 to 016).
- A data changeset that rewrites rows gets a migration test from a changelog just before it (`ReportRecipientCountsMigrationTest`, `migrations/before-report-recipient-counts-changelog.xml`); it may rewrite `admin_action` only because Liquibase holds `SCHEMA_MIGRATION` (`AdminActionMigrationTest`).

## Data that comes and goes
- Text from outside is normalised before it is stored: PostgreSQL refuses U+0000 in `varchar` and `text`, and one bad bank movement rolled back every hourly import (`BankTexts` drops control characters but tab, line feed and carriage return, #464).
- A table of one-time secrets or sessions gets, in the same PR, a cleanup of spent and expired rows (`DonorSessionCleanupService`, #454), a delete in the erasure (`DonorErasureService`) and its line in `deploy/backup/revoke-restored-credentials.sql` or its reasoned exception (`RestoreRevocationSqlTest`).
- Constraint violations keep their values out of every log: `logServerErrorDetail: false` on every connection (`ConstraintViolationLogTest` plants a canary), and the database's own log is terse (`deploy/postgres/Dockerfile`, the stack probe, `deploy-ci.md`). `admin_action.details` is kept for good: counts and ids, never an e-mail address (#458).

## Operating the database
- `deploy-ci.md` and `deploy/README.md` "Databáze" hold the server side: site data are queried as `novanadeje_app`, never as the superuser, whose `search_path` is `pg_catalog` (#460); new clusters have data checksums; `MigrationLockService` releases a changelog lock a dead backend left, so it is never deleted by hand; a PostgreSQL major is a deliberate PR with the dump and restore of "Nová hlavní verze PostgreSQL", never a Dependabot bump.

## Testing database changes
- A race is proved with two real transactions against PostgreSQL (`@IntegrationTest`, `TransactionTemplate`, an executor and latches): hold the first after its write, start the second, release once `pg_stat_activity` shows a backend with `wait_event_type = 'Lock'`, and assert the end state (`DonorRowLockConcurrencyTest`, `DonorEmailClaimConcurrencyTest`, `DonorSessionLockOrderTest`, `MediaUseDuringCleanupConcurrencyTest`). It fails on the code before the fix with the error the issue names (the old value back, `DataIntegrityViolationException`, `CannotAcquireLockException: deadlock detected`). Unit tests with mocks prove only the order of the lock calls.
- A timed budget asserts the fastest of several runs after warm-up and its message leads with the measured times (`UnpairedBacklogPairingTest`, `AdminDeviceSyncTest`), and its data hold what makes the path slow (#489 added the receipts the manifest test lacked).
