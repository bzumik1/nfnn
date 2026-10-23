package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ConfirmationRequired;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.InvalidPasskey;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyChallenge;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyConfirmationRejected;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasskeyUserHandle;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.WrongPassword;
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
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorConfirmationsTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(120));
    private static final DonorId OTHER_DONOR = DonorId.newId(NOW.minusSeconds(60));
    private static final PasswordHash HASH = new PasswordHash("$hash");
    private static final String PASSWORD = "correct horse battery";
    private static final String CREDENTIAL_ID = "AbCd-_0123456789";

    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private PasskeyChallengeRepository challenges;
    @Mock
    private PasskeyCeremonies ceremonies;

    private DonorConfirmations confirmations;

    @BeforeEach
    void setUp() {
        confirmations = new DonorConfirmations(passwordHasher, passkeys, challenges, ceremonies, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a donor with a password, when the right password confirms a change, then it passes and the wrong one is refused")
    void should_check_password_when_change_confirmed_given_donor_with_password() {
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);

        assertThatCode(() -> confirmations.confirm(donor(HASH), Confirmation.withPassword(PASSWORD))).doesNotThrowAnyException();
        assertThatThrownBy(() -> confirmations.confirm(donor(HASH), Confirmation.withPassword("wrong horse battery")))
                .isInstanceOf(WrongPassword.class);
        assertThatThrownBy(() -> confirmations.confirm(donor(HASH), Confirmation.withPassword("short"))).isInstanceOf(WrongPassword.class);
    }

    @Test
    @DisplayName("Given a donor without a password, when a password confirms a change, then it is refused without hashing")
    void should_refuse_password_when_change_confirmed_given_donor_without_password() {
        assertThatThrownBy(() -> confirmations.confirm(donor(null), Confirmation.withPassword(PASSWORD))).isInstanceOf(WrongPassword.class);

        verifyNoInteractions(passwordHasher);
    }

    @Test
    @DisplayName("Given nothing to confirm with, when a change is confirmed, then the confirmation is required")
    void should_require_confirmation_when_change_confirmed_given_nothing() {
        assertThatThrownBy(() -> confirmations.confirm(donor(HASH), Confirmation.none())).isInstanceOf(ConfirmationRequired.class);
        assertThatThrownBy(() -> confirmations.confirm(donor(null), Confirmation.withPassword(""))).isInstanceOf(ConfirmationRequired.class);
    }

    @Test
    @DisplayName("Given a live sign-in challenge and the donor's own passkey, when it confirms a change, then the challenge is spent and the passkey records its use")
    void should_spend_challenge_and_record_use_when_change_confirmed_given_own_passkey() {
        LinkSecret challenge = LinkSecret.generate();
        PasskeyChallenge issued = PasskeyChallenge.forSignIn(challenge, NOW.minusSeconds(30), Duration.ofMinutes(5));
        Passkey passkey = passkeyOf(DONOR);
        PasskeyAssertion assertion = assertionBy(DONOR);
        when(challenges.findByChallengeHash(challenge.hash())).thenReturn(Optional.of(issued));
        when(passkeys.findByCredentialId(CREDENTIAL_ID)).thenReturn(Optional.of(passkey));
        when(ceremonies.verifySignIn(assertion, challenge, passkey)).thenReturn(7L);

        confirmations.confirm(donor(null), Confirmation.withPasskey(new PasskeyProof(challenge.value(), assertion)));

        ArgumentCaptor<PasskeyChallenge> spent = ArgumentCaptor.forClass(PasskeyChallenge.class);
        verify(challenges).save(spent.capture());
        assertThat(spent.getValue().usedAt()).contains(NOW);
        verify(passkeys).save(passkey);
        assertThat(passkey.signCount()).isEqualTo(7L);
        assertThat(passkey.lastUsedAt()).contains(NOW);
    }

    @Test
    @DisplayName("Given another donor's passkey, when it confirms a change, then the confirmation is rejected and the challenge is spent anyway")
    void should_reject_and_spend_challenge_when_change_confirmed_given_another_donors_passkey() {
        LinkSecret challenge = LinkSecret.generate();
        when(challenges.findByChallengeHash(challenge.hash()))
                .thenReturn(Optional.of(PasskeyChallenge.forSignIn(challenge, NOW.minusSeconds(30), Duration.ofMinutes(5))));
        when(passkeys.findByCredentialId(CREDENTIAL_ID)).thenReturn(Optional.of(passkeyOf(OTHER_DONOR)));

        assertThatThrownBy(() -> confirmations.confirm(donor(null), Confirmation.withPasskey(new PasskeyProof(challenge.value(), assertionBy(OTHER_DONOR)))))
                .isInstanceOf(PasskeyConfirmationRejected.class);

        verify(challenges).save(any());
        verifyNoInteractions(ceremonies);
    }

    @Test
    @DisplayName("Given a spent, unknown or malformed challenge or a signature that does not verify, when a passkey confirms a change, then it is rejected")
    void should_reject_when_change_confirmed_given_unusable_challenge_or_bad_signature() {
        LinkSecret spent = LinkSecret.generate();
        PasskeyChallenge used = PasskeyChallenge.forSignIn(spent, NOW.minusSeconds(30), Duration.ofMinutes(5));
        used.markUsed(NOW.minusSeconds(10));
        when(challenges.findByChallengeHash(spent.hash())).thenReturn(Optional.of(used));
        LinkSecret live = LinkSecret.generate();
        Passkey passkey = passkeyOf(DONOR);
        PasskeyAssertion assertion = assertionBy(DONOR);
        when(challenges.findByChallengeHash(live.hash()))
                .thenReturn(Optional.of(PasskeyChallenge.forSignIn(live, NOW.minusSeconds(30), Duration.ofMinutes(5))));
        when(passkeys.findByCredentialId(CREDENTIAL_ID)).thenReturn(Optional.of(passkey));
        when(ceremonies.verifySignIn(assertion, live, passkey)).thenThrow(new InvalidPasskey());

        assertThatThrownBy(() -> confirmations.confirm(donor(null), Confirmation.withPasskey(new PasskeyProof(spent.value(), assertion))))
                .isInstanceOf(PasskeyConfirmationRejected.class);
        assertThatThrownBy(() -> confirmations.confirm(donor(null), Confirmation.withPasskey(new PasskeyProof("not a challenge", assertion))))
                .isInstanceOf(PasskeyConfirmationRejected.class);
        assertThatThrownBy(() -> confirmations.confirm(donor(null), Confirmation.withPasskey(new PasskeyProof(live.value(), assertion))))
                .isInstanceOf(PasskeyConfirmationRejected.class);
        verify(passkeys, never()).save(any());
    }

    private static PasskeyAssertion assertionBy(DonorId donorId) {
        return new PasskeyAssertion(CREDENTIAL_ID, "client-data", "authenticator-data", "signature", PasskeyUserHandle.of(donorId).value());
    }

    private static Passkey passkeyOf(DonorId donorId) {
        return Passkey.register(donorId, CREDENTIAL_ID, new byte[]{1, 2, 3}, 3, List.of("internal"), "iPhone", NOW.minusSeconds(3600));
    }

    private static Donor donor(PasswordHash hash) {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), hash, new VariableSymbol("4821937560"), LocaleCode.CS, NOW.minusSeconds(120));
        donor.verifyEmail(NOW.minusSeconds(90));
        return donor;
    }
}
