package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.operations.domain.settings.Setting;
import cz.novanadeje.app.operations.domain.settings.SettingsRepository;
import cz.novanadeje.app.operations.domain.settings.SetupStateRepository;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaSettingsRepository.class, JpaSetupStateRepository.class})
class JpaSettingsRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T16:00:00Z");

    @Autowired
    private SettingsRepository settings;

    @Autowired
    private SetupStateRepository setup;

    @Test
    @DisplayName("Given plain and sealed settings saved, when read, changed and one deleted, then the rows round-trip and the deletion sticks")
    void should_round_trip_when_saved_given_plain_and_sealed_settings() {
        StoredSetting host = new StoredSetting(Setting.MAIL_HOST, "smtp-relay.brevo.com", false, NOW);
        StoredSetting token = new StoredSetting(Setting.FIO_TOKEN, "v1:" + "A".repeat(2700), true, NOW);

        settings.save(host);
        settings.save(token);
        settings.save(new StoredSetting(Setting.MAIL_HOST, "smtp.example.cz", false, NOW.plusSeconds(60)));

        assertThat(settings.findAll()).containsExactlyInAnyOrder(new StoredSetting(Setting.MAIL_HOST, "smtp.example.cz", false, NOW.plusSeconds(60)), token);

        settings.delete(Setting.FIO_TOKEN);
        settings.delete(Setting.MAIL_PASSWORD);

        assertThat(settings.findAll()).extracting(StoredSetting::setting).containsExactly(Setting.MAIL_HOST);
    }

    @Test
    @DisplayName("Given no setup yet, when it is completed, then it reads as completed")
    void should_read_completed_when_marked_given_no_setup() {
        assertThat(setup.isCompleted()).isFalse();

        setup.markCompleted(NOW);

        assertThat(setup.isCompleted()).isTrue();
    }
}
