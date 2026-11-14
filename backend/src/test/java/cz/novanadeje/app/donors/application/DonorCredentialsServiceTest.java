package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.infrastructure.security.CommonPasswordList;
import cz.novanadeje.app.shared.infrastructure.json.RowVersionsFixture;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.SessionEnded;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import java.util.UUID;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.application.event.DonorPasswordChanged;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.EmailUnchanged;
import cz.novanadeje.app.donors.domain.LastSignInMethod;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.PasswordTooWeak;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
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
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorCredentialsServiceTest {

    private static final RequestingDevice DEVICE = new RequestingDevice(Optional.of(new DeviceId(UUID.fromString("019a5a3c-0000-7000-8000-00000000000d"))),
            DeviceDescription.UNKNOWN);

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(60));
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final EmailAddress NEW_EMAIL = new EmailAddress("jana.nova@example.cz");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final VariableSymbol SYMBOL = new VariableSymbol("4821937560");
    private static final String CURRENT = "correct horse battery";
    private static final String NEXT = "a brand new passphrase";
    private static final PasswordHash OLD_HASH = new PasswordHash("$old");
    private static final PasswordHash NEW_HASH = new PasswordHash("$new");
    private static final IssuedTokens TOKENS = new IssuedTokens("access", NOW.plus(Duration.ofMinutes(15)), "refresh", NOW.plus(Duration.ofDays(14)),
            Set.of(Role.DONOR), SessionKind.REMEMBERED);

    @Mock
    private DonorRepository donors;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private DeviceSignOuts signOuts;
    @Mock
    private DonorSessionService sessions;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private DonorEmailVerificationService emailVerification;
    @Mock
    private EmailVerificationTokenRepository verificationTokens;
    @Mock
    private ApplicationEventPublisher events;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private PasskeyChallengeRepository challenges;
    @Mock
    private PasskeyCeremonies ceremonies;

    private final OpenTransactions transactions = new OpenTransactions();
    private DonorCredentialsService service;

    @BeforeEach
    void setUp() {
        service = new DonorCredentialsService(donors, passwordHasher, CommonPasswordList.policy(),
                new DonorConfirmations(passwordHasher, CommonPasswordList.policy(), passkeys, challenges, ceremonies, transactions, Clock.fixed(NOW, ZoneOffset.UTC)), passkeys, sessions, new DonorViews(secondFactors, verificationTokens, Clock.fixed(NOW, ZoneOffset.UTC), new ProfileVersions(RowVersionsFixture.canonical())), emailVerification, events,
                Clock.fixed(NOW, ZoneOffset.UTC), signOuts, transactions);
    }

    @Test
    @DisplayName("Given the right current password, when the password is changed, then the new hash is stored, every other device is signed out, the donor is told and the session continues on this one")
    void should_store_hash_revoke_sessions_and_open_one_when_password_changed_given_right_current_password() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);
        when(passwordHasher.hash(new RawPassword(NEXT))).thenReturn(NEW_HASH);
        when(sessions.continueOn(donor, false, DEVICE)).thenReturn(TOKENS);

        AuthenticatedDonor result = service.changePassword(DONOR, false, Confirmation.withPassword(CURRENT), NEXT, DEVICE);

        InOrder order = inOrder(donors, signOuts, sessions);
        order.verify(donors).save(donor);
        order.verify(signOuts).endAllOf(DONOR, DEVICE.session(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
        order.verify(sessions).continueOn(donor, false, DEVICE);
        assertThat(donor.passwordHash()).contains(NEW_HASH);
        assertThat(result.tokens()).isEqualTo(TOKENS);
        assertThat(result.donor().email()).isEqualTo("jana@example.cz");
        verify(events).publishEvent(new DonorPasswordChanged(DONOR.value(), donor.email(), donor.preferredLocale()));
    }

    @Test
    @DisplayName("Given a wrong or malformed current password, when the password is changed, then it is refused as a wrong password and nothing changes")
    void should_refuse_and_change_nothing_when_password_changed_given_wrong_current_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword("wrong horse battery"), OLD_HASH)).thenReturn(false);

        assertThatThrownBy(() -> service.changePassword(DONOR, false, Confirmation.withPassword("wrong horse battery"), NEXT, DEVICE)).isInstanceOf(WrongPassword.class);
        assertThatThrownBy(() -> service.changePassword(DONOR, false, Confirmation.withPassword("short"), NEXT, DEVICE)).isInstanceOf(WrongPassword.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(signOuts, sessions);
    }

    @Test
    @DisplayName("Given the right current password and a weak new one, when the password is changed, then the password rule is reported and nothing changes")
    void should_report_weak_password_and_change_nothing_when_password_changed_given_common_new_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.changePassword(DONOR, false, Confirmation.withPassword(CURRENT), "password1234", DEVICE)).isInstanceOf(PasswordTooWeak.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(signOuts, sessions);
    }

    @Test
    @DisplayName("Given a session that has ended, when the password is changed or removed, then it is refused as ended before anything is stored, signed out or announced")
    void should_refuse_as_ended_and_change_nothing_when_password_changed_or_removed_given_ended_session() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);
        when(passkeys.countByDonor(DONOR)).thenReturn(1);
        doThrow(new SessionEnded()).when(sessions).requireLasting(donor, DEVICE);

        assertThatThrownBy(() -> service.changePassword(DONOR, false, Confirmation.withPassword(CURRENT), NEXT, DEVICE)).isInstanceOf(SessionEnded.class);
        assertThat(donor.passwordHash()).contains(OLD_HASH);
        assertThatThrownBy(() -> service.removePassword(DONOR, false, Confirmation.withPassword(CURRENT), DEVICE)).isInstanceOf(SessionEnded.class);

        verify(donors, never()).save(any());
        verify(sessions, never()).continueOn(any(), anyBoolean(), any());
        verifyNoInteractions(signOuts, events);
    }

    @Test
    @DisplayName("Given an unknown donor, when the password is changed, then the donor is not found")
    void should_report_not_found_when_password_changed_given_unknown_donor() {
        when(donors.findById(DONOR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.changePassword(DONOR, false, Confirmation.withPassword(CURRENT), NEXT, DEVICE)).isInstanceOf(DonorNotFound.class);

        verifyNoInteractions(passwordHasher, signOuts, sessions);
    }

    @Test
    @DisplayName("Given a passkey and the right password, when the password is removed, then it is gone, every other device is signed out and the session continues on this one")
    void should_remove_password_revoke_sessions_and_open_one_when_removed_given_passkey() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);
        when(passkeys.countByDonor(DONOR)).thenReturn(1);
        when(sessions.continueOn(donor, true, DEVICE)).thenReturn(TOKENS);

        AuthenticatedDonor result = service.removePassword(DONOR, true, Confirmation.withPassword(CURRENT), DEVICE);

        assertThat(donor.hasPassword()).isFalse();
        InOrder order = inOrder(donors, signOuts, sessions);
        order.verify(donors).save(donor);
        order.verify(signOuts).endAllOf(DONOR, DEVICE.session(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
        order.verify(sessions).continueOn(donor, true, DEVICE);
        assertThat(result.tokens()).isEqualTo(TOKENS);
    }

    @Test
    @DisplayName("Given no passkey, when the password is removed, then it is refused as the last way to sign in and kept")
    void should_refuse_when_password_removed_given_no_passkey() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);
        when(passkeys.countByDonor(DONOR)).thenReturn(0);

        assertThatThrownBy(() -> service.removePassword(DONOR, false, Confirmation.withPassword(CURRENT), DEVICE)).isInstanceOf(LastSignInMethod.class);

        assertThat(donor.hasPassword()).isTrue();
        verify(donors, never()).save(any());
        verifyNoInteractions(signOuts, sessions);
    }

    @Test
    @DisplayName("Given a new address and the right password, when an e-mail change is requested, then a change link is issued for it")
    void should_issue_change_link_when_email_change_requested_given_new_address() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);

        service.requestEmailChange(DONOR, Confirmation.withPassword(CURRENT), NEW_EMAIL);

        verify(emailVerification).issueChangeLink(donor, NEW_EMAIL);
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a signed-in donor, when the e-mail change link is sent again, then the pending change is sent again without any password")
    void should_resend_pending_change_when_email_change_resent_given_signed_in_donor() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));

        service.resendEmailChange(DONOR);

        verify(emailVerification).resendChangeLink(donor);
        verifyNoInteractions(passwordHasher, events);
    }

    @Test
    @DisplayName("Given a signed-in donor, when the e-mail change is cancelled, then the pending change is cancelled")
    void should_cancel_pending_change_when_email_change_cancelled_given_signed_in_donor() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));

        service.cancelEmailChange(DONOR);

        verify(emailVerification).cancelChange(donor);
        verifyNoInteractions(passwordHasher, events);
    }

    @Test
    @DisplayName("Given an unknown donor, when the e-mail change link is sent again, then the donor is not found and nothing is sent")
    void should_refuse_when_email_change_resent_given_unknown_donor() {
        when(donors.findById(DONOR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resendEmailChange(DONOR)).isInstanceOf(DonorNotFound.class);

        verifyNoInteractions(emailVerification);
    }

    @Test
    @DisplayName("Given the address the account already has, when an e-mail change is requested, then it is refused as unchanged")
    void should_refuse_when_email_change_requested_given_same_address() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.requestEmailChange(DONOR, Confirmation.withPassword(CURRENT), new EmailAddress("Jana@Example.cz"))).isInstanceOf(EmailUnchanged.class);

        verifyNoInteractions(emailVerification, events);
    }

    @Test
    @DisplayName("Given a wrong password, when an e-mail change is requested, then it is refused before the address is looked at")
    void should_refuse_before_lookup_when_email_change_requested_given_wrong_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword("wrong horse battery"), OLD_HASH)).thenReturn(false);

        assertThatThrownBy(() -> service.requestEmailChange(DONOR, Confirmation.withPassword("wrong horse battery"), NEW_EMAIL)).isInstanceOf(WrongPassword.class);

        verify(donors, never()).findByEmail(any());
        verifyNoInteractions(emailVerification, events);
    }

    @Test
    @DisplayName("Given the right current password, when the password is changed, then both hashings run with no transaction open and the change is written in one transaction")
    void should_hash_outside_transaction_and_write_in_one_when_password_changed_given_right_current_password() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(donors.findByIdForUpdate(DONOR)).thenAnswer(invocation -> {
            assertThat(transactions.open()).isEqualTo(1);
            return Optional.of(donor);
        });
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenAnswer(invocation -> transactions.recordingHashing(true));
        when(passwordHasher.hash(new RawPassword(NEXT))).thenAnswer(invocation -> transactions.recordingHashing(NEW_HASH));
        when(sessions.continueOn(donor, false, DEVICE)).thenReturn(TOKENS);

        service.changePassword(DONOR, false, Confirmation.withPassword(CURRENT), NEXT, DEVICE);

        assertThat(transactions.openWhenHashing()).containsExactly(0, 0);
        assertThat(transactions.open()).isZero();
        assertThat(donor.passwordHash()).contains(NEW_HASH);
    }

    @Test
    @DisplayName("Given a password changed by another request after the current one was compared, when the password is changed or removed, then it is refused as a wrong password and nothing is written")
    void should_refuse_and_write_nothing_when_password_changed_or_removed_given_hash_changed_since_comparison() {
        Donor changedMeanwhile = donor();
        changedMeanwhile.changePassword(new PasswordHash("$meanwhile"));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(donors.findByIdForUpdate(DONOR)).thenReturn(Optional.of(changedMeanwhile));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenReturn(true);
        when(passwordHasher.hash(new RawPassword(NEXT))).thenReturn(NEW_HASH);

        assertThatThrownBy(() -> service.changePassword(DONOR, false, Confirmation.withPassword(CURRENT), NEXT, DEVICE)).isInstanceOf(WrongPassword.class);
        assertThatThrownBy(() -> service.removePassword(DONOR, false, Confirmation.withPassword(CURRENT), DEVICE)).isInstanceOf(WrongPassword.class);

        assertThat(changedMeanwhile.passwordHash()).contains(new PasswordHash("$meanwhile"));
        verify(donors, never()).save(any());
        verifyNoInteractions(signOuts, sessions, events);
    }

    @Test
    @DisplayName("Given the right password, when an e-mail change is requested, then the password is compared with no transaction open, and a password changed since then is refused before a link is issued")
    void should_compare_outside_transaction_and_refuse_changed_password_when_email_change_requested() {
        Donor changedMeanwhile = donor();
        changedMeanwhile.changePassword(new PasswordHash("$meanwhile"));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()), Optional.of(donor()), Optional.of(donor()), Optional.of(changedMeanwhile));
        when(passwordHasher.matches(new RawPassword(CURRENT), OLD_HASH)).thenAnswer(invocation -> transactions.recordingHashing(true));

        service.requestEmailChange(DONOR, Confirmation.withPassword(CURRENT), NEW_EMAIL);
        assertThatThrownBy(() -> service.requestEmailChange(DONOR, Confirmation.withPassword(CURRENT), NEW_EMAIL)).isInstanceOf(WrongPassword.class);

        assertThat(transactions.openWhenHashing()).containsExactly(0, 0);
        verify(emailVerification).issueChangeLink(any(), any());
    }

    private static Donor donor() {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL, OLD_HASH, SYMBOL, LocaleCode.CS,
                NOW.minusSeconds(60));
        donor.verifyEmail(NOW.minusSeconds(30));
        return donor;
    }
}
