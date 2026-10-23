package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorRegistrationRepeated;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
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
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorRegistrationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");

    @Mock
    private DonorRepository donors;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private DonorEmailVerificationService emailVerification;
    @Mock
    private ApplicationEventPublisher events;

    private DonorRegistrationService service;

    @BeforeEach
    void setUp() {
        service = new DonorRegistrationService(donors, passwordHasher, emailVerification, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a free email, when a person registers, then the donor is stored unverified with a hashed password and a unique variable symbol, a verification link is issued and nothing else is published")
    void should_store_unverified_donor_and_issue_link_when_registered_given_free_email() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(donors.existsByVariableSymbol(any())).thenReturn(true, false);
        when(passwordHasher.hash(new RawPassword("correct horse battery"))).thenReturn(new PasswordHash("$hash"));

        service.register(personCommand("jana@example.cz", "correct horse battery"));

        ArgumentCaptor<Donor> stored = ArgumentCaptor.forClass(Donor.class);
        InOrder order = inOrder(donors, emailVerification);
        order.verify(donors).save(stored.capture());
        order.verify(emailVerification).issueLink(stored.getValue());
        Donor donor = stored.getValue();
        assertThat(donor.passwordHash()).contains(new PasswordHash("$hash"));
        assertThat(donor.variableSymbol().value()).matches("[1-9][0-9]{9}");
        assertThat(donor.isEmailVerified()).isFalse();
        assertThat(donor.type()).isEqualTo(DonorType.PERSON);
        assertThat(donor.name()).isEqualTo("Jana Nováková");
        assertThat(donor.address()).isEqualTo(ADDRESS);
        assertThat(donor.preferredLocale()).isEqualTo(LocaleCode.CS);
        assertThat(donor.registeredAt()).isEqualTo(NOW);
        verify(donors, org.mockito.Mockito.times(2)).existsByVariableSymbol(any(VariableSymbol.class));
        verify(donors, never()).delete(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given no password, when a person registers, then the donor is stored without a password and nothing is hashed")
    void should_store_donor_without_password_when_registered_given_no_password() {
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(donors.existsByVariableSymbol(any())).thenReturn(false);

        service.register(personCommand("jana@example.cz", null));

        ArgumentCaptor<Donor> stored = ArgumentCaptor.forClass(Donor.class);
        verify(donors).save(stored.capture());
        assertThat(stored.getValue().hasPassword()).isFalse();
        verify(emailVerification).issueLink(stored.getValue());
        verifyNoInteractions(passwordHasher);
    }

    @Test
    @DisplayName("Given a free email, when a company registers, then the stored donor carries the identification number and the preferred locale")
    void should_store_company_identifier_and_locale_when_registered_given_company() {
        when(donors.findByEmail(new EmailAddress("info@stavby.cz"))).thenReturn(Optional.empty());
        when(donors.existsByVariableSymbol(any())).thenReturn(false);
        when(passwordHasher.hash(new RawPassword("correct horse battery"))).thenReturn(new PasswordHash("$hash"));

        service.register(new RegisterDonorCommand(DonorType.COMPANY, "Stavby Novák s.r.o.", "45274649", "Dlouhá 12", "Ústí nad Labem", "400 01",
                "info@stavby.cz", "correct horse battery", "en"));

        ArgumentCaptor<Donor> stored = ArgumentCaptor.forClass(Donor.class);
        verify(donors).save(stored.capture());
        assertThat(stored.getValue().type()).isEqualTo(DonorType.COMPANY);
        assertThat(stored.getValue().companyIdentifier()).map(identifier -> identifier.value()).contains("45274649");
        assertThat(stored.getValue().preferredLocale()).isEqualTo(LocaleCode.EN);
    }

    @Test
    @DisplayName("Given the email of a verified donor, when someone registers with it, then no donor is stored, no link is issued and the verified donor is told")
    void should_tell_existing_donor_and_store_nothing_when_registered_given_verified_email() {
        Donor verified = donor(LocaleCode.EN);
        verified.verifyEmail(NOW.minusSeconds(3600));
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(verified));

        service.register(personCommand("jana@example.cz", "another passphrase"));

        verify(events).publishEvent(new DonorRegistrationRepeated(verified.id().value(), EMAIL, LocaleCode.EN));
        verify(donors, never()).save(any());
        verify(donors, never()).delete(any());
        verifyNoInteractions(emailVerification, passwordHasher);
    }

    @Test
    @DisplayName("Given the email of an unverified donor, when someone registers with it, then the old registration is deleted first and the new one is stored with its own link")
    void should_replace_registration_when_registered_given_unverified_email() {
        Donor unverified = donor(LocaleCode.CS);
        when(donors.findByEmail(EMAIL)).thenReturn(Optional.of(unverified));
        when(donors.existsByVariableSymbol(any())).thenReturn(false);
        when(passwordHasher.hash(new RawPassword("another passphrase"))).thenReturn(new PasswordHash("$new"));

        service.register(new RegisterDonorCommand(DonorType.PERSON, "Jana Svobodová", null, "Krátká 3", "Most", "434 01",
                "jana@example.cz", "another passphrase", "cs"));

        ArgumentCaptor<Donor> stored = ArgumentCaptor.forClass(Donor.class);
        InOrder order = inOrder(donors, emailVerification);
        order.verify(donors).delete(unverified.id());
        order.verify(donors).save(stored.capture());
        order.verify(emailVerification).issueLink(stored.getValue());
        assertThat(stored.getValue().id()).isNotEqualTo(unverified.id());
        assertThat(stored.getValue().name()).isEqualTo("Jana Svobodová");
        assertThat(stored.getValue().passwordHash()).contains(new PasswordHash("$new"));
        assertThat(stored.getValue().isEmailVerified()).isFalse();
        verifyNoInteractions(events);
    }

    private static Donor donor(LocaleCode locale) {
        return Donor.register(DonorId.newId(NOW.minusSeconds(7200)), DonorType.PERSON, "Jana Nováková", null, ADDRESS, EMAIL,
                new PasswordHash("$old"), new VariableSymbol("4821937560"), locale, NOW.minusSeconds(7200));
    }

    private static RegisterDonorCommand personCommand(String email, String password) {
        return new RegisterDonorCommand(DonorType.PERSON, "Jana Nováková", null, "Dlouhá 12", "Ústí nad Labem", "400 01", email, password, "cs");
    }
}
