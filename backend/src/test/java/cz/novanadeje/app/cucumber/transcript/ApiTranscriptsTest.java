package cz.novanadeje.app.cucumber.transcript;

import cz.novanadeje.app.operations.domain.settings.Setting;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.SimpleAsyncTaskExecutor;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ApiTranscriptsTest {

    private static final Pattern BOUND_SECRET = Pattern.compile("\\$\\{([A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|KEY))[:}]");

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
    @DisplayName("Given the backup key in the environment, when recording starts, then it is refused without naming its value")
    void should_refuse_to_record_when_the_backup_key_is_in_the_environment() {
        assertThatThrownBy(() -> ApiTranscripts.refuseRealSecrets(Map.of("BACKUP_KEY", "AGE-SECRET-KEY-1PLANTED")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("BACKUP_KEY").hasMessageNotContaining("PLANTED");
    }

    @Test
    @DisplayName("Given a secret under a name Spring binds by relaxed binding, an application variable or SPRING_APPLICATION_JSON, when recording starts, then it is refused")
    void should_refuse_to_record_when_a_secret_could_reach_spring_under_another_name() {
        for (String name : List.of("APP_OPERATIONS_BACKUPKEY_VALUE", "APP_SECURITY_JWT_SECRET", "APP_DONATIONS_FIO_TOKEN", "SPRING_APPLICATION_JSON",
                "SPRING_MAIL_PASSWORD", "SPRING_DATASOURCE_PASSWORD")) {
            assertThatThrownBy(() -> ApiTranscripts.refuseRealSecrets(Map.of(name, "x"))).as(name).isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining(name);
        }
        assertThatCode(() -> ApiTranscripts.refuseRealSecrets(Map.of("API_TRANSCRIPTS", "record", "SPRING_PROFILES_ACTIVE", "dev",
                "TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX", "mirror.gcr.io/"))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given every secret setting of the operations context, when one is in the environment, then recording is refused, so a new secret setting cannot be forgotten")
    void should_refuse_to_record_when_any_secret_setting_is_in_the_environment() {
        assertThat(Setting.secrets()).isNotEmpty().allSatisfy(setting ->
                assertThatThrownBy(() -> ApiTranscripts.refuseRealSecrets(Map.of(setting.name(), "x")))
                        .as(setting.name()).isInstanceOf(IllegalStateException.class).hasMessageContaining(setting.name()));
    }

    @Test
    @DisplayName("Given every environment name the backend's configuration binds to a password, token, secret or key, when one is set, then recording is refused")
    void should_refuse_to_record_when_any_secret_the_configuration_binds_is_in_the_environment() throws IOException {
        Set<String> bound = new TreeSet<>();
        try (Stream<Path> files = Files.list(Path.of("src/main/resources"))) {
            for (Path file : files.filter(path -> path.getFileName().toString().matches("application.*\\.ya?ml")).toList()) {
                BOUND_SECRET.matcher(Files.readString(file)).results().map(match -> match.group(1)).forEach(bound::add);
            }
        }

        assertThat(bound).contains("BACKUP_KEY", "JWT_SECRET", "SETTINGS_KEY", "FIO_TOKEN", "MAIL_PASSWORD").allSatisfy(name ->
                assertThatThrownBy(() -> ApiTranscripts.refuseRealSecrets(Map.of(name, "x"))).as(name).isInstanceOf(IllegalStateException.class));
    }

    @Test
    @DisplayName("Given an executor that cannot report its work, when the recorder waits for asynchronous work, then it fails instead of skipping the wait")
    void should_fail_when_the_recorder_cannot_wait_for_asynchronous_work() {
        assertThatThrownBy(() -> ApiTranscriptHooks.awaitIdle(new SimpleAsyncTaskExecutor(), Duration.ofSeconds(1)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("Given the baseline, when its source is named, then it is the tag the regeneration checks out")
    void should_name_the_tag_when_the_source_is_named() {
        assertThat(ApiTranscripts.SOURCE).isEqualTo("v2-baseline");
    }
}
