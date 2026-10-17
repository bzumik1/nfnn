package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorRegistered;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.DonorType;
import cz.novanadeje.app.donors.domain.EmailAlreadyRegistered;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorRegistrationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");

    @Mock
    private DonorRepository donors;
    @Mock
    private PasswordHasher passwordHasher;
    @Mock
    private DonorSessionService sessions;
    @Mock
    private ApplicationEventPublisher events;

    private DonorRegistrationService service;

    @BeforeEach
    void setUp() {
        service = new DonorRegistrationService(donors, passwordHasher, sessions, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a free email, when a person registers, then the donor is stored with a hashed password, a unique variable symbol and the DonorRegistered event is published")
    void should_store_donor_and_publish_event_when_registered_given_free_email() {
        when(donors.existsByEmail(new EmailAddress("jana@example.cz"))).thenReturn(false);
        when(donors.existsByVariableSymbol(any())).thenReturn(true, false);
        when(passwordHasher.hash(new RawPassword("correct horse battery"))).thenReturn(new PasswordHash("$hash"));
        when(sessions.open(any(), any())).thenReturn(new IssuedTokens("access", NOW.plus(Duration.ofMinutes(15)), "refresh", NOW.plus(Duration.ofDays(14))));

        AuthenticatedDonor result = service.register(personCommand("jana@example.cz", "correct horse battery"));

        ArgumentCaptor<Donor> stored = ArgumentCaptor.forClass(Donor.class);
        verify(donors).save(stored.capture());
        assertThat(stored.getValue().passwordHash()).isEqualTo(new PasswordHash("$hash"));
        assertThat(stored.getValue().variableSymbol().value()).matches("[1-9][0-9]{9}");
        verify(donors, org.mockito.Mockito.times(2)).existsByVariableSymbol(any(VariableSymbol.class));

        ArgumentCaptor<DonorRegistered> published = ArgumentCaptor.forClass(DonorRegistered.class);
        verify(events).publishEvent(published.capture());
        assertThat(published.getValue().donorId()).isEqualTo(stored.getValue().id());
        assertThat(published.getValue().variableSymbol()).isEqualTo(stored.getValue().variableSymbol());
        assertThat(published.getValue().name()).isEqualTo("Jana Nováková");

        assertThat(result.donor().email()).isEqualTo("jana@example.cz");
        assertThat(result.tokens().accessToken()).isEqualTo("access");
    }

    @Test
    void should_refuse_when_registered_given_email_already_taken() {
        when(donors.existsByEmail(new EmailAddress("jana@example.cz"))).thenReturn(true);

        assertThatThrownBy(() -> service.register(personCommand("jana@example.cz", "correct horse battery")))
                .isInstanceOf(EmailAlreadyRegistered.class);

        verify(donors, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    private static RegisterDonorCommand personCommand(String email, String password) {
        return new RegisterDonorCommand(DonorType.PERSON, "Jana Nováková", null, "Dlouhá 12", "Ústí nad Labem", "400 01", email, password, "cs");
    }
}
