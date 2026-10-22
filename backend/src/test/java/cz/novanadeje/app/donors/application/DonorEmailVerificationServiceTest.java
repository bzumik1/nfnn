package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorEmailVerificationRequested;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.InvalidEmailVerificationToken;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
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
import java.util.Set;

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
class DonorEmailVerificationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final Duration TTL = Duration.ofHours(24);
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(60));
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final VariableSymbol SYMBOL = new VariableSymbol("4821937560");
    private static final IssuedTokens TOKENS = new IssuedTokens("access", NOW.plus(Duration.ofMinutes(15)), "refresh", NOW.plus(Duration.ofDays(14)));

    @Mock
    private DonorRepository donors;
    @Mock
    private EmailVerificationTokenRepository tokens;
    @Mock
    private DonorSessionService sessions;
    @Mock
    private ApplicationEventPublisher events;

    private DonorEmailVerificationService service;

    @BeforeEach
    void setUp() {
        service = new DonorEmailVerificationService(donors, tokens, sessions, new DonorEmailVerificationProperties(TTL, 3),
                Clock.fixed(NOW, ZoneOffset.UTC), events);
    }

    @Test
    @DisplayName("Given an unverified donor, when a link is issued, then the unusable links go first and the event carries the secret of the stored token")
    void should_store_token_and_publish_secret_when_link_issued_given_unverified_donor() {
        when(tokens.countOf(DONOR)).thenReturn(2);

        service.issueLink(unverifiedDonor(LocaleCode.EN));

        InOrder order = inOrder(tokens, events);
        order.verify(tokens).deleteUnusableOf(DONOR, NOW);
        order.verify(tokens).countOf(DONOR);
        ArgumentCaptor<EmailVerificationToken> stored = ArgumentCaptor.forClass(EmailVerificationToken.class);
        order.verify(tokens).save(stored.capture());
        ArgumentCaptor<DonorEmailVerificationRequested> published = ArgumentCaptor.forClass(DonorEmailVerificationRequested.class);
        order.verify(events).publishEvent(published.capture());
        DonorEmailVerificationRequested event = published.getValue();
        assertThat(event.secret().hash()).isEqualTo(stored.getValue().secretHash());
        assertThat(event.donorId()).isEqualTo(DONOR.value());
        assertThat(event.email()).isEqualTo(EMAIL);
        assertThat(event.preferredLocale()).isEqualTo(LocaleCode.EN);
        assertThat(event.expiresAt()).isEqualTo(NOW.plus(TTL)).isEqualTo(stored.getValue().expiresAt());
        assertThat(stored.getValue().donorId()).isEqualTo(DONOR);
        assertThat(stored.getValue().issuedAt()).isEqualTo(NOW);
        assertThat(event.toString()).doesNotContain(event.secret().value());
        verifyNoInteractions(sessions);
    }

    @Test
    @DisplayName("Given a donor holding three live links, when a link is issued, then nothing is stored and nothing is published")
    void should_store_and_publish_nothing_when_link_issued_given_three_live_links() {
        when(tokens.countOf(DONOR)).thenReturn(3);

        service.issueLink(unverifiedDonor(LocaleCode.CS));

        verify(tokens).deleteUnusableOf(DONOR, NOW);
        verify(tokens, never()).save(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given an address no donor has, when a verification is requested, then nothing is stored and nothing is published")
    void should_store_and_publish_nothing_when_requested_given_unknown_email() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());

        service.requestVerification(EMAIL);

        verifyNoInteractions(tokens, events, sessions);
    }

    @Test
    @DisplayName("Given a verified donor, when a verification is requested, then nothing is stored and nothing is published")
    void should_store_and_publish_nothing_when_requested_given_verified_donor() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(verifiedDonor()));

        service.requestVerification(EMAIL);

        verifyNoInteractions(tokens, events, sessions);
    }

    @Test
    @DisplayName("Given an unverified donor, when a verification is requested, then a new link is stored and published")
    void should_issue_link_when_requested_given_unverified_donor() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(unverifiedDonor(LocaleCode.CS)));
        when(tokens.countOf(DONOR)).thenReturn(0);

        service.requestVerification(EMAIL);

        verify(tokens).save(any(EmailVerificationToken.class));
        verify(events).publishEvent(any(DonorEmailVerificationRequested.class));
    }

    @Test
    @DisplayName("Given a malformed token, when the e-mail is confirmed, then it is refused before any lookup")
    void should_refuse_before_lookup_when_confirmed_given_malformed_token() {
        assertThatIllegalArgumentException().isThrownBy(() -> service.confirm("not.a.token"));

        verifyNoInteractions(tokens, donors, sessions, events);
    }

    @Test
    @DisplayName("Given an unknown token, when the e-mail is confirmed, then it is invalid and nothing changes")
    void should_be_invalid_when_confirmed_given_unknown_token() {
        LinkSecret secret = LinkSecret.generate();
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.confirm(secret.value())).isInstanceOf(InvalidEmailVerificationToken.class);

        verify(tokens, never()).markUsed(any(), any());
        verifyNoInteractions(donors, sessions, events);
    }

    @Test
    @DisplayName("Given an expired token, when the e-mail is confirmed, then it is invalid and nothing changes")
    void should_be_invalid_when_confirmed_given_expired_token() {
        LinkSecret secret = LinkSecret.generate();
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(EmailVerificationToken.issue(secret, DONOR, NOW.minus(TTL), TTL)));

        assertThatThrownBy(() -> service.confirm(secret.value())).isInstanceOf(InvalidEmailVerificationToken.class);

        verify(tokens, never()).markUsed(any(), any());
        verifyNoInteractions(donors, sessions, events);
    }

    @Test
    @DisplayName("Given a used token, when the e-mail is confirmed, then it is invalid and nothing changes")
    void should_be_invalid_when_confirmed_given_used_token() {
        LinkSecret secret = LinkSecret.generate();
        EmailVerificationToken used = EmailVerificationToken.issue(secret, DONOR, NOW.minusSeconds(60), TTL);
        used.markUsed(NOW.minusSeconds(30));
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(used));

        assertThatThrownBy(() -> service.confirm(secret.value())).isInstanceOf(InvalidEmailVerificationToken.class);

        verify(tokens, never()).markUsed(any(), any());
        verifyNoInteractions(donors, sessions, events);
    }

    @Test
    @DisplayName("Given a concurrent confirm that won the token, when the e-mail is confirmed, then it is invalid and nothing changes")
    void should_be_invalid_and_change_nothing_when_confirmed_given_lost_race() {
        LinkSecret secret = LinkSecret.generate();
        EmailVerificationToken token = EmailVerificationToken.issue(secret, DONOR, NOW.minusSeconds(60), TTL);
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(token));
        when(tokens.markUsed(token.id(), NOW)).thenReturn(false);

        assertThatThrownBy(() -> service.confirm(secret.value())).isInstanceOf(InvalidEmailVerificationToken.class);

        verify(tokens, never()).deleteAllOf(any());
        verifyNoInteractions(donors, sessions, events);
    }

    @Test
    @DisplayName("Given a won token whose donor is gone or already verified, when the e-mail is confirmed, then it is invalid")
    void should_be_invalid_when_confirmed_given_missing_or_verified_donor() {
        LinkSecret secret = LinkSecret.generate();
        EmailVerificationToken token = EmailVerificationToken.issue(secret, DONOR, NOW.minusSeconds(60), TTL);
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(token));
        when(tokens.markUsed(token.id(), NOW)).thenReturn(true);
        when(donors.findById(DONOR)).thenReturn(Optional.empty(), Optional.of(verifiedDonor()));

        assertThatThrownBy(() -> service.confirm(secret.value())).isInstanceOf(InvalidEmailVerificationToken.class);
        assertThatThrownBy(() -> service.confirm(secret.value())).isInstanceOf(InvalidEmailVerificationToken.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(sessions, events);
    }

    @Test
    @DisplayName("Given a live token, when the e-mail is confirmed, then the donor is verified now, every link of the donor goes, DonorRegistered is published and a session opens")
    void should_verify_publish_and_open_session_when_confirmed_given_live_token() {
        LinkSecret secret = LinkSecret.generate();
        EmailVerificationToken token = EmailVerificationToken.issue(secret, DONOR, NOW.minusSeconds(60), TTL);
        Donor donor = unverifiedDonor(LocaleCode.CS);
        when(tokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(token));
        when(tokens.markUsed(token.id(), NOW)).thenReturn(true);
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(sessions.open(DONOR, Set.of(Role.DONOR))).thenReturn(TOKENS);

        AuthenticatedDonor result = service.confirm(secret.value());

        InOrder order = inOrder(donors, tokens, events, sessions);
        ArgumentCaptor<Donor> saved = ArgumentCaptor.forClass(Donor.class);
        order.verify(donors).save(saved.capture());
        order.verify(tokens).deleteAllOf(DONOR);
        order.verify(events).publishEvent(new DonorRegistered(DONOR.value(), DonorType.PERSON, "Jana Nováková", Optional.empty(), ADDRESS, EMAIL,
                SYMBOL, LocaleCode.CS, donor.registeredAt()));
        order.verify(sessions).open(DONOR, Set.of(Role.DONOR));
        assertThat(saved.getValue().emailVerifiedAt()).contains(NOW);
        assertThat(result.donor().email()).isEqualTo("jana@example.cz");
        assertThat(result.tokens()).isEqualTo(TOKENS);
    }

    private static Donor unverifiedDonor(LocaleCode locale) {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, new PasswordHash("$hash"), SYMBOL, locale,
                NOW.minusSeconds(60));
    }

    private static Donor verifiedDonor() {
        Donor donor = unverifiedDonor(LocaleCode.CS);
        donor.verifyEmail(NOW.minusSeconds(30));
        return donor;
    }
}
