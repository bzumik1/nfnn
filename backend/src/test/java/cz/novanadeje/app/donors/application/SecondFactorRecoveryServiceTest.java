package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.AdministratorSecondFactorRecovered;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorRecovered;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidSecondFactorChallenge;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorChallenge;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecovery;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryUnavailable;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryPaymentQr;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTarget;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTargets;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import cz.novanadeje.app.shared.domain.UuidV7;
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
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SecondFactorRecoveryServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");
    private static final Duration RECOVERY_TTL = Duration.ofDays(14);
    private static final DonorId JANA = DonorId.newId(NOW.minusSeconds(900));
    private static final DonorId PETR = DonorId.newId(NOW.minusSeconds(800));
    private static final DonorId EVA = DonorId.newId(NOW.minusSeconds(700));
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    private static final SecondFactorRecoveryCode CODE = new SecondFactorRecoveryCode("ABCD2345");
    private static final SecondFactorRecoveryTarget TARGET = new SecondFactorRecoveryTarget("5544332217/2010", "CZ2620100000005544332217",
            Money.czk(100), LocalDate.of(2026, 10, 27));
    private static final SecondFactorRecoveryPaymentQr PAYMENT_QR = new SecondFactorRecoveryPaymentQr(
            "SPD*1.0*ACC:CZ2620100000005544332217*AM:1.00*CC:CZK*MSG:OBNOVA ABCD2345", new QrMatrix(21, "0".repeat(21 * 21)));

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private SecondFactorChallengeRepository challenges;
    @Mock
    private SecondFactorRecoveryRepository recoveries;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private SecondFactorRecoveryTargets targets;
    @Mock
    private ApplicationEventPublisher events;

    private SecondFactorRecoveryService service;

    @BeforeEach
    void setUp() {
        service = new SecondFactorRecoveryService(donors, secondFactors, challenges, recoveries, refreshTokens, targets,
                new DonorSecondFactorProperties(Duration.ofMinutes(5), 5, "Nová naděje", RECOVERY_TTL), events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a sign-in waiting for the code of a donor with a verified account, when the recovery starts, then a new code replaces the open one and the instructions name the payment")
    void should_open_a_recovery_and_describe_the_payment_when_started_given_a_waiting_sign_in() {
        LinkSecret challenge = waitingSignIn(JANA);
        when(donors.findById(JANA)).thenReturn(Optional.of(donor(JANA, "Jana Nováková", "jana@example.cz", false)));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(enabledFactor(JANA)));
        when(targets.targetFor(JANA.value())).thenReturn(Optional.of(TARGET));
        when(recoveries.findOpenOf(JANA, NOW)).thenReturn(Optional.empty());
        when(targets.paymentQrFor(any())).thenReturn(PAYMENT_QR);

        SecondFactorRecoveryInstructions instructions = service.start(challenge.value());

        ArgumentCaptor<SecondFactorRecovery> opened = ArgumentCaptor.forClass(SecondFactorRecovery.class);
        verify(recoveries).replaceOpenOf(org.mockito.ArgumentMatchers.eq(JANA), opened.capture());
        assertThat(opened.getValue().donorId()).isEqualTo(JANA);
        assertThat(opened.getValue().expiresAt()).isEqualTo(NOW.plus(RECOVERY_TTL));
        assertThat(instructions.message()).matches("OBNOVA [A-HJ-NP-Z2-9]{8}");
        assertThat(new SecondFactorRecoveryCode(instructions.message().substring(7)).hash()).isEqualTo(opened.getValue().codeHash());
        assertThat(instructions.expiresAt()).isEqualTo(NOW.plus(RECOVERY_TTL));
        assertThat(instructions.accountNumber()).isEqualTo("5544332217/2010");
        assertThat(instructions.iban()).isEqualTo("CZ2620100000005544332217");
        assertThat(instructions.amount()).isEqualTo(Money.czk(100));
        assertThat(instructions.usableFrom()).contains(LocalDate.of(2026, 10, 27));
        assertThat(instructions.startedAt()).isEqualTo(NOW);
        assertThat(instructions.resumed()).isFalse();
        assertThat(instructions.paymentQr()).isEqualTo(PAYMENT_QR);
        verify(targets).paymentQrFor(new SecondFactorRecoveryCode(instructions.message().substring(7)));
        assertThat(instructions.toString()).doesNotContain(instructions.message());
        verify(challenges, never()).reserveAttempt(any(), any(), org.mockito.ArgumentMatchers.anyInt());
        verify(challenges, never()).markUsed(any(), any());
    }

    @Test
    @DisplayName("Given an account verified long enough ago, when the recovery starts, then the instructions name no later date")
    void should_name_no_date_when_started_given_an_account_usable_today() {
        LinkSecret challenge = waitingSignIn(JANA);
        when(donors.findById(JANA)).thenReturn(Optional.of(donor(JANA, "Jana Nováková", "jana@example.cz", false)));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(enabledFactor(JANA)));
        when(targets.targetFor(JANA.value())).thenReturn(Optional.of(new SecondFactorRecoveryTarget(TARGET.accountNumber(), TARGET.iban(),
                TARGET.amount(), LocalDate.of(2026, 10, 24))));
        when(recoveries.findOpenOf(JANA, NOW)).thenReturn(Optional.empty());
        when(targets.paymentQrFor(any())).thenReturn(PAYMENT_QR);

        SecondFactorRecoveryInstructions instructions = service.start(challenge.value());

        assertThat(instructions.usableFrom()).isEmpty();
    }

    @Test
    @DisplayName("Given an open recovery of the donor, when the donor starts the recovery again, then the same code, start and expiry come back as resumed and nothing new opens")
    void should_return_the_open_recovery_when_started_again_given_it_is_still_open() {
        LinkSecret challenge = waitingSignIn(JANA);
        when(donors.findById(JANA)).thenReturn(Optional.of(donor(JANA, "Jana Nováková", "jana@example.cz", false)));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(enabledFactor(JANA)));
        when(targets.targetFor(JANA.value())).thenReturn(Optional.of(TARGET));
        Instant startedAt = NOW.minus(Duration.ofDays(3));
        when(recoveries.findOpenOf(JANA, NOW)).thenReturn(Optional.of(SecondFactorRecovery.open(JANA, CODE, startedAt, RECOVERY_TTL)));
        when(targets.paymentQrFor(CODE)).thenReturn(PAYMENT_QR);

        SecondFactorRecoveryInstructions instructions = service.start(challenge.value());

        assertThat(instructions.message()).isEqualTo("OBNOVA ABCD2345");
        assertThat(instructions.startedAt()).isEqualTo(startedAt);
        assertThat(instructions.expiresAt()).isEqualTo(startedAt.plus(RECOVERY_TTL));
        assertThat(instructions.resumed()).isTrue();
        assertThat(instructions.paymentQr()).isEqualTo(PAYMENT_QR);
        verify(recoveries, never()).replaceOpenOf(any(), any());
    }

    @Test
    @DisplayName("Given an open recovery stored without its code, when the donor starts the recovery again, then a new code replaces it")
    void should_open_a_new_recovery_when_started_again_given_the_open_one_kept_no_code() {
        LinkSecret challenge = waitingSignIn(JANA);
        when(donors.findById(JANA)).thenReturn(Optional.of(donor(JANA, "Jana Nováková", "jana@example.cz", false)));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(enabledFactor(JANA)));
        when(targets.targetFor(JANA.value())).thenReturn(Optional.of(TARGET));
        SecondFactorRecovery withoutCode = SecondFactorRecovery.reconstitute(UuidV7.generate(NOW.minusSeconds(60)), JANA, CODE.hash(), null,
                NOW.minusSeconds(60), NOW.plus(RECOVERY_TTL), null);
        when(recoveries.findOpenOf(JANA, NOW)).thenReturn(Optional.of(withoutCode));
        when(targets.paymentQrFor(any())).thenReturn(PAYMENT_QR);

        SecondFactorRecoveryInstructions instructions = service.start(challenge.value());

        assertThat(instructions.resumed()).isFalse();
        assertThat(instructions.startedAt()).isEqualTo(NOW);
        verify(recoveries).replaceOpenOf(org.mockito.ArgumentMatchers.eq(JANA), any());
    }

    @Test
    @DisplayName("Given a malformed, unknown or expired sign-in, when the recovery starts, then it is refused like the code and nothing opens")
    void should_refuse_like_the_code_when_started_given_no_waiting_sign_in() {
        LinkSecret expired = LinkSecret.generate();
        when(challenges.findBySecretHash(anyString())).thenReturn(Optional.empty());
        when(challenges.findBySecretHash(expired.hash()))
                .thenReturn(Optional.of(SecondFactorChallenge.issue(expired, JANA, NOW.minus(Duration.ofMinutes(6)), Duration.ofMinutes(5))));

        assertThatThrownBy(() -> service.start("not-a-secret")).isInstanceOf(InvalidSecondFactorChallenge.class);
        assertThatThrownBy(() -> service.start(LinkSecret.generate().value())).isInstanceOf(InvalidSecondFactorChallenge.class);
        assertThatThrownBy(() -> service.start(expired.value())).isInstanceOf(InvalidSecondFactorChallenge.class);
        verifyNoInteractions(recoveries, targets);
    }

    @Test
    @DisplayName("Given a donor without an account verified for the recovery, when the recovery starts, then it is unavailable and nothing opens")
    void should_be_unavailable_when_started_given_no_verified_account() {
        LinkSecret challenge = waitingSignIn(JANA);
        when(donors.findById(JANA)).thenReturn(Optional.of(donor(JANA, "Jana Nováková", "jana@example.cz", false)));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(enabledFactor(JANA)));
        when(targets.targetFor(JANA.value())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.start(challenge.value())).isInstanceOf(SecondFactorRecoveryUnavailable.class);
        verifyNoInteractions(recoveries);
    }

    @Test
    @DisplayName("Given an open recovery of a donor, when the donor's payment with its code arrives, then the factor is deleted, every session ends and the donor is told")
    void should_turn_the_factor_off_end_sessions_and_tell_the_donor_when_paid_given_an_open_recovery() {
        SecondFactorRecovery recovery = openRecovery(JANA);
        when(recoveries.markUsed(recovery.id(), NOW)).thenReturn(true);
        Donor jana = donor(JANA, "Jana Nováková", "jana@example.cz", false);
        when(donors.findById(JANA)).thenReturn(Optional.of(jana));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(enabledFactor(JANA)));

        service.complete(new SecondFactorRecoveryPaid(JANA.value(), CODE, "…5399/0800", NOW.minusSeconds(5)));

        InOrder order = inOrder(recoveries, secondFactors, refreshTokens, events);
        order.verify(recoveries).markUsed(recovery.id(), NOW);
        order.verify(secondFactors).delete(JANA);
        order.verify(refreshTokens).revokeAllOf(JANA, NOW);
        order.verify(events).publishEvent(new DonorSecondFactorRecovered(JANA.value(), jana.email(), LocaleCode.CS, "…5399/0800"));
        order.verifyNoMoreInteractions();
    }

    @Test
    @DisplayName("Given an open recovery of an administrator, when the payment arrives, then the action is recorded under the administrator and the other administrators are told")
    void should_record_the_action_and_tell_the_other_administrators_when_paid_given_an_administrator() {
        SecondFactorRecovery recovery = openRecovery(JANA);
        when(recoveries.markUsed(recovery.id(), NOW)).thenReturn(true);
        Donor jana = donor(JANA, "Jana Nováková", "jana@example.cz", true);
        Donor petr = donor(PETR, "Petr Svoboda", "petr@example.cz", true);
        Donor eva = Donor.reconstitute(EVA, DonorType.PERSON, "Eva Malá", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("eva@example.cz"), new PasswordHash("$hash"), new VariableSymbol("4821937562"), LocaleCode.EN,
                Set.of(Role.DONOR, Role.ADMIN), NOW.minusSeconds(1000), NOW.minusSeconds(900), null);
        when(donors.findById(JANA)).thenReturn(Optional.of(jana));
        when(donors.findAdministrators()).thenReturn(List.of(eva, jana, petr));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(enabledFactor(JANA)));

        service.complete(new SecondFactorRecoveryPaid(JANA.value(), CODE, "…5399/0800", NOW));

        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events, org.mockito.Mockito.times(3)).publishEvent(published.capture());
        assertThat(published.getAllValues()).hasExactlyElementsOfTypes(DonorSecondFactorRecovered.class, AdminActionPerformed.class,
                AdministratorSecondFactorRecovered.class);
        AdminActionPerformed action = (AdminActionPerformed) published.getAllValues().get(1);
        assertThat(action.adminId()).isEqualTo(JANA.value());
        assertThat(action.action()).isEqualTo("RECOVER_SECOND_FACTOR");
        assertThat(action.subjectId()).contains(JANA.value());
        assertThat(action.details()).contains(JANA.toString(), "…5399/0800", "1 Kč");
        assertThat(published.getAllValues().get(2)).isEqualTo(new AdministratorSecondFactorRecovered(JANA.value(), "Jana Nováková",
                jana.email(), "…5399/0800", List.of(new AdministratorSecondFactorRecovered.Recipient(eva.email(), LocaleCode.EN),
                new AdministratorSecondFactorRecovered.Recipient(petr.email(), LocaleCode.CS))));
    }

    @Test
    @DisplayName("Given no open recovery matching the code and donor, when a payment arrives, then nothing changes")
    void should_change_nothing_when_paid_given_no_matching_open_recovery() {
        SecondFactorRecovery petrs = SecondFactorRecovery.open(PETR, CODE, NOW.minusSeconds(60), RECOVERY_TTL);
        when(recoveries.findByCodeHash(CODE.hash())).thenReturn(Optional.of(petrs));
        SecondFactorRecoveryCode other = new SecondFactorRecoveryCode("WXYZ6789");
        SecondFactorRecovery expired = SecondFactorRecovery.open(JANA, other, NOW.minus(RECOVERY_TTL), RECOVERY_TTL);
        when(recoveries.findByCodeHash(other.hash())).thenReturn(Optional.of(expired));

        service.complete(new SecondFactorRecoveryPaid(JANA.value(), CODE, "…5399/0800", NOW));
        service.complete(new SecondFactorRecoveryPaid(JANA.value(), other, "…5399/0800", NOW));
        service.complete(new SecondFactorRecoveryPaid(JANA.value(), new SecondFactorRecoveryCode("MNPQ2345"), "…5399/0800", NOW));

        verify(recoveries, never()).markUsed(any(), any());
        verifyNoInteractions(secondFactors, refreshTokens, events);
    }

    @Test
    @DisplayName("Given an open recovery of a donor who turned the factor off meanwhile, when the payment arrives, then the recovery is spent and nothing else happens")
    void should_only_spend_the_recovery_when_paid_given_the_factor_is_off_already() {
        SecondFactorRecovery recovery = openRecovery(JANA);
        when(recoveries.markUsed(recovery.id(), NOW)).thenReturn(true);
        when(donors.findById(JANA)).thenReturn(Optional.of(donor(JANA, "Jana Nováková", "jana@example.cz", false)));
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.empty());

        service.complete(new SecondFactorRecoveryPaid(JANA.value(), CODE, "…5399/0800", NOW));

        verify(secondFactors, never()).delete(any());
        verifyNoInteractions(refreshTokens, events);
    }

    private LinkSecret waitingSignIn(DonorId donorId) {
        LinkSecret secret = LinkSecret.generate();
        when(challenges.findBySecretHash(secret.hash()))
                .thenReturn(Optional.of(SecondFactorChallenge.issue(secret, donorId, NOW.minusSeconds(30), Duration.ofMinutes(5))));
        return secret;
    }

    private SecondFactorRecovery openRecovery(DonorId donorId) {
        SecondFactorRecovery recovery = SecondFactorRecovery.open(donorId, CODE, NOW.minus(Duration.ofDays(1)), RECOVERY_TTL);
        when(recoveries.findByCodeHash(CODE.hash())).thenReturn(Optional.of(recovery));
        return recovery;
    }

    private static SecondFactor enabledFactor(DonorId donorId) {
        return SecondFactor.reconstitute(donorId, SECRET, NOW.minusSeconds(100), NOW.minusSeconds(50), 1L);
    }

    private static Donor donor(DonorId id, String name, String email, boolean administrator) {
        return Donor.reconstitute(id, DonorType.PERSON, name, null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress(email), new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.CS,
                administrator ? Set.of(Role.DONOR, Role.ADMIN) : Set.of(Role.DONOR), NOW.minusSeconds(1000), NOW.minusSeconds(900), null);
    }
}
