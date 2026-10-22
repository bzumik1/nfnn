package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecondFactorTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    private static String codeAt(Instant at) {
        return Totp.codeAt(SECRET, Totp.stepAt(at));
    }

    @Test
    @DisplayName("Given a freshly enrolled factor, when nothing was confirmed, then it is not enabled and cannot verify")
    void should_not_be_enabled_when_enrolled_given_no_confirmation() {
        SecondFactor factor = SecondFactor.enrol(DONOR, SECRET, NOW);

        assertThat(factor.isEnabled()).isFalse();
        assertThat(factor.confirmedAt()).isEmpty();
        assertThat(factor.lastUsedStep()).isEmpty();
        assertThatThrownBy(() -> factor.verify(codeAt(NOW), NOW)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("Given a pending factor, when the current code confirms it, then it is enabled and that step is spent")
    void should_enable_when_confirmed_given_matching_code() {
        SecondFactor factor = SecondFactor.enrol(DONOR, SECRET, NOW);

        factor.confirm(codeAt(NOW), NOW);

        assertThat(factor.isEnabled()).isTrue();
        assertThat(factor.confirmedAt()).contains(NOW);
        assertThat(factor.lastUsedStep()).hasValue(Totp.stepAt(NOW));
        assertThatThrownBy(() -> factor.confirm(codeAt(NOW), NOW)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("Given a pending factor, when a wrong code is offered, then it is rejected as a rule violation and the factor stays pending")
    void should_stay_pending_when_confirmed_given_wrong_code() {
        SecondFactor factor = SecondFactor.enrol(DONOR, SECRET, NOW);

        assertThatThrownBy(() -> factor.confirm("000000", NOW)).isInstanceOf(SecondFactorCodeRejected.class);

        assertThat(factor.isEnabled()).isFalse();
    }

    @Test
    @DisplayName("Given an enabled factor, when the next step's code is verified, then it passes once and the same code is refused afterwards")
    void should_refuse_reused_code_when_verified_given_enabled_factor() {
        SecondFactor factor = SecondFactor.enrol(DONOR, SECRET, NOW);
        factor.confirm(codeAt(NOW), NOW);
        Instant later = NOW.plus(Duration.ofSeconds(60));

        factor.verify(codeAt(later), later);

        assertThat(factor.lastUsedStep()).hasValue(Totp.stepAt(later));
        assertThatThrownBy(() -> factor.verify(codeAt(later), later)).isInstanceOf(InvalidSecondFactorCode.class);
        assertThatThrownBy(() -> factor.verify(codeAt(NOW), later)).isInstanceOf(InvalidSecondFactorCode.class);
    }

    @Test
    @DisplayName("Given an enabled factor, when a wrong code is verified, then the sign-in failure is thrown and the last step stays")
    void should_throw_authentication_failure_when_verified_given_wrong_code() {
        SecondFactor factor = SecondFactor.enrol(DONOR, SECRET, NOW);
        factor.confirm(codeAt(NOW), NOW);
        Instant later = NOW.plus(Duration.ofMinutes(5));

        assertThatThrownBy(() -> factor.verify("123456", later)).isInstanceOf(InvalidSecondFactorCode.class);

        assertThat(factor.lastUsedStep()).hasValue(Totp.stepAt(NOW));
    }

    @Test
    @DisplayName("Given an enabled factor, when a code is checked for a change of the account, then a wrong one is a rule violation and a right one is spent")
    void should_reject_as_rule_violation_when_checked_given_wrong_code() {
        SecondFactor factor = SecondFactor.enrol(DONOR, SECRET, NOW);
        factor.confirm(codeAt(NOW), NOW);
        Instant later = NOW.plus(Duration.ofMinutes(2));

        assertThatThrownBy(() -> factor.check("123456", later)).isInstanceOf(SecondFactorCodeRejected.class);
        factor.check(codeAt(later), later);

        assertThat(factor.lastUsedStep()).hasValue(Totp.stepAt(later));
    }

    @Test
    @DisplayName("Given stored values, when a factor is reconstituted, then it carries them")
    void should_carry_values_when_reconstituted() {
        SecondFactor factor = SecondFactor.reconstitute(DONOR, SECRET, NOW, NOW.plusSeconds(30), 42L);

        assertThat(factor.donorId()).isEqualTo(DONOR);
        assertThat(factor.secret()).isEqualTo(SECRET);
        assertThat(factor.createdAt()).isEqualTo(NOW);
        assertThat(factor.isEnabled()).isTrue();
        assertThat(factor.lastUsedStep()).hasValue(42L);
    }
}
