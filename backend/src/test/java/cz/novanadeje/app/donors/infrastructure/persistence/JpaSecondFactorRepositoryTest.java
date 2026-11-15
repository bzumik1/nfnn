package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.domain.DonorName;
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

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class JpaSecondFactorRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Autowired
    private SecondFactorRepository secondFactors;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EntityManager entityManager;

    private DonorId jana;

    @BeforeEach
    void setUp() {
        jana = donor("jana@example.cz", "4821937560");
        flushAndClear();
    }

    @Test
    @DisplayName("Given a pending factor, when it is found by donor, then the secret and creation time survive and nothing is confirmed")
    void should_keep_fields_when_found_given_pending_factor() {
        secondFactors.save(SecondFactor.enrol(jana, SECRET, NOW));
        flushAndClear();

        SecondFactor found = secondFactors.findByDonor(jana).orElseThrow();

        assertThat(found.donorId()).isEqualTo(jana);
        assertThat(found.secret()).isEqualTo(SECRET);
        assertThat(found.createdAt()).isEqualTo(NOW);
        assertThat(found.isEnabled()).isFalse();
        assertThat(found.lastUsedStep()).isEmpty();
        assertThat(secondFactors.findByDonor(DonorId.newId(NOW))).isEmpty();
    }

    @Test
    @DisplayName("Given a confirmed factor saved over the pending one, when it is found, then the confirmation and the last used step survive")
    void should_keep_confirmation_when_found_given_confirmed_factor() {
        secondFactors.save(SecondFactor.enrol(jana, SECRET, NOW));
        flushAndClear();
        SecondFactor factor = secondFactors.findByDonor(jana).orElseThrow();
        factor.confirm(Totp.codeAt(SECRET, Totp.stepAt(NOW)), NOW);

        secondFactors.save(factor);
        flushAndClear();

        SecondFactor found = secondFactors.findByDonor(jana).orElseThrow();
        assertThat(found.isEnabled()).isTrue();
        assertThat(found.confirmedAt()).contains(NOW);
        assertThat(found.lastUsedStep()).hasValue(Totp.stepAt(NOW));
    }

    @Test
    @DisplayName("Given a factor whose code was used, when a later use is recorded, then it is stored, and a use at the same step is refused")
    void should_store_only_a_later_step_when_use_recorded_given_used_factor() {
        long used = Totp.stepAt(NOW);
        secondFactors.save(SecondFactor.reconstitute(jana, SECRET, NOW, NOW, used));
        flushAndClear();
        SecondFactor sameStep = SecondFactor.reconstitute(jana, SECRET, NOW, NOW, used);
        SecondFactor laterStep = SecondFactor.reconstitute(jana, SECRET, NOW, NOW, used + 1);

        assertThat(secondFactors.recordUse(sameStep)).isFalse();
        assertThat(secondFactors.recordUse(laterStep)).isTrue();
        assertThat(secondFactors.recordUse(laterStep)).isFalse();
        flushAndClear();

        assertThat(secondFactors.findByDonor(jana).orElseThrow().lastUsedStep()).hasValue(used + 1);
    }

    @Test
    @DisplayName("Given a pending factor, when a use is recorded for it, then it is refused and the factor stays pending without a step")
    void should_refuse_use_when_use_recorded_given_pending_factor() {
        secondFactors.save(SecondFactor.enrol(jana, SECRET, NOW));
        flushAndClear();

        assertThat(secondFactors.recordUse(SecondFactor.reconstitute(jana, SECRET, NOW, NOW, 7L))).isFalse();
        flushAndClear();

        SecondFactor found = secondFactors.findByDonor(jana).orElseThrow();
        assertThat(found.isEnabled()).isFalse();
        assertThat(found.lastUsedStep()).isEmpty();
    }

    @Test
    @DisplayName("Given a saved factor, when it is deleted, then the donor has none")
    void should_leave_donor_without_factor_when_deleted_given_saved_factor() {
        secondFactors.save(SecondFactor.enrol(jana, SECRET, NOW));
        flushAndClear();

        secondFactors.delete(jana);
        flushAndClear();

        assertThat(secondFactors.findByDonor(jana)).isEmpty();
    }

    @Test
    @DisplayName("Given set-ups begun before, at and after the cutoff and a factor confirmed long ago, when the pending ones begun up to the cutoff are deleted, then only those go and the count says how many")
    void should_delete_only_pending_factors_begun_up_to_cutoff_when_deleted_given_pending_and_confirmed_factors() {
        DonorId petr = donor("petr@example.cz", "4821937561");
        DonorId eva = donor("eva@example.cz", "4821937562");
        DonorId adam = donor("adam@example.cz", "4821937563");
        Instant cutoff = NOW.minus(Duration.ofMinutes(30));
        secondFactors.save(SecondFactor.enrol(jana, SECRET, cutoff.minusSeconds(1)));
        secondFactors.save(SecondFactor.enrol(petr, SECRET, cutoff));
        secondFactors.save(SecondFactor.enrol(eva, SECRET, cutoff.plusSeconds(1)));
        secondFactors.save(SecondFactor.reconstitute(adam, SECRET, cutoff.minus(Duration.ofDays(30)), cutoff.minus(Duration.ofDays(30)), 7L));
        flushAndClear();

        int deleted = secondFactors.deletePendingBegunUpTo(cutoff);
        flushAndClear();

        assertThat(deleted).isEqualTo(2);
        assertThat(secondFactors.findByDonor(jana)).isEmpty();
        assertThat(secondFactors.findByDonor(petr)).isEmpty();
        assertThat(secondFactors.findByDonor(eva)).isPresent();
        assertThat(secondFactors.findByDonor(adam)).isPresent();
    }

    @Test
    @DisplayName("Given a confirmed factor, a pending one and a donor without any, when the donors with an enabled factor are asked for, then only the confirmed one's donor comes")
    void should_name_only_confirmed_factor_donors_when_asked_given_pending_and_confirmed_factors() {
        DonorId petr = donor("petr@example.cz", "4821937561");
        donor("eva@example.cz", "4821937562");
        SecondFactor confirmed = SecondFactor.enrol(jana, SECRET, NOW);
        confirmed.confirm(Totp.codeAt(SECRET, Totp.stepAt(NOW)), NOW);
        secondFactors.save(confirmed);
        secondFactors.save(SecondFactor.enrol(petr, SECRET, NOW));
        flushAndClear();

        assertThat(secondFactors.findDonorsWithEnabledFactor()).containsExactly(jana);
    }

    private DonorId donor(String email, String variableSymbol) {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, new DonorName("Jana Nováková"), null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, NOW);
        donors.save(donor);
        return donor.id();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
