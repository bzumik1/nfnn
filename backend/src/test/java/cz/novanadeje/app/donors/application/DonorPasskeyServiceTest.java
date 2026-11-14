package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ConfirmationRequired;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.WrongPassword;
import cz.novanadeje.app.donors.infrastructure.security.CommonPasswordList;
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
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorPasskeyServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-13T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(3600));
    private static final PasswordHash HASH = new PasswordHash("$hash");
    private static final String PASSWORD = "correct horse battery";

    @Mock
    private DonorRepository donors;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private PasskeyChallengeRepository challenges;
    @Mock
    private PasskeyCeremonies ceremonies;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private ApplicationEventPublisher events;

    private final OpenTransactions transactions = new OpenTransactions();
    private DonorPasskeyService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        service = new DonorPasskeyService(donors, passkeys, challenges,
                new DonorConfirmations(passwordHasher, CommonPasswordList.policy(), passkeys, challenges, ceremonies, transactions, clock), ceremonies,
                new PasskeyProperties(Duration.ofMinutes(5), 10, "Nová naděje"), new SecondFactorSessionGuard(secondFactors, passkeys), events,
                clock, transactions);
    }

    @Test
    @DisplayName("Given a donor with a password, when passkey creation options are asked for with it, then the password is compared with no transaction open and the challenge is stored in one")
    void should_compare_outside_transaction_and_store_challenge_inside_when_options_asked_given_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor(HASH)));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenAnswer(invocation -> transactions.recordingHashing(true));

        PasskeyCreationOptions options = service.creationOptions(DONOR, false, Confirmation.withPassword(PASSWORD));

        assertThat(options.challenge()).isNotBlank();
        assertThat(transactions.openWhenHashing()).containsExactly(0);
        assertThat(transactions.open()).isZero();
        verify(challenges).save(any());
    }

    @Test
    @DisplayName("Given a password changed by another request after it was compared, when passkey creation options are asked for, then it is refused as a wrong password and no challenge is stored")
    void should_refuse_and_store_nothing_when_options_asked_given_hash_changed_since_comparison() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor(HASH)), Optional.of(donor(new PasswordHash("$meanwhile"))));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.creationOptions(DONOR, false, Confirmation.withPassword(PASSWORD))).isInstanceOf(WrongPassword.class);

        verify(challenges, never()).save(any());
    }

    @Test
    @DisplayName("Given a donor without a password or passkey who got a password meanwhile, when passkey creation options are asked for without a confirmation, then the confirmation is required and no challenge is stored")
    void should_require_confirmation_when_options_asked_given_password_set_since_read() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor(null)), Optional.of(donor(HASH)));

        assertThatThrownBy(() -> service.creationOptions(DONOR, false, Confirmation.none())).isInstanceOf(ConfirmationRequired.class);

        verify(challenges, never()).save(any());
    }

    @Test
    @DisplayName("Given a donor without a password who added a passkey meanwhile, when passkey creation options are asked for without a confirmation, then the confirmation is required and no challenge is stored")
    void should_require_confirmation_when_options_asked_given_passkey_added_since_read() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor(null)));
        when(passkeys.countByDonor(DONOR)).thenReturn(0, 1);

        assertThatThrownBy(() -> service.creationOptions(DONOR, false, Confirmation.none())).isInstanceOf(ConfirmationRequired.class);

        verify(challenges, never()).save(any());
    }

    private static Donor donor(PasswordHash hash) {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), hash, new VariableSymbol("4821937560"), LocaleCode.CS, NOW.minusSeconds(3600));
        donor.verifyEmail(NOW.minusSeconds(3000));
        return donor;
    }
}
