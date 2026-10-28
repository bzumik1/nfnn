package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupRun;
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
                Optional.of("nfnn-2026-10-23_0636-rucni.dump.age"), Optional.of(1590L), Optional.empty(), Optional.of("req-1"), Optional.empty(), Optional.empty()));
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
