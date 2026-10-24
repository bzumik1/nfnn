package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.shared.domain.EmailAddress;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.List;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaReportSettingsRepositoryTest {

    private static final String INSERT = "insert into donation_report_settings (id, recipients, send_day, include_donors, include_donations,"
            + " include_unpaired_payments, include_bank_import, updated_at) values (?, 'info@nfnn.cz', ?, ?, true, true, true, now())";
    private static final ReportSettings CHANGED = new ReportSettings(ReportRecipients.parse(List.of("pavel@example.cz", "jakub@example.cz")), 5, 9,
            new ReportSections(true, false, true, false));

    @Autowired
    private ReportSettingsRepository settings;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given nothing saved, when the settings are read, then the configured recipient gets every section on the 1st and nothing was changed yet")
    void should_answer_defaults_when_read_given_nothing_saved() {
        assertThat(settings.current()).isEqualTo(ReportSettings.defaults(new EmailAddress("info@nfnn.cz")));
        assertThat(settings.lastChangedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given changed settings saved, when they are read, then the recipients, the day and the sections come back with the time of the change")
    void should_round_trip_when_saved_given_changed_settings() {
        settings.save(CHANGED, NOW);
        flushAndClear();

        assertThat(settings.current()).isEqualTo(CHANGED);
        assertThat(settings.lastChangedAt()).contains(NOW);
        assertThat(jdbc.sql("select recipients from donation_report_settings").query(String.class).single()).isEqualTo("pavel@example.cz,jakub@example.cz");
    }

    @Test
    @DisplayName("Given settings saved, when they are saved again, then the one row is replaced")
    void should_replace_row_when_saved_given_earlier_settings() {
        settings.save(CHANGED, NOW);
        flushAndClear();

        settings.save(ReportSettings.defaults(new EmailAddress("pavel@example.cz")), NOW.plusSeconds(60));
        flushAndClear();

        assertThat(jdbc.sql("select count(*) from donation_report_settings").query(Long.class).single()).isEqualTo(1);
        assertThat(settings.current().sendDay()).isEqualTo(1);
        assertThat(settings.lastChangedAt()).contains(NOW.plusSeconds(60));
    }

    @Test
    @DisplayName("Given the schema, when a second row is inserted, then the singleton constraint refuses it")
    void should_refuse_when_inserted_given_second_row() {
        assertThatThrownBy(() -> jdbc.sql(INSERT).params(2, 1, true).update()).hasMessageContaining("ck_donation_report_settings_singleton");
    }

    @Test
    @DisplayName("Given the schema, when a send day outside 1–28 is inserted, then the day constraint refuses it")
    void should_refuse_when_inserted_given_day_outside_every_month() {
        assertThatThrownBy(() -> jdbc.sql(INSERT).params(1, 29, true).update()).hasMessageContaining("ck_donation_report_settings_send_day");
    }

    @Test
    @DisplayName("Given the schema, when settings without any section are inserted, then the section constraint refuses it")
    void should_refuse_when_inserted_given_no_section() {
        assertThatThrownBy(() -> jdbc.sql(INSERT.replace("true, true, true", "false, false, false")).params(1, 1, false).update())
                .hasMessageContaining("ck_donation_report_settings_section");
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
