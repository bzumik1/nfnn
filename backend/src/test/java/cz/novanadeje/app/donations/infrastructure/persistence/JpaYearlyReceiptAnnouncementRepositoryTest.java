package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptAnnouncementRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.time.Year;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaYearlyReceiptAnnouncementRepositoryTest {

    private static final Instant NOW = Instant.parse("2027-01-02T09:00:00Z");

    @Autowired
    private YearlyReceiptAnnouncementRepository announcements;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given a year not announced yet, when it is marked twice, then only the first marking counts and the year keeps its first time")
    void should_mark_once_when_marked_twice_given_year_not_announced() {
        assertThat(announcements.markAnnounced(Year.of(2026), NOW)).isTrue();
        assertThat(announcements.markAnnounced(Year.of(2026), NOW.plusSeconds(86_400))).isFalse();
        assertThat(announcements.markAnnounced(Year.of(2027), NOW)).isTrue();

        assertThat(jdbc.sql("select announced_at from donation_yearly_receipt_announcement where receipt_year = 2026").query(Instant.class).single())
                .isEqualTo(NOW);
    }
}
