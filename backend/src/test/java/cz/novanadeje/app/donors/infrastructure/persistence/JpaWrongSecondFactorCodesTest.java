package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactorCodeReservation;
import cz.novanadeje.app.donors.domain.WrongSecondFactorCodes;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static cz.novanadeje.app.donors.domain.SecondFactorCodeReservation.PAUSED;
import static cz.novanadeje.app.donors.domain.SecondFactorCodeReservation.PAUSE_STARTED;
import static cz.novanadeje.app.donors.domain.SecondFactorCodeReservation.RESERVED;
import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class JpaWrongSecondFactorCodesTest {

    private static final Instant NOW = Instant.parse("2026-11-06T10:00:00Z");

    @Autowired
    private WrongSecondFactorCodes wrongCodes;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EntityManager entityManager;

    private DonorId jana;
    private DonorId petr;

    @BeforeEach
    void setUp() {
        jana = donor("jana@example.cz", "4821937560");
        petr = donor("petr@example.cz", "5930148261");
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @DisplayName("Given a donor without wrong codes, when ten code checks are reserved, then each is reserved, the eleventh starts the pause and the twelfth finds it paused")
    void should_start_the_pause_at_the_eleventh_reservation_when_reserving_given_no_wrong_codes() {
        List<SecondFactorCodeReservation> reservations = reserve(jana, NOW, 12);

        assertThat(reservations.subList(0, 10)).containsOnly(RESERVED);
        assertThat(reservations.subList(10, 12)).containsExactly(PAUSE_STARTED, PAUSED);
    }

    @Test
    @DisplayName("Given a donor whose codes are paused, when another donor's code check is reserved, then it is reserved")
    void should_reserve_for_another_donor_when_reserving_given_a_paused_donor() {
        reserve(jana, NOW, 11);

        assertThat(wrongCodes.reserve(petr, NOW)).isEqualTo(RESERVED);
    }

    @Test
    @DisplayName("Given ten reserved checks of which one was released as a right code, when two more are reserved, then the first is reserved and the second starts the pause")
    void should_give_the_slot_back_when_released_given_ten_reserved_checks() {
        reserve(jana, NOW, 10);

        wrongCodes.release(jana);

        assertThat(reserve(jana, NOW, 2)).containsExactly(RESERVED, PAUSE_STARTED);
    }

    @Test
    @DisplayName("Given a donor without a reserved check, when a release comes, then it gives no slot beyond the ten")
    void should_not_add_a_slot_when_released_given_nothing_reserved() {
        wrongCodes.release(jana);
        wrongCodes.release(jana);

        assertThat(reserve(jana, NOW, 11).get(10)).isEqualTo(PAUSE_STARTED);
    }

    @Test
    @DisplayName("Given ten wrong codes, when the next check comes a quarter of an hour after the first, then it still starts the pause, and a second later the window starts again")
    void should_count_the_window_up_to_its_last_moment_when_reserving_given_ten_wrong_codes() {
        reserve(jana, NOW, 10);
        reserve(petr, NOW, 10);

        assertThat(wrongCodes.reserve(jana, NOW.plus(WrongSecondFactorCodes.WINDOW))).isEqualTo(PAUSE_STARTED);
        List<SecondFactorCodeReservation> later = reserve(petr, NOW.plus(WrongSecondFactorCodes.WINDOW).plusSeconds(1), 11);
        assertThat(later.subList(0, 10)).containsOnly(RESERVED);
        assertThat(later.get(10)).isEqualTo(PAUSE_STARTED);
    }

    @Test
    @DisplayName("Given a pause that started, when checks come up to an hour later, then they find it paused, and a second after the hour a new window of ten starts")
    void should_end_the_pause_after_an_hour_when_reserving_given_a_started_pause() {
        reserve(jana, NOW, 11);
        Instant end = NOW.plus(WrongSecondFactorCodes.PAUSE);

        assertThat(wrongCodes.reserve(jana, end.minusSeconds(1))).isEqualTo(PAUSED);
        assertThat(wrongCodes.reserve(jana, end)).isEqualTo(PAUSED);
        List<SecondFactorCodeReservation> after = reserve(jana, end.plusSeconds(1), 12);
        assertThat(after.subList(0, 10)).containsOnly(RESERVED);
        assertThat(after.subList(10, 12)).containsExactly(PAUSE_STARTED, PAUSED);
    }

    @Test
    @DisplayName("Given a pause that started, when a right code of a check reserved before it is released, then the pause holds")
    void should_keep_the_pause_when_released_given_a_started_pause() {
        reserve(jana, NOW, 11);

        wrongCodes.release(jana);

        assertThat(wrongCodes.reserve(jana, NOW.plus(Duration.ofMinutes(30)))).isEqualTo(PAUSED);
    }

    private List<SecondFactorCodeReservation> reserve(DonorId donor, Instant at, int times) {
        List<SecondFactorCodeReservation> reservations = new ArrayList<>();
        for (int i = 0; i < times; i++) {
            reservations.add(wrongCodes.reserve(donor, at));
        }
        return reservations;
    }

    private DonorId donor(String email, String variableSymbol) {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, NOW);
        donors.save(donor);
        return donor.id();
    }
}
