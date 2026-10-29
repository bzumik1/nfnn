package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.AdministratorEmailNotConfirmed;
import cz.novanadeje.app.donors.domain.AlreadyAdministrator;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailNotRegistered;
import cz.novanadeje.app.donors.domain.NotAdministrator;
import cz.novanadeje.app.donors.domain.OwnAdministrationRevoked;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.NoPasskeys;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.application.event.DonorPasskeysRemoved;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorReset;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorNotEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdministratorServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-22T21:00:00Z");
    private static final DonorId JANA = DonorId.newId(NOW.minusSeconds(300));
    private static final DonorId PETR = DonorId.newId(NOW.minusSeconds(200));
    private static final EmailAddress PETR_EMAIL = new EmailAddress("petr@example.cz");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final TotpSecret SECRET = new TotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private ApplicationEventPublisher events;

    private AdministratorService service;

    @BeforeEach
    void setUp() {
        service = new AdministratorService(donors, secondFactors, passkeys, refreshTokens, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given two administrators, one with the second factor, when they are listed, then each view says who has the factor")
    void should_describe_each_administrator_when_listed_given_two_administrators() {
        Donor jana = administrator(JANA, "Jana Nováková", "jana@example.cz");
        Donor petr = administrator(PETR, "Petr Svoboda", PETR_EMAIL.value());
        when(donors.findAdministrators()).thenReturn(List.of(jana, petr));
        SecondFactor enabled = SecondFactor.reconstitute(JANA, SECRET, NOW.minusSeconds(100), NOW.minusSeconds(50), 1L);
        when(secondFactors.findByDonor(JANA)).thenReturn(Optional.of(enabled));
        when(secondFactors.findByDonor(PETR)).thenReturn(Optional.of(SecondFactor.enrol(PETR, SECRET, NOW.minusSeconds(10))));

        List<AdministratorView> views = service.list();

        assertThat(views).containsExactly(
                new AdministratorView(JANA, "Jana Nováková", new EmailAddress("jana@example.cz"), true),
                new AdministratorView(PETR, "Petr Svoboda", PETR_EMAIL, false));
    }

    @Test
    @DisplayName("Given two administrators, when their contacts are asked for, then each comes with the address and the language to write in")
    void should_give_address_and_language_of_each_administrator_when_contacts_asked_given_two_administrators() {
        Donor jana = administrator(JANA, "Jana Nováková", "jana@example.cz");
        Donor petr = Donor.reconstitute(PETR, DonorType.PERSON, "Petr Svoboda", null, ADDRESS, PETR_EMAIL, new PasswordHash("$hash"),
                new VariableSymbol("4821937561"), LocaleCode.EN, Set.of(Role.DONOR, Role.ADMIN), NOW.minusSeconds(1000), NOW.minusSeconds(900), null);
        when(donors.findAdministrators()).thenReturn(List.of(jana, petr));

        assertThat(service.contacts()).containsExactly(
                new AdministratorContact(JANA, new EmailAddress("jana@example.cz"), LocaleCode.CS),
                new AdministratorContact(PETR, PETR_EMAIL, LocaleCode.EN));
        verifyNoInteractions(secondFactors, passkeys, refreshTokens, events);
    }

    @Test
    @DisplayName("Given a registered plain donor, when an administrator grants the role by e-mail, then the donor is saved as an administrator and the action is recorded")
    void should_grant_role_and_record_action_when_granted_given_registered_donor() {
        Donor petr = plainDonor(PETR, "Petr Svoboda", PETR_EMAIL.value());
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.of(petr));
        when(secondFactors.findByDonor(PETR)).thenReturn(Optional.empty());

        AdministratorView view = service.grant(JANA, PETR_EMAIL);

        assertThat(view).isEqualTo(new AdministratorView(PETR, "Petr Svoboda", PETR_EMAIL, false));
        ArgumentCaptor<Donor> saved = ArgumentCaptor.forClass(Donor.class);
        verify(donors).save(saved.capture());
        assertThat(saved.getValue().roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(published.capture());
        AdminActionPerformed action = (AdminActionPerformed) published.getValue();
        assertThat(action.adminId()).isEqualTo(JANA.value());
        assertThat(action.action()).isEqualTo("GRANT_ADMINISTRATION");
        assertThat(action.subjectId()).contains(PETR.value());
        assertThat(action.performedAt()).isEqualTo(NOW);
        verifyNoInteractions(refreshTokens);
    }

    @Test
    @DisplayName("Given no donor with the e-mail, when the role is granted, then the request fails as not registered and nothing is saved")
    void should_refuse_when_granted_given_unknown_email() {
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.grant(JANA, PETR_EMAIL)).isInstanceOf(EmailNotRegistered.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a donor who has not confirmed the e-mail, when the role is granted, then the request conflicts and nothing is saved")
    void should_refuse_when_granted_given_unconfirmed_donor() {
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.of(unconfirmedDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));

        assertThatThrownBy(() -> service.grant(JANA, PETR_EMAIL)).isInstanceOf(AdministratorEmailNotConfirmed.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(refreshTokens, events);
    }

    @Test
    @DisplayName("Given a donor who already is an administrator, when the role is granted, then the request conflicts and nothing is saved")
    void should_refuse_when_granted_given_administrator() {
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.of(administrator(PETR, "Petr Svoboda", PETR_EMAIL.value())));

        assertThatThrownBy(() -> service.grant(JANA, PETR_EMAIL)).isInstanceOf(AlreadyAdministrator.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given another administrator, when the role is revoked, then the donor keeps only DONOR, every session ends and the action is recorded")
    void should_revoke_role_end_sessions_and_record_action_when_revoked_given_other_administrator() {
        when(donors.findById(PETR)).thenReturn(Optional.of(administrator(PETR, "Petr Svoboda", PETR_EMAIL.value())));

        service.revoke(JANA, PETR);

        ArgumentCaptor<Donor> saved = ArgumentCaptor.forClass(Donor.class);
        verify(donors).save(saved.capture());
        assertThat(saved.getValue().roles()).containsExactly(Role.DONOR);
        verify(refreshTokens).revokeAllOf(PETR, NOW);
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(published.capture());
        AdminActionPerformed action = (AdminActionPerformed) published.getValue();
        assertThat(action.adminId()).isEqualTo(JANA.value());
        assertThat(action.action()).isEqualTo("REVOKE_ADMINISTRATION");
        assertThat(action.subjectId()).contains(PETR.value());
    }

    @Test
    @DisplayName("Given an administrator, when they revoke their own role, then the request is refused before any lookup")
    void should_refuse_when_revoked_given_own_id() {
        assertThatThrownBy(() -> service.revoke(JANA, JANA)).isInstanceOf(OwnAdministrationRevoked.class);

        verifyNoInteractions(donors, refreshTokens, events);
    }

    @Test
    @DisplayName("Given no donor with the id, when the role is revoked, then the donor is not found")
    void should_fail_when_revoked_given_unknown_donor() {
        when(donors.findById(PETR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revoke(JANA, PETR)).isInstanceOf(DonorNotFound.class);

        verifyNoInteractions(refreshTokens, events);
    }

    @Test
    @DisplayName("Given a plain donor, when the role is revoked, then the request conflicts and no session ends")
    void should_refuse_when_revoked_given_plain_donor() {
        when(donors.findById(PETR)).thenReturn(Optional.of(plainDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));

        assertThatThrownBy(() -> service.revoke(JANA, PETR)).isInstanceOf(NotAdministrator.class);

        verify(donors, never()).save(any());
        verifyNoInteractions(refreshTokens, events);
    }

    @Test
    @DisplayName("Given a registered plain donor, when the role is granted at startup, then the donor is saved as an administrator without an audit record")
    void should_grant_silently_when_granted_at_startup_given_plain_donor() {
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.of(plainDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));

        StartupGrant outcome = service.grantAtStartup(PETR_EMAIL);

        assertThat(outcome).isEqualTo(StartupGrant.GRANTED);
        ArgumentCaptor<Donor> saved = ArgumentCaptor.forClass(Donor.class);
        verify(donors).save(saved.capture());
        assertThat(saved.getValue().isAdministrator()).isTrue();
        verifyNoInteractions(events, refreshTokens);
    }

    @Test
    @DisplayName("Given an administrator, when the role is granted at startup again, then nothing changes")
    void should_change_nothing_when_granted_at_startup_given_administrator() {
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.of(administrator(PETR, "Petr Svoboda", PETR_EMAIL.value())));

        assertThat(service.grantAtStartup(PETR_EMAIL)).isEqualTo(StartupGrant.ALREADY_ADMINISTRATOR);

        verify(donors, never()).save(any());
    }

    @Test
    @DisplayName("Given the site already has an administrator, when the role is granted at startup to a plain donor, then nothing is saved")
    void should_grant_nothing_when_granted_at_startup_given_site_with_administrator() {
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.of(plainDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));
        when(donors.findAdministrators()).thenReturn(List.of(administrator(JANA, "Jana Nováková", "jana@example.cz")));

        assertThat(service.grantAtStartup(PETR_EMAIL)).isEqualTo(StartupGrant.SITE_HAS_ADMINISTRATOR);

        verify(donors, never()).save(any());
    }

    @Test
    @DisplayName("Given a donor who has not confirmed the e-mail, when the role is granted at startup, then the outcome says so and nothing is saved")
    void should_report_not_confirmed_when_granted_at_startup_given_unconfirmed_donor() {
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.of(unconfirmedDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));

        assertThat(service.grantAtStartup(PETR_EMAIL)).isEqualTo(StartupGrant.NOT_CONFIRMED);

        verify(donors, never()).save(any());
    }

    @Test
    @DisplayName("Given no donor with the e-mail, when the role is granted at startup, then the outcome says so and nothing is saved")
    void should_report_not_registered_when_granted_at_startup_given_unknown_email() {
        when(donors.findByEmail(PETR_EMAIL)).thenReturn(Optional.empty());

        assertThat(service.grantAtStartup(PETR_EMAIL)).isEqualTo(StartupGrant.NOT_REGISTERED);

        verify(donors, never()).save(any());
    }

    @Test
    @DisplayName("Given a donor with the second factor on, when an administrator resets it, then the factor is deleted, every session ends, the action is recorded and the donor is told")
    void should_delete_factor_end_sessions_record_and_notify_when_reset_given_enabled_factor() {
        when(donors.findById(PETR)).thenReturn(Optional.of(plainDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));
        when(secondFactors.findByDonor(PETR)).thenReturn(Optional.of(SecondFactor.reconstitute(PETR, SECRET, NOW.minusSeconds(100), NOW.minusSeconds(50), 1L)));

        service.resetSecondFactor(JANA, PETR);

        verify(secondFactors).delete(PETR);
        verify(refreshTokens).revokeAllOf(PETR, NOW);
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events, org.mockito.Mockito.times(2)).publishEvent(published.capture());
        AdminActionPerformed action = (AdminActionPerformed) published.getAllValues().getFirst();
        assertThat(action.adminId()).isEqualTo(JANA.value());
        assertThat(action.action()).isEqualTo("RESET_SECOND_FACTOR");
        assertThat(action.subjectId()).contains(PETR.value());
        assertThat(published.getAllValues().getLast()).isEqualTo(new DonorSecondFactorReset(PETR.value(), PETR_EMAIL, LocaleCode.CS));
        verify(donors, never()).save(any());
    }

    @Test
    @DisplayName("Given a donor without the second factor, when an administrator resets it, then the request is refused and no session ends")
    void should_refuse_when_reset_given_no_factor() {
        when(donors.findById(PETR)).thenReturn(Optional.of(plainDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));
        when(secondFactors.findByDonor(PETR)).thenReturn(Optional.of(SecondFactor.enrol(PETR, SECRET, NOW.minusSeconds(10))));

        assertThatThrownBy(() -> service.resetSecondFactor(JANA, PETR)).isInstanceOf(SecondFactorNotEnabled.class);

        verify(secondFactors, never()).delete(any());
        verifyNoInteractions(refreshTokens, events);
    }

    @Test
    @DisplayName("Given no donor with the id, when the second factor is reset, then the donor is not found")
    void should_fail_when_reset_given_unknown_donor() {
        when(donors.findById(PETR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resetSecondFactor(JANA, PETR)).isInstanceOf(DonorNotFound.class);

        verifyNoInteractions(refreshTokens, events);
    }

    @Test
    @DisplayName("Given a donor with two passkeys, when an administrator removes them, then they are deleted, every session ends, the action is recorded and the donor is told")
    void should_delete_passkeys_end_sessions_record_and_notify_when_removed_given_passkeys() {
        when(donors.findById(PETR)).thenReturn(Optional.of(plainDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));
        when(passkeys.deleteAllOf(PETR)).thenReturn(2);

        service.removePasskeys(JANA, PETR);

        verify(refreshTokens).revokeAllOf(PETR, NOW);
        ArgumentCaptor<Object> published = ArgumentCaptor.forClass(Object.class);
        verify(events, org.mockito.Mockito.times(2)).publishEvent(published.capture());
        AdminActionPerformed action = (AdminActionPerformed) published.getAllValues().getFirst();
        assertThat(action.adminId()).isEqualTo(JANA.value());
        assertThat(action.action()).isEqualTo("REMOVE_PASSKEYS");
        assertThat(action.subjectId()).contains(PETR.value());
        assertThat(action.details()).isEqualTo("Odebrané přístupové klíče dárce " + PETR + ": 2; všechna přihlášení dárce ukončena");
        assertThat(published.getAllValues().getLast()).isEqualTo(new DonorPasskeysRemoved(PETR.value(), PETR_EMAIL, LocaleCode.CS));
    }

    @Test
    @DisplayName("Given a donor without passkeys, when an administrator removes them, then the request is refused and no session ends")
    void should_refuse_when_removed_given_no_passkeys() {
        when(donors.findById(PETR)).thenReturn(Optional.of(plainDonor(PETR, "Petr Svoboda", PETR_EMAIL.value())));
        when(passkeys.deleteAllOf(PETR)).thenReturn(0);

        assertThatThrownBy(() -> service.removePasskeys(JANA, PETR)).isInstanceOf(NoPasskeys.class);

        verifyNoInteractions(refreshTokens, events);
    }

    private static Donor plainDonor(DonorId id, String name, String email) {
        return Donor.reconstitute(id, DonorType.PERSON, name, null, ADDRESS, new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, Set.of(Role.DONOR), NOW.minusSeconds(1000), NOW.minusSeconds(900), null);
    }

    private static Donor unconfirmedDonor(DonorId id, String name, String email) {
        return Donor.reconstitute(id, DonorType.PERSON, name, null, ADDRESS, new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, Set.of(Role.DONOR), NOW.minusSeconds(1000), null, null);
    }

    private static Donor administrator(DonorId id, String name, String email) {
        return Donor.reconstitute(id, DonorType.PERSON, name, null, ADDRESS, new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol("4821937560"), LocaleCode.CS, Set.of(Role.DONOR, Role.ADMIN), NOW.minusSeconds(1000), NOW.minusSeconds(900), null);
    }
}
