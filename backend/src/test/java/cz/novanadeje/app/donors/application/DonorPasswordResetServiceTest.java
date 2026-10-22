package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorPasswordResetRequested;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidPasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordResetToken;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.domain.PasswordTooWeak;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
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
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorPasswordResetServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final Duration TTL = Duration.ofHours(1);
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final String NEW_PASSWORD = "a brand new passphrase";
    private static final PasswordHash OLD_HASH = new PasswordHash("$old");
    private static final PasswordHash NEW_HASH = new PasswordHash("$new");

    @Mock
    private DonorRepository donors;
    @Mock
    private PasswordResetTokenRepository tokens;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private ApplicationEventPublisher events;

    private DonorPasswordResetService service;

    @BeforeEach
    void setUp() {
        service = new DonorPasswordResetService(donors, tokens, refreshTokens, passwordHasher, new DonorPasswordResetProperties(TTL, 3),
                Clock.fixed(NOW, ZoneOffset.UTC), events);
    }

    @Test
    @DisplayName("Given an address no donor has, when a reset is requested, then nothing is stored and nothing is published")
    void should_store_and_publish_nothing_when_requested_given_unknown_email() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());

        service.requestReset(EMAIL);

        verifyNoInteractions(tokens, events, passwordHasher, refreshTokens);
    }

    @Test
    @DisplayName("Given a donor whose e-mail is not verified, when a reset is requested, then nothing is stored and nothing is published")
    void should_store_and_publish_nothing_when_requested_given_unverified_donor() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(unverifiedDonor()));

        service.requestReset(EMAIL);

        verifyNoInteractions(tokens, events, passwordHasher, refreshTokens);
    }

    @Test
    @DisplayName("Given a donor, when a reset is requested, then the unusable links go first and the event carries the secret of the stored token")
    void should_store_token_and_publish_secret_when_requested_given_donor() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor(LocaleCode.EN)));
        when(tokens.countOf(DONOR)).thenReturn(2);

        service.requestReset(EMAIL);

        InOrder order = inOrder(tokens, events);
        order.verify(tokens).deleteUnusableOf(DONOR, NOW);
        order.verify(tokens).countOf(DONOR);
        ArgumentCaptor<PasswordResetToken> stored = ArgumentCaptor.forClass(PasswordResetToken.class);
        order.verify(tokens).save(stored.capture());
        ArgumentCaptor<DonorPasswordResetRequested> published = ArgumentCaptor.forClass(DonorPasswordResetRequested.class);
        order.verify(events).publishEvent(published.capture());
        DonorPasswordResetRequested event = published.getValue();
        assertThat(event.secret().hash()).isEqualTo(stored.getValue().secretHash());
        assertThat(event.donorId()).isEqualTo(DONOR.value());
        assertThat(event.email()).isEqualTo(EMAIL);
        assertThat(event.preferredLocale()).isEqualTo(LocaleCode.EN);
        assertThat(event.expiresAt()).isEqualTo(NOW.plus(TTL)).isEqualTo(stored.getValue().expiresAt());
        assertThat(stored.getValue().donorId()).isEqualTo(DONOR);
        assertThat(stored.getValue().issuedAt()).isEqualTo(NOW);
        assertThat(event.toString()).doesNotContain(event.secret().value());
    }

    @Test
    @DisplayName("Given a donor holding three live links, when a reset is requested, then nothing is stored and nothing is published")
    void should_store_and_publish_nothing_when_requested_given_three_live_links() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(donor(LocaleCode.CS)));
        when(tokens.countOf(DONOR)).thenReturn(3);

        service.requestReset(EMAIL);

        verify(tokens).deleteUnusableOf(DONOR, NOW);
        verify(tokens, never()).save(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a common password, when a reset is confirmed, then it is refused before the token is looked at")
    void should_refuse_before_token_when_confirmed_given_common_password() {
        LinkSecret secret = LinkSecret.generate();

        assertThatThrownBy(() -> service.confirmReset(secret.value(), "password12345"))
                .isInstanceOfSatisfying(PasswordTooWeak.class, weak -> assertThat(weak.code()).isEqualTo("donors/password-too-common"));

        verifyNoInteractions(tokens, donors, refreshTokens, passwordHasher);
    }

    @Test
    @DisplayName("Given a malformed token, when a reset is confirmed, then it is refused before any lookup")
    void should_refuse_before_lookup_when_confirmed_given_malformed_token() {
        assertThatIllegalArgumentException().isThrownBy(() -> service.confirmReset("not.a.token", NEW_PASSWORD));

        verifyNoInteractions(tokens, donors, refreshTokens, passwordHasher);
    }

    @Test
    @DisplayName("Given an unknown token, when a reset is confirmed, then it is invalid and nothing changes")
    void should_be_invalid_when_confirmed_given_unknown_token() {
        LinkSecret secret = LinkSecret.generate();
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.confirmReset(secret.value(), NEW_PASSWORD)).isInstanceOf(InvalidPasswordResetToken.class);

        verify(tokens, never()).markUsed(any(), any());
        verifyNoInteractions(donors, refreshTokens, passwordHasher);
    }

    @Test
    @DisplayName("Given an expired token, when a reset is confirmed, then it is invalid and nothing changes")
    void should_be_invalid_when_confirmed_given_expired_token() {
        LinkSecret secret = LinkSecret.generate();
        PasswordResetToken expired = PasswordResetToken.issue(secret, DONOR, NOW.minus(TTL), TTL);
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.confirmReset(secret.value(), NEW_PASSWORD)).isInstanceOf(InvalidPasswordResetToken.class);

        verify(tokens, never()).markUsed(any(), any());
        verifyNoInteractions(donors, refreshTokens, passwordHasher);
    }

    @Test
    @DisplayName("Given a used token, when a reset is confirmed, then it is invalid and nothing changes")
    void should_be_invalid_when_confirmed_given_used_token() {
        LinkSecret secret = LinkSecret.generate();
        PasswordResetToken used = PasswordResetToken.issue(secret, DONOR, NOW.minusSeconds(60), TTL);
        used.markUsed(NOW.minusSeconds(30));
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(used));

        assertThatThrownBy(() -> service.confirmReset(secret.value(), NEW_PASSWORD)).isInstanceOf(InvalidPasswordResetToken.class);

        verify(tokens, never()).markUsed(any(), any());
        verifyNoInteractions(donors, refreshTokens, passwordHasher);
    }

    @Test
    @DisplayName("Given a concurrent confirm that won the token, when a reset is confirmed, then it is invalid and no password changes")
    void should_be_invalid_and_change_nothing_when_confirmed_given_lost_race() {
        LinkSecret secret = LinkSecret.generate();
        PasswordResetToken token = PasswordResetToken.issue(secret, DONOR, NOW.minusSeconds(60), TTL);
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(token));
        when(tokens.markUsed(token.id(), NOW)).thenReturn(false);

        assertThatThrownBy(() -> service.confirmReset(secret.value(), NEW_PASSWORD)).isInstanceOf(InvalidPasswordResetToken.class);

        verify(tokens, never()).deleteOthersOf(any(), any());
        verifyNoInteractions(donors, refreshTokens, passwordHasher);
    }

    @Test
    @DisplayName("Given a won token whose donor is gone, when a reset is confirmed, then it is invalid")
    void should_be_invalid_when_confirmed_given_missing_donor() {
        LinkSecret secret = LinkSecret.generate();
        PasswordResetToken token = PasswordResetToken.issue(secret, DONOR, NOW.minusSeconds(60), TTL);
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(token));
        when(tokens.markUsed(token.id(), NOW)).thenReturn(true);
        when(donors.findById(DONOR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.confirmReset(secret.value(), NEW_PASSWORD)).isInstanceOf(InvalidPasswordResetToken.class);

        verifyNoInteractions(refreshTokens, passwordHasher);
    }

    @Test
    @DisplayName("Given a live token, when a reset is confirmed, then the password changes, the other links go and every session is revoked")
    void should_change_password_delete_others_and_revoke_sessions_when_confirmed_given_live_token() {
        LinkSecret secret = LinkSecret.generate();
        PasswordResetToken token = PasswordResetToken.issue(secret, DONOR, NOW.minusSeconds(60), TTL);
        Donor donor = donor(LocaleCode.CS);
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(token));
        when(tokens.markUsed(token.id(), NOW)).thenReturn(true);
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.hash(new RawPassword(NEW_PASSWORD))).thenReturn(NEW_HASH);

        service.confirmReset(secret.value(), NEW_PASSWORD);

        ArgumentCaptor<Donor> saved = ArgumentCaptor.forClass(Donor.class);
        verify(donors).save(saved.capture());
        assertThat(saved.getValue().passwordHash()).isEqualTo(NEW_HASH);
        verify(tokens).deleteOthersOf(DONOR, token.id());
        verify(refreshTokens).revokeAllOf(DONOR, NOW);
        verifyNoInteractions(events);
    }

    private static Donor donor(LocaleCode locale) {
        Donor donor = unverifiedDonor(locale);
        donor.verifyEmail(NOW);
        return donor;
    }

    private static Donor unverifiedDonor() {
        return unverifiedDonor(LocaleCode.CS);
    }

    private static Donor unverifiedDonor(LocaleCode locale) {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                EMAIL, OLD_HASH, new VariableSymbol("1234567890"), locale, NOW);
    }
}
