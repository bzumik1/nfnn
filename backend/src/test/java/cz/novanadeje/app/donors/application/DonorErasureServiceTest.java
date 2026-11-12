package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.application.event.DonorAccountErased;
import cz.novanadeje.app.donors.domain.AdministratorNotErasable;
import cz.novanadeje.app.donors.domain.AuthorizationCodeRepository;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorAlreadyErased;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordResetTokenRepository;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactorChallengeRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.DonorErased;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.ErasedPersonalData;
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
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorErasureServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T09:00:00Z");
    private static final DonorId JANA = DonorId.newId(NOW.minusSeconds(300));
    private static final DonorId PETR = DonorId.newId(NOW.minusSeconds(200));
    private static final EmailAddress PETR_EMAIL = new EmailAddress("petr@example.cz");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private DeviceSignOuts signOuts;
    @Mock
    private PasswordResetTokenRepository passwordResetTokens;
    @Mock
    private EmailVerificationTokenRepository emailVerificationTokens;
    @Mock
    private SecondFactorChallengeRepository challenges;
    @Mock
    private SecondFactorRecoveryRepository recoveries;
    @Mock
    private AuthorizationCodeRepository authorizationCodes;
    @Mock
    private ApplicationEventPublisher events;

    private DonorErasureService service;

    @BeforeEach
    void setUp() {
        service = new DonorErasureService(donors, secondFactors, passkeys, passwordResetTokens, emailVerificationTokens,
                challenges, recoveries, authorizationCodes, events, Clock.fixed(NOW, ZoneOffset.UTC), signOuts);
    }

    @Test
    @DisplayName("Given a plain English donor, when an administrator erases the donor, then the anonymized donor is saved, the factor and tokens go, every session ends, and the three events carry the former address and the audit text")
    void should_anonymize_and_publish_events_when_erased_given_plain_donor() {
        Donor petr = donor(PETR, Set.of(Role.DONOR), LocaleCode.EN);
        when(donors.findByIdForUpdate(PETR)).thenReturn(Optional.of(petr));

        service.erase(JANA, PETR);

        InOrder order = inOrder(donors, secondFactors, passkeys, signOuts, passwordResetTokens, emailVerificationTokens, events);
        ArgumentCaptor<Donor> saved = ArgumentCaptor.forClass(Donor.class);
        order.verify(donors).save(saved.capture());
        order.verify(secondFactors).delete(PETR);
        order.verify(passkeys).deleteAllOf(PETR);
        order.verify(signOuts).endAllOf(PETR, DeviceSignOutReason.ERASED, NOW);
        order.verify(passwordResetTokens).deleteAllOf(PETR);
        order.verify(emailVerificationTokens).deleteAllOf(PETR);
        verify(challenges).deleteAllOfWithoutWaiting(PETR);
        verify(recoveries).deleteAllOfWithoutWaiting(PETR);
        verify(authorizationCodes).deleteAllOfWithoutWaiting(PETR);
        assertThat(saved.getValue()).isSameAs(petr);
        assertThat(petr.isErased()).isTrue();
        assertThat(petr.erasedAt()).contains(NOW);
        assertThat(petr.email()).isEqualTo(ErasedPersonalData.emailFor(PETR.value()));
        assertThat(petr.roles()).isEmpty();

        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events, times(3)).publishEvent(published.capture());
        List<Object> all = published.getAllValues();
        assertThat(all.get(0)).isEqualTo(new DonorErased(PETR.value(), NOW));
        AdminActionPerformed action = (AdminActionPerformed) all.get(1);
        assertThat(action.adminId()).isEqualTo(JANA.value());
        assertThat(action.action()).isEqualTo("ERASE_DONOR");
        assertThat(action.subjectId()).contains(PETR.value());
        assertThat(action.details()).isEqualTo("Osobní údaje dárce " + PETR + " vymazány: účet anonymizován, všechna přihlášení ukončena,"
                + " bankovní účty a odpovědi o starších symbolech smazány; dary a potvrzení zůstávají");
        assertThat(action.performedAt()).isEqualTo(NOW);
        assertThat(all.get(2)).isEqualTo(new DonorAccountErased(PETR.value(), PETR_EMAIL, LocaleCode.EN));
    }

    @Test
    @DisplayName("Given an unknown donor, when erased, then it is not found and nothing else happens")
    void should_fail_as_not_found_when_erased_given_unknown_donor() {
        when(donors.findByIdForUpdate(PETR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.erase(JANA, PETR)).isInstanceOf(DonorNotFound.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(secondFactors, signOuts, passwordResetTokens, emailVerificationTokens, challenges, recoveries, authorizationCodes, events);
    }

    @Test
    @DisplayName("Given an administrator, when erased, then it is refused as not erasable and nothing is written or published")
    void should_refuse_when_erased_given_administrator() {
        when(donors.findByIdForUpdate(PETR)).thenReturn(Optional.of(donor(PETR, Set.of(Role.DONOR, Role.ADMIN), LocaleCode.CS)));

        assertThatThrownBy(() -> service.erase(JANA, PETR)).isInstanceOf(AdministratorNotErasable.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(secondFactors, signOuts, passwordResetTokens, emailVerificationTokens, challenges, recoveries, authorizationCodes, events);
    }

    @Test
    @DisplayName("Given an erased donor, when erased again, then it is refused as already erased and nothing is written or published")
    void should_refuse_when_erased_given_erased_donor() {
        Donor petr = donor(PETR, Set.of(Role.DONOR), LocaleCode.CS);
        petr.erase(NOW.minusSeconds(60));
        when(donors.findByIdForUpdate(PETR)).thenReturn(Optional.of(petr));

        assertThatThrownBy(() -> service.erase(JANA, PETR)).isInstanceOf(DonorAlreadyErased.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(secondFactors, signOuts, passwordResetTokens, emailVerificationTokens, challenges, recoveries, authorizationCodes, events);
    }

    @Test
    @DisplayName("Given a donor a restore marked erased whose personal data came back with the backup, when the erasure is completed, then the anonymized donor is saved, the factor, passkeys and tokens go, every session ends, and only the erasure is published with its first time, without a second audit entry or e-mail")
    void should_complete_the_erasure_when_completed_given_donor_marked_erased_by_a_restore() {
        Instant erasedAt = NOW.minusSeconds(86_400);
        Donor petr = Donor.reconstitute(PETR, DonorType.PERSON, "Petr Svoboda", null, ADDRESS, PETR_EMAIL, null, new VariableSymbol("7310945528"), LocaleCode.CS,
                Set.of(), NOW.minusSeconds(1000), NOW.minusSeconds(900), erasedAt);
        when(donors.findByIdForUpdate(PETR)).thenReturn(Optional.of(petr));

        boolean completed = service.completeRestoredErasure(PETR);

        assertThat(completed).isTrue();
        verify(donors).save(petr);
        assertThat(petr.erasureIncomplete()).isFalse();
        assertThat(petr.erasedAt()).contains(erasedAt);
        assertThat(petr.email()).isEqualTo(ErasedPersonalData.emailFor(PETR.value()));
        verify(secondFactors).delete(PETR);
        verify(passkeys).deleteAllOf(PETR);
        verify(signOuts).endAllOf(PETR, DeviceSignOutReason.ERASED, NOW);
        verify(passwordResetTokens).deleteAllOf(PETR);
        verify(emailVerificationTokens).deleteAllOf(PETR);
        verify(challenges).deleteAllOfWithoutWaiting(PETR);
        verify(recoveries).deleteAllOfWithoutWaiting(PETR);
        verify(authorizationCodes).deleteAllOfWithoutWaiting(PETR);
        verify(events).publishEvent(new DonorErased(PETR.value(), erasedAt));
        verify(events, times(1)).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given a donor erased in full, a donor never erased and an unknown donor, when the erasure is completed, then nothing is written or published")
    void should_change_nothing_when_completed_given_nothing_left_to_erase() {
        Donor erased = donor(PETR, Set.of(Role.DONOR), LocaleCode.CS);
        erased.erase(NOW.minusSeconds(60));
        Donor active = donor(JANA, Set.of(Role.DONOR), LocaleCode.CS);
        DonorId unknown = DonorId.newId(NOW);
        when(donors.findByIdForUpdate(PETR)).thenReturn(Optional.of(erased));
        when(donors.findByIdForUpdate(JANA)).thenReturn(Optional.of(active));
        when(donors.findByIdForUpdate(unknown)).thenReturn(Optional.empty());

        assertThat(service.completeRestoredErasure(PETR)).isFalse();
        assertThat(service.completeRestoredErasure(JANA)).isFalse();
        assertThat(service.completeRestoredErasure(unknown)).isFalse();

        verify(donors, never()).save(any());
        verifyNoInteractions(secondFactors, passkeys, signOuts, passwordResetTokens, emailVerificationTokens, challenges, recoveries, authorizationCodes, events);
    }

    private static Donor donor(DonorId id, Set<Role> roles, LocaleCode locale) {
        return Donor.reconstitute(id, DonorType.PERSON, "Petr Svoboda", null, ADDRESS, PETR_EMAIL, new PasswordHash("$hash"),
                new VariableSymbol("7310945528"), locale, roles, NOW.minusSeconds(1000), NOW.minusSeconds(900), null);
    }
}
