package cz.novanadeje.app.cucumber.transcript;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.task.SimpleAsyncTaskExecutor;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ApiTranscriptsTest {

    private static final String FEATURE = """
            Feature: Connected applications

              Scenario: An application connects
                When it connects

              Scenario Outline: A dangerous action stays on the web
                When the application calls <method> <path>
                Then the response status is 403

                Examples:
                  | method | path                        |
                  | DELETE | /api/admin/content/news/{id} |
                  | POST   | /api/admin/operations/restore |
            """;

    @Test
    @DisplayName("Given a row of a scenario outline, when its key is taken, then it names the row's values, so a new row does not renumber the others")
    void should_key_an_outline_row_by_its_values_when_its_key_is_taken() {
        assertThat(ApiTranscripts.scenarioKey(FEATURE, "A dangerous action stays on the web", 13))
                .isEqualTo("A dangerous action stays on the web [POST | /api/admin/operations/restore]");
    }

    @Test
    @DisplayName("Given a plain scenario, when its key is taken, then it is its name")
    void should_key_a_plain_scenario_by_its_name_when_its_key_is_taken() {
        assertThat(ApiTranscripts.scenarioKey(FEATURE, "An application connects", 3)).isEqualTo("An application connects");
    }

    @Test
    @DisplayName("Given real mail, Fio, JWT or settings secrets in the environment, when recording starts, then it is refused without naming their values")
    void should_refuse_to_record_without_naming_values_when_real_secrets_are_in_the_environment() {
        assertThatThrownBy(() -> ApiTranscripts.refuseRealSecrets(Map.of("MAIL_PASSWORD", "skutecne-heslo", "PATH", "/usr/bin")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("MAIL_PASSWORD").hasMessageNotContaining("skutecne-heslo");
        assertThatThrownBy(() -> ApiTranscripts.refuseRealSecrets(Map.of("FIO_TOKEN", "x"))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ApiTranscripts.refuseRealSecrets(Map.of("JWT_SECRET", "x"))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> ApiTranscripts.refuseRealSecrets(Map.of("SETTINGS_KEY", "x"))).isInstanceOf(IllegalStateException.class);
        assertThatCode(() -> ApiTranscripts.refuseRealSecrets(Map.of("PATH", "/usr/bin", "MAIL_HOST", ""))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given an executor that cannot report its work, when the recorder waits for asynchronous work, then it fails instead of skipping the wait")
    void should_fail_when_the_recorder_cannot_wait_for_asynchronous_work() {
        assertThatThrownBy(() -> ApiTranscriptHooks.awaitIdle(new SimpleAsyncTaskExecutor(), Duration.ofSeconds(1)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("Given transcript files left by an earlier run, when a recording run starts, then the folder is emptied, so no stale file survives")
    void should_empty_the_folder_when_a_recording_run_starts_given_files_of_an_earlier_run(@TempDir Path transcripts) throws IOException {
        Files.createDirectories(transcripts.resolve("donors"));
        Files.writeString(transcripts.resolve("donors/removed_feature.json"), "{}");

        ApiTranscripts.startRun(transcripts);

        try (Stream<Path> left = Files.walk(transcripts)) {
            assertThat(left.filter(Files::isRegularFile)).isEmpty();
        }
    }

    @Test
    @DisplayName("Given the baseline, when its source is named, then it is the tag the regeneration checks out")
    void should_name_the_tag_when_the_source_is_named() {
        assertThat(ApiTranscripts.SOURCE).isEqualTo("v2-baseline");
    }
}
