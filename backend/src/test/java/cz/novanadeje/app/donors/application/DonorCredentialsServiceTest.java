package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorEmailAddressInUse;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailUnchanged;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.PasswordTooWeak;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.Role;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorCredentialsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(60));
    private static final DonorId OTHER = DonorId.newId(NOW.minusSeconds(120));
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final EmailAddress NEW_EMAIL = new EmailAddress("jana.nova@example.cz");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final VariableSymbol SYMBOL = new VariableSymbol("4821937560");
    private static final String CURRENT = "correct horse battery";
    private static final String NEXT = "a brand new passphrase";
    private static final PasswordHash OLD_HASH = new PasswordHash("$old");
    private static final PasswordHash NEW_HASH = new PasswordHash("$new");
    private static final IssuedTokens TOKENS = new IssuedTokens("access", NOW.plus(Duration.ofMinutes(15)), "refresh", NOW.plus(Duration.ofDays(14)));

    @Mock
    private DonorRepository donors;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private DonorSessionService sessions;
    @Mock
    private DonorEmailVerificationService emailVerification;
    @Mock
    private ApplicationEventPublisher events;

    private DonorCredentialsService service;

    @BeforeEach
    void setUp() {
        service = new DonorCredentialsService(donors, passwordHasher, refreshTokens, sessions, emailVerification, events,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given the right current password, when the password is changed, then the new hash is stored, every session is revoked and a new one opens")
    void should_store_hash_revoke_sessions_and_open_one_when_password_changed_given_right_current_password() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);
        when(passwordHasher.hash(new RawPassword(NEXT))).thenReturn(NEW_HASH);
        when(sessions.open(DONOR, Set.of(Role.DONOR))).thenReturn(TOKENS);

        AuthenticatedDonor result = service.changePassword(DONOR, CURRENT, NEXT);

        InOrder order = inOrder(donors, refreshTokens, sessions);
        order.verify(donors).save(donor);
        order.verify(refreshTokens).revokeAllOf(DONOR, NOW);
        order.verify(sessions).open(DONOR, Set.of(Role.DONOR));
        assertThat(donor.passwordHash()).isEqualTo(NEW_HASH);
        assertThat(result.tokens()).isEqualTo(TOKENS);
        assertThat(result.donor().email()).isEqualTo("jana@example.cz");
    }

    @Test
    @DisplayName("Given a wrong or malformed current password, when the password is changed, then it is refused as a wrong password and nothing changes")
    void should_refuse_and_change_nothing_when_password_changed_given_wrong_current_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword("wrong horse battery"), OLD_HASH)).thenReturn(false);

        assertThatThrownBy(() -> service.changePassword(DONOR, "wrong horse battery", NEXT)).isInstanceOf(WrongPassword.class);
        assertThatThrownBy(() -> service.changePassword(DONOR, "short", NEXT)).isInstanceOf(WrongPassword.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(refreshTokens, sessions);
    }

    @Test
    @DisplayName("Given the right current password and a weak new one, when the password is changed, then the password rule is reported and nothing changes")
    void should_report_weak_password_and_change_nothing_when_password_changed_given_common_new_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.changePassword(DONOR, CURRENT, "password1234")).isInstanceOf(PasswordTooWeak.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(refreshTokens, sessions);
    }

    @Test
    @DisplayName("Given an unknown donor, when the password is changed, then the donor is not found")
    void should_report_not_found_when_password_changed_given_unknown_donor() {
        when(donors.findById(DONOR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.changePassword(DONOR, CURRENT, NEXT)).isInstanceOf(DonorNotFound.class);

        verifyNoInteractions(passwordHasher, refreshTokens, sessions);
    }

    @Test
    @DisplayName("Given a free new address and the right password, when an e-mail change is requested, then a change link is issued")
    void should_issue_change_link_when_email_change_requested_given_free_address() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);
        when(donors.findByEmail(NEW_EMAIL)).thenReturn(Optional.empty());

        service.requestEmailChange(DONOR, CURRENT, NEW_EMAIL);

        verify(emailVerification).issueChangeLink(donor, NEW_EMAIL);
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a new address another donor has, when an e-mail change is requested, then that donor is told and no link is issued")
    void should_tell_owner_and_issue_nothing_when_email_change_requested_given_taken_address() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);
        when(donors.findByEmail(NEW_EMAIL)).thenReturn(Optional.of(Donor.register(OTHER, DonorType.PERSON, "Petr Novák", null, ADDRESS, NEW_EMAIL,
                new PasswordHash("$other"), new VariableSymbol("1234567890"), LocaleCode.EN, NOW.minusSeconds(120))));

        service.requestEmailChange(DONOR, CURRENT, NEW_EMAIL);

        verify(events).publishEvent(new DonorEmailAddressInUse(OTHER.value(), NEW_EMAIL, LocaleCode.EN));
        verifyNoInteractions(emailVerification);
    }

    @Test
    @DisplayName("Given the address the account already has, when an e-mail change is requested, then it is refused as unchanged")
    void should_refuse_when_email_change_requested_given_same_address() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.requestEmailChange(DONOR, CURRENT, new EmailAddress("Jana@Example.cz"))).isInstanceOf(EmailUnchanged.class);

        verifyNoInteractions(emailVerification, events);
    }

    @Test
    @DisplayName("Given a wrong password, when an e-mail change is requested, then it is refused before the address is looked at")
    void should_refuse_before_lookup_when_email_change_requested_given_wrong_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword("wrong horse battery"), OLD_HASH)).thenReturn(false);

        assertThatThrownBy(() -> service.requestEmailChange(DONOR, "wrong horse battery", NEW_EMAIL)).isInstanceOf(WrongPassword.class);

        verify(donors, never()).findByEmail(any());
        verifyNoInteractions(emailVerification, events);
    }

    private static Donor donor() {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, OLD_HASH, SYMBOL, LocaleCode.CS,
                NOW.minusSeconds(60));
        donor.verifyEmail(NOW.minusSeconds(30));
        return donor;
    }
}
