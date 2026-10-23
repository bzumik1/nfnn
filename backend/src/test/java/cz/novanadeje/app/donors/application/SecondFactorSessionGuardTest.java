package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.SecondFactorSessionRequired;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SecondFactorSessionGuardTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(60));
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private PasskeyRepository passkeys;

    private SecondFactorSessionGuard guard;

    @BeforeEach
    void setUp() {
        guard = new SecondFactorSessionGuard(secondFactors, passkeys);
    }

    @Test
    @DisplayName("Given an administrator with a passkey in a session opened with the password only, when a factor is to change, then the second factor session is required")
    void should_require_second_factor_session_when_factor_changes_given_administrator_with_passkey_in_password_session() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.empty());
        when(passkeys.countByDonor(DONOR)).thenReturn(1);

        assertThatThrownBy(() -> guard.requireForFactorChange(administrator(), false))
                .isInstanceOfSatisfying(SecondFactorSessionRequired.class,
                        refused -> assertThat(refused.code()).isEqualTo("donors/second-factor-session-required"));
    }

    @Test
    @DisplayName("Given an administrator with the code from the app turned on in a session opened with the password only, when a factor is to change, then the second factor session is required")
    void should_require_second_factor_session_when_factor_changes_given_administrator_with_enabled_code_in_password_session() {
        SecondFactor enabled = SecondFactor.reconstitute(DONOR, SECRET, NOW.minusSeconds(600), NOW.minusSeconds(540), null);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabled));

        assertThatThrownBy(() -> guard.requireForFactorChange(administrator(), false)).isInstanceOf(SecondFactorSessionRequired.class);
    }

    @Test
    @DisplayName("Given an administrator with only a pending code set-up and no passkey, when a factor is to change in a password session, then the change is allowed")
    void should_allow_factor_change_when_session_opened_with_password_given_administrator_without_any_factor() {
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(SecondFactor.enrol(DONOR, SECRET, NOW.minusSeconds(60))));
        when(passkeys.countByDonor(DONOR)).thenReturn(0);

        assertThatCode(() -> guard.requireForFactorChange(administrator(), false)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given an administrator in a session opened with the second factor, when a factor is to change, then the change is allowed without looking at the factors")
    void should_allow_factor_change_when_session_verified_given_administrator() {
        assertThatCode(() -> guard.requireForFactorChange(administrator(), true)).doesNotThrowAnyException();

        verifyNoInteractions(secondFactors, passkeys);
    }

    @Test
    @DisplayName("Given a donor who is not an administrator, when a factor is to change in a password session, then the change is allowed")
    void should_allow_factor_change_when_session_opened_with_password_given_plain_donor() {
        assertThatCode(() -> guard.requireForFactorChange(donor(), false)).doesNotThrowAnyException();

        verifyNoInteractions(secondFactors, passkeys);
    }

    private static Donor administrator() {
        Donor donor = donor();
        donor.grantAdministration();
        return donor;
    }

    private static Donor donor() {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.CS, NOW.minusSeconds(60));
        donor.verifyEmail(NOW.minusSeconds(30));
        return donor;
    }
}
