package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.FreshSecondFactorRequired;
import cz.novanadeje.app.donors.domain.PasskeyConfirmationRejected;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FreshSecondFactorCheckTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(3600));
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    private static final PasskeyProof PASSKEY = new PasskeyProof("challenge",
            new PasskeyAssertion("AbCd-_0123456789", "client-data", "authenticator-data", "signature", "user-handle"));

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private DonorConfirmations confirmations;

    private FreshSecondFactorCheck check;

    @BeforeEach
    void setUp() {
        check = new FreshSecondFactorCheck(donors, secondFactors, confirmations, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given the donor's code from the app, when it is checked, then it passes once and its step is remembered")
    void should_accept_code_and_remember_step_when_checked_given_current_code() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabledFactor(Totp.stepAt(NOW) - 1)));
        when(secondFactors.recordUse(any())).thenReturn(true);

        check.require(DONOR, SecondFactorProof.withCode(Totp.codeAt(SECRET, Totp.stepAt(NOW))));

        ArgumentCaptor<SecondFactor> recorded = ArgumentCaptor.forClass(SecondFactor.class);
        verify(secondFactors).recordUse(recorded.capture());
        assertThat(recorded.getValue().lastUsedStep()).hasValue(Totp.stepAt(NOW));
    }

    @Test
    @DisplayName("Given another check took the same code a moment earlier, when it is checked, then it is rejected")
    void should_reject_code_when_checked_given_concurrent_check_took_it_first() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabledFactor(Totp.stepAt(NOW) - 1)));
        when(secondFactors.recordUse(any())).thenReturn(false);

        assertThatThrownBy(() -> check.require(DONOR, SecondFactorProof.withCode(Totp.codeAt(SECRET, Totp.stepAt(NOW)))))
                .isInstanceOf(SecondFactorCodeRejected.class);
    }

    @Test
    @DisplayName("Given a code already used at the sign-in, when it is checked, then it is rejected and nothing is saved")
    void should_reject_code_when_checked_given_code_used_at_sign_in() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabledFactor(Totp.stepAt(NOW))));

        assertThatThrownBy(() -> check.require(DONOR, SecondFactorProof.withCode(Totp.codeAt(SECRET, Totp.stepAt(NOW)))))
                .isInstanceOf(SecondFactorCodeRejected.class);
        verify(secondFactors, never()).recordUse(any());
    }

    @Test
    @DisplayName("Given a wrong code, when it is checked, then it is rejected")
    void should_reject_code_when_checked_given_wrong_code() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabledFactor(Totp.stepAt(NOW) - 5)));

        assertThatThrownBy(() -> check.require(DONOR, SecondFactorProof.withCode("000000")))
                .isInstanceOf(SecondFactorCodeRejected.class);
    }

    @Test
    @DisplayName("Given a donor without the code from the app, when a code is checked, then it is rejected")
    void should_reject_code_when_checked_given_no_second_factor() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> check.require(DONOR, SecondFactorProof.withCode("123456")))
                .isInstanceOf(SecondFactorCodeRejected.class);
    }

    @Test
    @DisplayName("Given a passkey answer, when it is checked, then the donor's passkey must confirm it")
    void should_confirm_with_passkey_when_checked_given_passkey_answer() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));

        check.require(DONOR, SecondFactorProof.withPasskey(PASSKEY));

        verify(confirmations).confirm(donor, Confirmation.withPasskey(PASSKEY));
        verifyNoInteractions(secondFactors);
    }

    @Test
    @DisplayName("Given a passkey answer of another key, when it is checked, then the refusal of the confirmation stands")
    void should_reject_when_checked_given_passkey_answer_not_confirmed() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        doThrow(new PasskeyConfirmationRejected()).when(confirmations).confirm(donor, Confirmation.withPasskey(PASSKEY));

        assertThatThrownBy(() -> check.require(DONOR, SecondFactorProof.withPasskey(PASSKEY))).isInstanceOf(PasskeyConfirmationRejected.class);
    }

    @Test
    @DisplayName("Given neither a code nor a passkey answer, when it is checked, then a fresh second factor is required")
    void should_require_fresh_second_factor_when_checked_given_nothing() {
        assertThatThrownBy(() -> check.require(DONOR, SecondFactorProof.none())).isInstanceOf(FreshSecondFactorRequired.class);
        verifyNoInteractions(secondFactors, confirmations);
    }

    private static SecondFactor enabledFactor(long lastUsedStep) {
        return SecondFactor.reconstitute(DONOR, SECRET, NOW.minusSeconds(3000), NOW.minusSeconds(3000), lastUsedStep);
    }

    private static Donor donor() {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.CS, NOW.minusSeconds(60));
        donor.verifyEmail(NOW.minusSeconds(30));
        return donor;
    }
}
