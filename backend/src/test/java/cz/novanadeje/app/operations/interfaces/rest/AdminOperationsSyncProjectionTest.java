package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.backup.BackupAdministrationView;
import cz.novanadeje.app.operations.application.backup.BackupKeyView;
import cz.novanadeje.app.operations.application.backup.BackupScheduleView;
import cz.novanadeje.app.operations.application.settings.SettingView;
import cz.novanadeje.app.operations.application.settings.SettingsView;
import cz.novanadeje.app.operations.application.sync.AdminOperations;
import cz.novanadeje.app.operations.application.sync.AdminOperationsSyncSnapshot;
import cz.novanadeje.app.operations.domain.backup.BackupHealth;
import cz.novanadeje.app.operations.domain.backup.BackupRun;
import cz.novanadeje.app.operations.domain.backup.BackupSchedule;
import cz.novanadeje.app.operations.domain.backup.RunOutcome;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.shared.interfaces.rest.SyncChunk;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AdminOperationsSyncProjectionTest {

    private static final UUID SUBJECT = UUID.fromString("0192f0f1-0000-7000-8000-0000000000aa");

    private final JsonMapper json = JsonMapper.builder().build();
    private final AdminOperationsSyncProjection projection = new AdminOperationsSyncProjection(json);

    @Test
    @DisplayName("Given the settings and the backups, when they are projected, then each is one row as its page reads it, the secret only as set")
    void should_project_each_page_as_one_row_when_projected_given_settings_and_backups() {
        SettingsView settings = new SettingsView(List.of(
                new SettingView(Setting.MAIL_HOST, Optional.of("smtp.example.cz"), true, true, false),
                new SettingView(Setting.MAIL_PASSWORD, Optional.empty(), true, true, false)), true, "0123456789abcdef");
        BackupScheduleView schedule = new BackupScheduleView(BackupSchedule.DEFAULT, Optional.empty());
        BackupKeyView key = new BackupKeyView(true, false, Optional.empty());
        AdminOperations operations = new AdminOperations(settings, BackupAdministrationView.unavailable(), schedule, key);

        List<SyncChunk> chunks = projection.chunksOf(new AdminOperationsSyncSnapshot(SUBJECT, Optional.of(operations)));

        assertThat(chunks).extracting(SyncChunk::id).containsExactly("backups", "settings");
        assertThat(chunks.get(1).rows().get(0)).isEqualTo(json.valueToTree(SettingsResponse.from(settings)));
        assertThat(chunks.get(1).rows().get(0).get("settings").get(1).get("value").isNull()).isTrue();
        assertThat(chunks.get(0).rows().get(0)).isEqualTo(json.valueToTree(AdminBackupsResponse.from(BackupAdministrationView.unavailable(), schedule, key)));
    }

    @Test
    @DisplayName("Given failed runs whose error is the tool's output, when the backups are projected, then each run keeps its outcome and times without the error text, which stays online")
    void should_leave_out_every_run_error_when_projected_given_failed_runs() {
        BackupRun failed = new BackupRun(RunOutcome.FAILED, Instant.parse("2026-10-23T01:00:00Z"), Instant.parse("2026-10-23T01:00:01Z"),
                Optional.of("nfnn-2026-10-23_0300.dump.age"), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.of("pg_dump: error: connection to server failed"), Optional.empty(), Optional.empty());
        BackupAdministrationView backups = new BackupAdministrationView(true, List.of(), Optional.of(failed), Optional.of(failed), Optional.of(failed),
                List.of(), 0, false, BackupHealth.noProblems());
        BackupScheduleView schedule = new BackupScheduleView(BackupSchedule.DEFAULT, Optional.empty());
        BackupKeyView key = new BackupKeyView(true, false, Optional.empty());
        AdminOperations operations = new AdminOperations(new SettingsView(List.of(), true, "0123456789abcdef"), backups, schedule, key);

        JsonNode row = projection.chunksOf(new AdminOperationsSyncSnapshot(SUBJECT, Optional.of(operations))).getFirst().rows().get(0);

        ObjectNode expected = (ObjectNode) json.valueToTree(AdminBackupsResponse.from(backups, schedule, key));
        List.of("lastBackup", "lastTestRestore", "lastRestore").forEach(run -> {
            assertThat(expected.get(run).get("error").asString()).isEqualTo("pg_dump: error: connection to server failed");
            ((ObjectNode) expected.get(run)).putNull("error");
        });
        assertThat(row).isEqualTo(expected);
        assertThat(row.toString()).doesNotContain("pg_dump");
    }

    @Test
    @DisplayName("Given an account without the administration, when its snapshot is projected, then no chunk comes")
    void should_project_no_chunk_when_projected_given_no_administration() {
        assertThat(projection.chunksOf(new AdminOperationsSyncSnapshot(SUBJECT, Optional.empty()))).isEmpty();
    }
}
