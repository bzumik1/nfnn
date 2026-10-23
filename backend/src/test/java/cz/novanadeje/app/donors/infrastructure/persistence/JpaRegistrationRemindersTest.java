package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RegistrationReminders;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaDonorRepository.class, JpaRegistrationReminders.class})
class JpaRegistrationRemindersTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final Instant WEEK_AGO = NOW.minus(Duration.ofDays(7));
    private static final Instant DAY_AGO = NOW.minus(Duration.ofDays(1));

    @Autowired
    private DonorRepository donors;
    @Autowired
    private RegistrationReminders reminders;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given unconfirmed registrations two days, half a day and eight days old, when the due ones are read for one to seven days back, then only the two-day-old one is due")
    void should_return_only_registrations_inside_window_when_read_given_registrations_of_several_ages() {
        Donor twoDays = register("dva@example.cz", "1000000001", NOW.minus(Duration.ofDays(2)));
        register("pul@example.cz", "1000000002", NOW.minus(Duration.ofHours(12)));
        register("osm@example.cz", "1000000003", NOW.minus(Duration.ofDays(8)));
        flushAndClear();

        assertThat(reminders.dueFor(WEEK_AGO, DAY_AGO)).containsExactly(twoDays.id());
    }

    @Test
    @DisplayName("Given a confirmed and an erased registration in the window, when the due ones are read, then neither is due")
    void should_skip_confirmed_and_erased_when_read_given_both_in_window() {
        Donor confirmed = register("jana@example.cz", "1000000004", NOW.minus(Duration.ofDays(2)));
        confirmed.verifyEmail(NOW.minus(Duration.ofDays(2)));
        donors.save(confirmed);
        Donor erased = register("petr@example.cz", "1000000005", NOW.minus(Duration.ofDays(2)));
        erased.verifyEmail(NOW.minus(Duration.ofDays(2)));
        erased.erase(NOW.minus(Duration.ofDays(1)));
        donors.save(erased);
        flushAndClear();

        assertThat(reminders.dueFor(WEEK_AGO, DAY_AGO)).isEmpty();
    }

    @Test
    @DisplayName("Given a reminder recorded for a due registration, when the due ones are read again, then it is no longer due")
    void should_not_return_registration_again_when_read_given_reminder_recorded() {
        Donor donor = register("jana@example.cz", "1000000006", NOW.minus(Duration.ofDays(2)));
        flushAndClear();

        reminders.recordSent(donor.id(), NOW);
        flushAndClear();

        assertThat(reminders.dueFor(WEEK_AGO, DAY_AGO)).isEmpty();
    }

    private Donor register(String email, String variableSymbol, Instant registeredAt) {
        Donor donor = Donor.register(DonorId.newId(registeredAt), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, registeredAt);
        donors.save(donor);
        return donor;
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
