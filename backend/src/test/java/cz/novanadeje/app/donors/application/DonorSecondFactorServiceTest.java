package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.infrastructure.security.CommonPasswordList;
import cz.novanadeje.app.shared.infrastructure.json.RowVersionsFixture;
import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.SessionEnded;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import java.util.UUID;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorDisabled;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorEnabled;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasskeyChallengeRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorAlreadyEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorNotEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorNotPending;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.SecondFactorSessionRequired;
import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
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
class DonorSecondFactorServiceTest {

    private static final RequestingDevice DEVICE = new RequestingDevice(Optional.of(new DeviceId(UUID.fromString("019a5a3c-0000-7000-8000-00000000000d"))),
            DeviceDescription.UNKNOWN);

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minusSeconds(60));
    private static final PasswordHash HASH = new PasswordHash("$hash");
    private static final String PASSWORD = "correct horse battery";
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    private static final IssuedTokens TOKENS = new IssuedTokens("access", NOW.plus(Duration.ofMinutes(15)), "refresh", NOW.plus(Duration.ofDays(14)),
            Set.of(Role.DONOR), SessionKind.REMEMBERED);

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private EmailVerificationTokenRepository verificationTokens;
    @Mock
    private DeviceSignOuts signOuts;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private DonorSessionService sessions;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private PasskeyChallengeRepository challenges;
    @Mock
    private PasskeyCeremonies ceremonies;
    @Mock
    private ApplicationEventPublisher events;
    @Mock
    private WrongSecondFactorCodeCount wrongCodes;

    private final OpenTransactions transactions = new OpenTransactions();
    private DonorSecondFactorService service;

    @BeforeEach
    void setUp() {
        service = new DonorSecondFactorService(donors, secondFactors, new DonorConfirmations(passwordHasher, CommonPasswordList.policy(), passkeys, challenges, ceremonies, transactions, Clock.fixed(NOW, ZoneOffset.UTC)), sessions, new DonorViews(secondFactors, verificationTokens, Clock.fixed(NOW, ZoneOffset.UTC), new ProfileVersions(RowVersionsFixture.canonical())),
                new SecondFactorSessionGuard(secondFactors, passkeys),
                new DonorSecondFactorProperties(Duration.ofMinutes(5), 5, "Nová naděje", Duration.ofDays(14)), events, Clock.fixed(NOW, ZoneOffset.UTC), signOuts,
                new SecondFactorCodes(secondFactors, wrongCodes), transactions);
    }

    @Test
    @DisplayName("Given the right password and no factor yet, when the set-up begins, then a pending factor is stored and the secret comes back as text and URI")
    void should_store_pending_factor_and_return_secret_when_setup_begun_given_right_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.empty());

        SecondFactorEnrolment enrolment = service.begin(DONOR, false, Confirmation.withPassword(PASSWORD));

        ArgumentCaptor<SecondFactor> stored = ArgumentCaptor.forClass(SecondFactor.class);
        verify(secondFactors).save(stored.capture());
        assertThat(stored.getValue().isEnabled()).isFalse();
        assertThat(stored.getValue().createdAt()).isEqualTo(NOW);
        assertThat(stored.getValue().secret().value()).isEqualTo(enrolment.secret());
        assertThat(enrolment.otpauthUri())
                .isEqualTo("otpauth://totp/Nov%C3%A1%20nad%C4%9Bje:jana%40example.cz?secret=" + enrolment.secret()
                        + "&issuer=Nov%C3%A1%20nad%C4%9Bje&algorithm=SHA1&digits=6&period=30");
        verifyNoInteractions(sessions, signOuts, events);
    }

    @Test
    @DisplayName("Given an administrator with a passkey in a session opened with the password only, when the set-up begins, then it is refused and nothing is stored")
    void should_refuse_setup_when_begun_in_password_session_given_administrator_with_passkey() {
        Donor administrator = donor();
        administrator.grantAdministration(true);
        when(donors.findById(DONOR)).thenReturn(Optional.of(administrator));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.empty());
        when(passkeys.countByDonor(DONOR)).thenReturn(1);

        assertThatThrownBy(() -> service.begin(DONOR, false, Confirmation.withPassword(PASSWORD))).isInstanceOf(SecondFactorSessionRequired.class);

        verify(secondFactors, never()).save(any());
    }

    @Test
    @DisplayName("Given a pending factor from an earlier attempt, when the set-up begins again, then a fresh secret replaces it")
    void should_replace_pending_factor_when_setup_begun_given_earlier_attempt() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(SecondFactor.enrol(DONOR, SECRET, NOW.minusSeconds(600))));

        SecondFactorEnrolment enrolment = service.begin(DONOR, false, Confirmation.withPassword(PASSWORD));

        assertThat(enrolment.secret()).isNotEqualTo(SECRET.value());
        verify(secondFactors).save(any());
    }

    @Test
    @DisplayName("Given an enabled factor, when the set-up begins, then it is refused as already enabled")
    void should_refuse_when_setup_begun_given_enabled_factor() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabledFactor()));

        assertThatThrownBy(() -> service.begin(DONOR, false, Confirmation.withPassword(PASSWORD))).isInstanceOf(SecondFactorAlreadyEnabled.class);

        verify(secondFactors, never()).save(any());
    }

    @Test
    @DisplayName("Given a wrong or malformed password, when the set-up begins, then it is refused as a wrong password before the factor is looked at")
    void should_refuse_when_setup_begun_given_wrong_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword("wrong horse battery"), HASH)).thenReturn(false);

        assertThatThrownBy(() -> service.begin(DONOR, false, Confirmation.withPassword("wrong horse battery"))).isInstanceOf(WrongPassword.class);
        assertThatThrownBy(() -> service.begin(DONOR, false, Confirmation.withPassword("short"))).isInstanceOf(WrongPassword.class);

        verifyNoInteractions(secondFactors);
    }

    @Test
    @DisplayName("Given an unknown donor, when the set-up begins, then the donor is not found")
    void should_report_not_found_when_setup_begun_given_unknown_donor() {
        when(donors.findById(DONOR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.begin(DONOR, false, Confirmation.withPassword(PASSWORD))).isInstanceOf(DonorNotFound.class);

        verifyNoInteractions(passwordHasher, secondFactors);
    }

    @Test
    @DisplayName("Given a pending factor and the current code, when it is confirmed, then the factor is enabled, every other device is signed out, a verified session continues on this one and the donor is to be told")
    void should_enable_revoke_sessions_and_open_verified_one_when_confirmed_given_pending_factor_and_right_code() {
        Donor donor = donor();
        SecondFactor factor = SecondFactor.enrol(DONOR, SECRET, NOW.minusSeconds(60));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(factor));
        when(sessions.continueOn(donor, true, DEVICE)).thenReturn(TOKENS);

        AuthenticatedDonor result = service.confirm(DONOR, codeAt(NOW), DEVICE);

        InOrder order = inOrder(secondFactors, signOuts, sessions);
        order.verify(secondFactors).save(factor);
        order.verify(signOuts).endAllOf(DONOR, DEVICE.session(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
        order.verify(sessions).continueOn(donor, true, DEVICE);
        assertThat(factor.isEnabled()).isTrue();
        assertThat(result.donor().secondFactor().enabled()).isTrue();
        assertThat(result.tokens()).isEqualTo(TOKENS);
        verify(events).publishEvent(new DonorSecondFactorEnabled(DONOR.value(), new EmailAddress("jana@example.cz"), LocaleCode.CS));
    }

    @Test
    @DisplayName("Given a session that has ended, when a pending factor is confirmed or an enabled one disabled with the right code, then it is refused as ended before the factor is stored or deleted, any device is signed out or the donor is told")
    void should_refuse_as_ended_and_change_nothing_when_confirmed_or_disabled_given_ended_session() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(SecondFactor.enrol(DONOR, SECRET, NOW.minusSeconds(60))), Optional.of(enabledFactor()));
        doThrow(new SessionEnded()).when(sessions).requireLasting(donor, DEVICE);
        when(secondFactors.recordUse(any())).thenReturn(true);

        assertThatThrownBy(() -> service.confirm(DONOR, codeAt(NOW), DEVICE)).isInstanceOf(SessionEnded.class);
        assertThatThrownBy(() -> service.disable(DONOR, Confirmation.withPassword(PASSWORD), codeAt(NOW), DEVICE)).isInstanceOf(SessionEnded.class);

        verify(secondFactors, never()).save(any());
        verify(secondFactors, never()).delete(any());
        verify(sessions, never()).continueOn(any(), anyBoolean(), any());
        verifyNoInteractions(signOuts, events);
    }

    @Test
    @DisplayName("Given a pending factor and a wrong code, when it is confirmed, then the code is rejected and the factor stays pending")
    void should_reject_code_and_keep_pending_when_confirmed_given_wrong_code() {
        SecondFactor factor = SecondFactor.enrol(DONOR, SECRET, NOW.minusSeconds(60));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(factor));

        assertThatThrownBy(() -> service.confirm(DONOR, "000000", DEVICE)).isInstanceOf(SecondFactorCodeRejected.class);

        assertThat(factor.isEnabled()).isFalse();
        verify(secondFactors, never()).save(any());
        verifyNoInteractions(signOuts, sessions, events);
    }

    @Test
    @DisplayName("Given no pending factor or an enabled one, when it is confirmed, then it is refused as not pending or already enabled")
    void should_refuse_when_confirmed_given_no_pending_factor() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.empty(), Optional.of(enabledFactor()));

        assertThatThrownBy(() -> service.confirm(DONOR, codeAt(NOW), DEVICE)).isInstanceOf(SecondFactorNotPending.class);
        assertThatThrownBy(() -> service.confirm(DONOR, codeAt(NOW), DEVICE)).isInstanceOf(SecondFactorAlreadyEnabled.class);

        verifyNoInteractions(signOuts, sessions, events);
    }

    @Test
    @DisplayName("Given an enabled factor, the right password and a fresh code, when it is disabled, then the factor is deleted, every other device is signed out, a plain session continues on this one and the donor is to be told")
    void should_delete_factor_revoke_sessions_and_open_plain_one_when_disabled_given_right_password_and_code() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabledFactor()), Optional.empty());
        when(secondFactors.recordUse(any())).thenReturn(true);
        when(sessions.continueOn(donor, false, DEVICE)).thenReturn(TOKENS);

        AuthenticatedDonor result = service.disable(DONOR, Confirmation.withPassword(PASSWORD), codeAt(NOW), DEVICE);

        InOrder order = inOrder(secondFactors, signOuts, sessions);
        order.verify(secondFactors).delete(DONOR);
        order.verify(signOuts).endAllOf(DONOR, DEVICE.session(), DeviceSignOutReason.CREDENTIALS_CHANGED, NOW);
        order.verify(sessions).continueOn(donor, false, DEVICE);
        assertThat(result.donor().secondFactor().enabled()).isFalse();
        verify(events).publishEvent(new DonorSecondFactorDisabled(DONOR.value(), new EmailAddress("jana@example.cz"), LocaleCode.CS));
    }

    @Test
    @DisplayName("Given an enabled factor and a wrong or already used code, when it is disabled, then the code is rejected and the factor stays")
    void should_reject_code_and_keep_factor_when_disabled_given_wrong_code() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabledFactor()),
                Optional.of(SecondFactor.reconstitute(DONOR, SECRET, NOW.minusSeconds(600), NOW.minusSeconds(600), Totp.stepAt(NOW))));

        assertThatThrownBy(() -> service.disable(DONOR, Confirmation.withPassword(PASSWORD), "000000", DEVICE)).isInstanceOf(SecondFactorCodeRejected.class);
        assertThatThrownBy(() -> service.disable(DONOR, Confirmation.withPassword(PASSWORD), codeAt(NOW), DEVICE)).isInstanceOf(SecondFactorCodeRejected.class);

        verify(secondFactors, never()).delete(any());
        verifyNoInteractions(signOuts, sessions, events);
    }

    @Test
    @DisplayName("Given no enabled factor, when it is disabled, then it is refused as not enabled")
    void should_refuse_when_disabled_given_no_enabled_factor() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(SecondFactor.enrol(DONOR, SECRET, NOW)));

        assertThatThrownBy(() -> service.disable(DONOR, Confirmation.withPassword(PASSWORD), codeAt(NOW), DEVICE)).isInstanceOf(SecondFactorNotEnabled.class);

        verify(secondFactors, never()).delete(any());
        verify(sessions, never()).signIn(any(), anyBoolean(), any(), any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a wrong password, when it is disabled, then it is refused before the factor or the code is looked at")
    void should_refuse_before_lookup_when_disabled_given_wrong_password() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword("wrong horse battery"), HASH)).thenReturn(false);

        assertThatThrownBy(() -> service.disable(DONOR, Confirmation.withPassword("wrong horse battery"), codeAt(NOW), DEVICE)).isInstanceOf(WrongPassword.class);

        verifyNoInteractions(secondFactors, signOuts, sessions, events);
    }

    @Test
    @DisplayName("Given the right password, when the set-up begins or the factor is disabled, then the password is compared with no transaction open and the change is written in one")
    void should_compare_outside_transaction_when_begun_or_disabled_given_right_password() {
        Donor donor = donor();
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenAnswer(invocation -> transactions.recordingHashing(true));
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.empty(), Optional.of(enabledFactor()), Optional.empty());
        when(secondFactors.recordUse(any())).thenReturn(true);
        when(sessions.continueOn(donor, false, DEVICE)).thenReturn(TOKENS);

        service.begin(DONOR, false, Confirmation.withPassword(PASSWORD));
        service.disable(DONOR, Confirmation.withPassword(PASSWORD), codeAt(NOW), DEVICE);

        assertThat(transactions.openWhenHashing()).containsExactly(0, 0);
        assertThat(transactions.open()).isZero();
        assertThat(transactions.rolledBack()).isZero();
    }

    @Test
    @DisplayName("Given an enabled factor and a wrong code, when it is disabled, then the refusal commits, so the wrong code stays counted")
    void should_commit_refusal_when_disabled_given_wrong_code() {
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);
        when(secondFactors.findByDonor(DONOR)).thenReturn(Optional.of(enabledFactor()));

        assertThatThrownBy(() -> service.disable(DONOR, Confirmation.withPassword(PASSWORD), "000000", DEVICE)).isInstanceOf(SecondFactorCodeRejected.class);

        assertThat(transactions.rolledBack()).isZero();
        assertThat(transactions.committed()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a password changed by another request after it was compared, when the set-up begins or the factor is disabled, then it is refused as a wrong password and nothing is written")
    void should_refuse_and_write_nothing_when_begun_or_disabled_given_hash_changed_since_comparison() {
        Donor changedMeanwhile = donor();
        changedMeanwhile.changePassword(new PasswordHash("$meanwhile"));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()), Optional.of(changedMeanwhile), Optional.of(donor()), Optional.of(changedMeanwhile));
        when(passwordHasher.matches(new RawPassword(PASSWORD), HASH)).thenReturn(true);

        assertThatThrownBy(() -> service.begin(DONOR, false, Confirmation.withPassword(PASSWORD))).isInstanceOf(WrongPassword.class);
        assertThatThrownBy(() -> service.disable(DONOR, Confirmation.withPassword(PASSWORD), codeAt(NOW), DEVICE)).isInstanceOf(WrongPassword.class);

        verifyNoInteractions(secondFactors, signOuts, sessions, events, wrongCodes);
    }

    private static SecondFactor enabledFactor() {
        return SecondFactor.reconstitute(DONOR, SECRET, NOW.minusSeconds(600), NOW.minusSeconds(600), Totp.stepAt(NOW.minusSeconds(600)));
    }

    private static String codeAt(Instant at) {
        return Totp.codeAt(SECRET, Totp.stepAt(at));
    }

    private static Donor donor() {
        Donor donor = Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), HASH, new VariableSymbol("4821937560"), LocaleCode.CS, NOW.minusSeconds(60));
        donor.verifyEmail(NOW.minusSeconds(30));
        return donor;
    }
}
