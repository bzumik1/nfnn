package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorRegistrationReminderDue;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RegistrationReminders;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
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
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorRegistrationReminderServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW.minus(Duration.ofDays(2)));
    private static final EmailAddress EMAIL = new EmailAddress("jana@example.cz");

    @Mock
    private RegistrationReminders reminders;
    @Mock
    private DonorRepository donors;
    @Mock
    private EmailVerificationTokenRepository tokens;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private DonorSessionService sessions;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private ApplicationEventPublisher events;

    private DonorRegistrationReminderService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        DonorEmailVerificationService emailVerification = new DonorEmailVerificationService(donors, tokens, refreshTokens, sessions,
                new DonorViews(secondFactors, tokens, clock), new DonorEmailVerificationProperties(Duration.ofHours(24), 3), clock, events);
        service = new DonorRegistrationReminderService(reminders, donors, emailVerification,
                new RegistrationReminderProperties("0 20 * * * *", Duration.ofDays(1), Duration.ofDays(7)), clock);
    }

    @Test
    @DisplayName("Given an unconfirmed registration due, when the reminders run, then the due ones are read from a week to a day back, a reminder is published and recorded")
    void should_publish_and_record_reminder_when_run_given_unconfirmed_registration_due() {
        when(reminders.dueFor(NOW.minus(Duration.ofDays(7)), NOW.minus(Duration.ofDays(1)))).thenReturn(List.of(DONOR));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));

        int reminded = service.remindUnconfirmed();

        assertThat(reminded).isEqualTo(1);
        ArgumentCaptor<DonorRegistrationReminderDue> published = ArgumentCaptor.forClass(DonorRegistrationReminderDue.class);
        verify(events).publishEvent(published.capture());
        assertThat(published.getValue().donorId()).isEqualTo(DONOR.value());
        verify(reminders).recordSent(DONOR, NOW);
    }

    @Test
    @DisplayName("Given a due registration confirmed in the meantime, when the reminders run, then nothing is published but the reminder is recorded")
    void should_record_without_publishing_when_run_given_registration_confirmed_meanwhile() {
        Donor confirmed = donor();
        confirmed.verifyEmail(NOW.minusSeconds(60));
        when(reminders.dueFor(any(), any())).thenReturn(List.of(DONOR));
        when(donors.findById(DONOR)).thenReturn(Optional.of(confirmed));

        service.remindUnconfirmed();

        verifyNoInteractions(events, tokens);
        verify(reminders).recordSent(DONOR, NOW);
    }

    @Test
    @DisplayName("Given no registration due, when the reminders run, then nothing is published or recorded")
    void should_do_nothing_when_run_given_nothing_due() {
        when(reminders.dueFor(any(), any())).thenReturn(List.of());

        assertThat(service.remindUnconfirmed()).isZero();

        verifyNoInteractions(events, donors);
        verify(reminders, never()).recordSent(any(), any());
    }

    private static Donor donor() {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), EMAIL,
                new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.CS, NOW.minus(Duration.ofDays(2)));
    }
}
