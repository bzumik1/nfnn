package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.RestoreCarryForward;
import cz.novanadeje.app.operations.domain.backup.RestoreRevocations;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class StatusFilesTest {

    @Test
    @DisplayName("Given a status file of a successful requested backup, when parsed, then every field is read")
    void should_read_every_field_when_parsed_given_a_successful_backup() {
        Optional<BackupRun> run = StatusFiles.parse("""
                outcome=ok
                started_at=2026-10-23T04:36:41Z
                finished_at=2026-10-23T04:36:43Z
                file=nfnn-2026-10-23_0636-rucni.dump.age
                size=1590
                request=req-1
                """);

        assertThat(run).contains(new BackupRun(RunOutcome.OK, Instant.parse("2026-10-23T04:36:41Z"), Instant.parse("2026-10-23T04:36:43Z"),
                Optional.of("nfnn-2026-10-23_0636-rucni.dump.age"), Optional.of(1590L), Optional.empty(), Optional.of("req-1"), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty()));
    }

    @Test
    @DisplayName("Given a status file of a failed test restore with an empty request line, when parsed, then the error is read and the request is absent")
    void should_read_error_when_parsed_given_a_failed_test_restore() {
        Optional<BackupRun> run = StatusFiles.parse("""
                outcome=failed
                started_at=2026-10-23T04:33:33Z
                finished_at=2026-10-23T04:33:33Z
                file=nfnn-2026-10-23_0633-rucni.dump.age
                request=
                error=pg_restore: error: could not execute query: ERROR:  relation "x" already exists
                """);

        assertThat(run).hasValueSatisfying(parsed -> {
            assertThat(parsed.outcome()).isEqualTo(RunOutcome.FAILED);
            assertThat(parsed.requestId()).isEmpty();
            assertThat(parsed.tables()).isEmpty();
            assertThat(parsed.error()).contains("pg_restore: error: could not execute query: ERROR:  relation \"x\" already exists");
        });
    }

    @Test
    @DisplayName("Given the status file of a restore asked for by an administrator, when parsed, then the administrator is read")
    void should_read_the_administrator_when_parsed_given_a_requested_restore() {
        Optional<BackupRun> run = StatusFiles.parse("""
                outcome=ok
                started_at=2026-10-23T19:20:12Z
                finished_at=2026-10-23T19:20:13Z
                file=nfnn-2026-10-22_0300.dump.age
                tables=37
                request=019a1b2c-0000-7000-8000-000000000001
                admin=019a1b2c-0000-7000-8000-00000000000a
                """);

        assertThat(run).hasValueSatisfying(parsed -> {
            assertThat(parsed.requestId()).contains("019a1b2c-0000-7000-8000-000000000001");
            assertThat(parsed.requestedBy()).contains(UUID.fromString("019a1b2c-0000-7000-8000-00000000000a"));
        });
    }

    @Test
    @DisplayName("Given the status file of a restore that ended the sessions and spent the one-time secrets of the backup, when parsed, then both counts are read")
    void should_read_the_revocations_when_parsed_given_a_restore_that_revoked() {
        Optional<BackupRun> run = StatusFiles.parse("""
                outcome=ok
                started_at=2026-11-05T17:20:12Z
                finished_at=2026-11-05T17:20:13Z
                file=nfnn-2026-11-05_0300.dump.age
                tables=58
                sessions_ended=2
                one_time_secrets_spent=3
                request=019a1b2c-0000-7000-8000-000000000001
                admin=019a1b2c-0000-7000-8000-00000000000a
                """);

        assertThat(run).hasValueSatisfying(parsed -> assertThat(parsed.revocations()).contains(new RestoreRevocations(2, 3)));
    }

    @Test
    @DisplayName("Given the status file of a restore that carried erasures, credentials, roles and audit entries forward and moved the receipt numbers, when parsed, then every count is read")
    void should_read_what_was_carried_forward_when_parsed_given_a_restore_that_carried_it() {
        Optional<BackupRun> run = StatusFiles.parse("""
                outcome=ok
                started_at=2026-11-06T17:20:12Z
                finished_at=2026-11-06T17:20:13Z
                file=nfnn-2026-11-06_0300.dump.age
                tables=58
                sessions_ended=2
                one_time_secrets_spent=3
                erasures_carried=1
                credentials_carried=2
                roles_carried=0
                admin_actions_carried=5
                receipt_numbers_skipped=1000
                request=019a1b2c-0000-7000-8000-000000000001
                admin=019a1b2c-0000-7000-8000-00000000000a
                """);

        assertThat(run).hasValueSatisfying(parsed -> assertThat(parsed.carriedForward()).contains(new RestoreCarryForward(1, 2, 0, 5, 1000)));
    }

    @Test
    @DisplayName("Given a restore status file that misses one of the carried counts or holds one that is no number, when parsed, then the restore is read without what was carried forward")
    void should_read_nothing_carried_forward_when_parsed_given_a_missing_or_unreadable_count() {
        String restored = "outcome=ok\nstarted_at=2026-11-06T17:20:12Z\nfinished_at=2026-11-06T17:20:13Z\ntables=58\n";
        String carried = "erasures_carried=1\ncredentials_carried=2\nroles_carried=0\nadmin_actions_carried=5\n";

        assertThat(StatusFiles.parse(restored + carried)).hasValueSatisfying(parsed -> assertThat(parsed.carriedForward()).isEmpty());
        assertThat(StatusFiles.parse(restored + carried + "receipt_numbers_skipped=x\n"))
                .hasValueSatisfying(parsed -> assertThat(parsed.carriedForward()).isEmpty());
        assertThat(StatusFiles.parse(restored + carried.replace("roles_carried=0", "roles_carried=-1") + "receipt_numbers_skipped=0\n"))
                .hasValueSatisfying(parsed -> assertThat(parsed.carriedForward()).isEmpty());
    }

    @Test
    @DisplayName("Given a restore status file with only one of the counts or a count that is no number, when parsed, then the restore is read without revocations")
    void should_read_no_revocations_when_parsed_given_a_missing_or_unreadable_count() {
        String restored = "outcome=ok\nstarted_at=2026-11-05T17:20:12Z\nfinished_at=2026-11-05T17:20:13Z\ntables=58\n";

        assertThat(StatusFiles.parse(restored + "sessions_ended=2\n")).hasValueSatisfying(parsed -> assertThat(parsed.revocations()).isEmpty());
        assertThat(StatusFiles.parse(restored + "sessions_ended=2\none_time_secrets_spent=99999999999\n"))
                .hasValueSatisfying(parsed -> assertThat(parsed.revocations()).isEmpty());
        assertThat(StatusFiles.parse(restored + "sessions_ended=-1\none_time_secrets_spent=3\n"))
                .hasValueSatisfying(parsed -> assertThat(parsed.revocations()).isEmpty());
    }

    @Test
    @DisplayName("Given a restore status file with an empty administrator line, when parsed, then nobody asked for it")
    void should_read_no_administrator_when_parsed_given_an_empty_admin_line() {
        Optional<BackupRun> run = StatusFiles.parse("outcome=failed\nstarted_at=2026-10-23T19:20:12Z\nfinished_at=2026-10-23T19:20:13Z\nadmin=\nerror=x\n");

        assertThat(run).hasValueSatisfying(parsed -> assertThat(parsed.requestedBy()).isEmpty());
    }

    @Test
    @DisplayName("Given a status file with a table count, when parsed, then the count is a number")
    void should_read_tables_when_parsed_given_a_test_restore() {
        Optional<BackupRun> run = StatusFiles.parse("outcome=ok\nstarted_at=2026-10-23T04:36:51Z\nfinished_at=2026-10-23T04:36:51Z\ntables=37\n");

        assertThat(run).hasValueSatisfying(parsed -> assertThat(parsed.tables()).contains(37));
    }

    @Test
    @DisplayName("Given an empty or half-written file, when parsed, then there is no run")
    void should_be_empty_when_parsed_given_no_content() {
        assertThat(StatusFiles.parse("")).isEmpty();
        assertThat(StatusFiles.parse("\n\n")).isEmpty();
    }
}
