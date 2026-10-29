package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
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
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaDonorRepository.class, JpaSecondFactorRepository.class})
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
    @DisplayName("Given a confirmed factor no code was used with yet, when a use is recorded, then it is stored")
    void should_store_first_use_when_use_recorded_given_unused_factor() {
        secondFactors.save(SecondFactor.reconstitute(jana, SECRET, NOW, NOW, null));
        flushAndClear();

        assertThat(secondFactors.recordUse(SecondFactor.reconstitute(jana, SECRET, NOW, NOW, 7L))).isTrue();
        flushAndClear();

        assertThat(secondFactors.findByDonor(jana).orElseThrow().lastUsedStep()).hasValue(7L);
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

    private DonorId donor(String email, String variableSymbol) {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
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
