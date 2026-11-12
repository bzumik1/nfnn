package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.InvalidSecondFactorCode;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorCodesPaused;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.OptionalLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SecondFactorCodesTest {

    private static final Instant NOW = Instant.parse("2026-11-06T10:00:00Z");
    private static final DonorId JANA = DonorId.of("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private WrongSecondFactorCodeCount wrongCodes;

    private SecondFactorCodes codes;

    @BeforeEach
    void setUp() {
        codes = new SecondFactorCodes(secondFactors, wrongCodes);
    }

    @Test
    @DisplayName("Given an enabled factor, when the current code is verified, then a check is reserved first, the code is spent atomically and the check is given back as a right code")
    void should_reserve_spend_and_release_when_verified_given_the_current_code() {
        SecondFactor factor = enabledFactor();
        when(secondFactors.recordUse(factor)).thenReturn(true);

        codes.verify(factor, codeAt(NOW), NOW);

        InOrder order = inOrder(wrongCodes, secondFactors);
        order.verify(wrongCodes).reserve(JANA, NOW);
        order.verify(secondFactors).recordUse(factor);
        order.verify(wrongCodes).release(JANA);
        assertThat(factor.lastUsedStep()).isEqualTo(OptionalLong.of(Totp.stepAt(NOW)));
    }

    @Test
    @DisplayName("Given an enabled factor, when a wrong code is verified, then it is refused as a wrong code, nothing is spent and the reserved check stays counted")
    void should_keep_the_check_counted_when_verified_given_a_wrong_code() {
        SecondFactor factor = enabledFactor();

        assertThatThrownBy(() -> codes.verify(factor, "000000", NOW)).isInstanceOf(InvalidSecondFactorCode.class);

        verify(wrongCodes).reserve(JANA, NOW);
        verify(secondFactors, never()).recordUse(any());
        verify(wrongCodes, never()).release(any());
    }

    @Test
    @DisplayName("Given a code another request spent at the same moment, when it is verified, then it is refused as a wrong code and the check stays counted")
    void should_refuse_when_verified_given_a_code_spent_by_another_request() {
        SecondFactor factor = enabledFactor();
        when(secondFactors.recordUse(factor)).thenReturn(false);

        assertThatThrownBy(() -> codes.verify(factor, codeAt(NOW), NOW)).isInstanceOf(InvalidSecondFactorCode.class);

        verify(wrongCodes, never()).release(any());
    }

    @Test
    @DisplayName("Given a donor whose codes are paused, when the current code is verified or checked, then it is refused as paused before the code is evaluated")
    void should_refuse_before_evaluating_when_checked_given_paused_codes() {
        SecondFactor factor = enabledFactor();
        doThrow(new SecondFactorCodesPaused()).when(wrongCodes).reserve(JANA, NOW);

        assertThatThrownBy(() -> codes.verify(factor, codeAt(NOW), NOW)).isInstanceOf(SecondFactorCodesPaused.class);
        assertThatThrownBy(() -> codes.check(factor, codeAt(NOW), NOW)).isInstanceOf(SecondFactorCodesPaused.class);

        assertThat(factor.lastUsedStep()).isEqualTo(OptionalLong.of(Totp.stepAt(NOW) - 1));
        verify(secondFactors, never()).recordUse(any());
        verify(wrongCodes, never()).release(any());
    }

    @Test
    @DisplayName("Given an enabled factor, when a code is checked outside the sign-in, then a wrong or spent code is refused as rejected and the current one is spent and given back")
    void should_refuse_as_rejected_when_checked_given_a_wrong_or_spent_code() {
        SecondFactor factor = enabledFactor();
        when(secondFactors.recordUse(any())).thenReturn(false, true);

        assertThatThrownBy(() -> codes.check(factor, "000000", NOW)).isInstanceOf(SecondFactorCodeRejected.class);
        assertThatThrownBy(() -> codes.check(enabledFactor(), codeAt(NOW), NOW)).isInstanceOf(SecondFactorCodeRejected.class);
        codes.check(factor, codeAt(NOW), NOW);

        verify(wrongCodes, times(3)).reserve(JANA, NOW);
        verify(wrongCodes).release(JANA);
    }

    @Test
    @DisplayName("Given a pending factor, when its first code confirms it, then a wrong code stays counted and the current one confirms it and is given back")
    void should_count_wrong_and_give_back_right_when_confirmed_given_a_pending_factor() {
        SecondFactor factor = SecondFactor.enrol(JANA, SECRET, NOW);

        assertThatThrownBy(() -> codes.confirm(factor, "000000", NOW)).isInstanceOf(SecondFactorCodeRejected.class);
        verify(wrongCodes, never()).release(any());
        codes.confirm(factor, codeAt(NOW), NOW);

        assertThat(factor.isEnabled()).isTrue();
        verify(wrongCodes, times(2)).reserve(JANA, NOW);
        verify(wrongCodes).release(JANA);
    }

    private static SecondFactor enabledFactor() {
        return SecondFactor.reconstitute(JANA, SECRET, NOW.minusSeconds(600), NOW.minusSeconds(600), Totp.stepAt(NOW) - 1);
    }

    private static String codeAt(Instant at) {
        return Totp.codeAt(SECRET, Totp.stepAt(at));
    }
}
