package cz.novanadeje.app.donations.infrastructure.events;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.donor.ChangeDonorRecordProfileCommand;
import cz.novanadeje.app.donations.application.donor.DonorRecordService;
import cz.novanadeje.app.donations.application.donor.RegisterDonorRecordCommand;
import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.application.event.DonorProfileChanged;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorRecordSynchronizerTest {

    private static final Instant REGISTERED_AT = Instant.parse("2026-10-17T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-18T09:15:00Z");
    private static final UUID DONOR_ID = UuidV7.generate(REGISTERED_AT);
    private static final DonorReference DONOR = new DonorReference(DONOR_ID);
    private static final PostalAddress ADDRESS = new PostalAddress("Průmyslová 5", "Teplice", "415 01");
    private static final VariableSymbol SYMBOL = new VariableSymbol("4821937560");

    @Mock
    private DonorRecordService donorRecordService;
    @Mock
    private PaymentPairingService pairing;

    private DonorRecordSynchronizer synchronizer;
    private ListAppender<ILoggingEvent> logs;
    private Logger logger;

    @BeforeEach
    void setUp() {
        synchronizer = new DonorRecordSynchronizer(donorRecordService, pairing, Clock.fixed(NOW, ZoneOffset.UTC));
        logger = (Logger) LoggerFactory.getLogger(DonorRecordSynchronizer.class);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(logs);
    }

    @Test
    @DisplayName("Given a donor registered event, when it arrives before the commit, then donations registers its record with every announced field")
    void should_register_record_when_registered_event_arrives_given_company() {
        synchronizer.onRegistered(registered());

        verify(donorRecordService).register(new RegisterDonorRecordCommand(DONOR_ID, DonorType.COMPANY, "Stavby Novák s.r.o.",
                Optional.of("45274649"), ADDRESS, SYMBOL, LocaleCode.EN, REGISTERED_AT));
    }

    @Test
    @DisplayName("Given a donor registered event, when the registration has committed, then donations pairs the donor's payments")
    void should_pair_payments_when_registration_committed_given_registered_event() {
        when(pairing.pairPaymentsOf(DONOR, NOW)).thenReturn(Optional.of(new PairingOutcome(1, 1, 0, 1, 0)));

        synchronizer.pairAfterRegistration(registered());

        verify(pairing).pairPaymentsOf(DONOR, NOW);
        verifyNoInteractions(donorRecordService);
        assertThat(logs.list).isEmpty();
    }

    @Test
    @DisplayName("Given a donor unknown to donations, when the registration has committed, then a warning names the donor and nothing is paired")
    void should_warn_when_registration_committed_given_donor_unknown_to_donations() {
        when(pairing.pairPaymentsOf(DONOR, NOW)).thenReturn(Optional.empty());

        synchronizer.pairAfterRegistration(registered());

        assertThat(warnings()).containsExactly("Payments of donor " + DONOR_ID + " were not paired: donations has no record of the donor");
    }

    @Test
    @DisplayName("Given the import paired the same bank payment first, when the registration has committed, then the integrity violation is logged as a lost race and does not propagate")
    void should_warn_lost_race_when_registration_committed_given_integrity_violation() {
        when(pairing.pairPaymentsOf(DONOR, NOW)).thenThrow(new DataIntegrityViolationException("uq_donation_bank_payment"));

        assertThatCode(() -> synchronizer.pairAfterRegistration(registered())).doesNotThrowAnyException();

        assertThat(warnings()).containsExactly(lostRace());
    }

    @Test
    @DisplayName("Given a deadlock with the import, when the registration has committed, then the lock failure is logged as a lost race and does not propagate")
    void should_warn_lost_race_when_registration_committed_given_deadlock() {
        when(pairing.pairPaymentsOf(DONOR, NOW)).thenThrow(new CannotAcquireLockException("deadlock detected"));

        assertThatCode(() -> synchronizer.pairAfterRegistration(registered())).doesNotThrowAnyException();

        assertThat(warnings()).containsExactly(lostRace());
    }

    @Test
    @DisplayName("Given a pairing lock wait that runs out, when the registration has committed, then the pessimistic locking failure is logged as a lost race and does not propagate")
    void should_warn_lost_race_when_registration_committed_given_pairing_lock_wait_runs_out() {
        when(pairing.pairPaymentsOf(DONOR, NOW)).thenThrow(new PessimisticLockingFailureException("lock timeout"));

        assertThatCode(() -> synchronizer.pairAfterRegistration(registered())).doesNotThrowAnyException();

        assertThat(warnings()).containsExactly(lostRace());
    }

    @Test
    @DisplayName("Given pairing fails after the registration committed, when the listener runs, then the failure is logged as a warning and does not propagate")
    void should_swallow_and_warn_when_pairing_fails_given_committed_registration() {
        doThrow(new IllegalStateException("payment from 2000145399/0800 could not be paired")).when(pairing).pairPaymentsOf(DONOR, NOW);

        assertThatCode(() -> synchronizer.pairAfterRegistration(registered())).doesNotThrowAnyException();

        assertThat(logs.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).isEqualTo("Pairing the payments of donor " + DONOR_ID
                    + " after the registration failed (java.lang.IllegalStateException); the hourly import pairs them");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    @Test
    @DisplayName("Given a donor profile changed event, when it arrives before the commit, then donations changes the record's profile")
    void should_change_profile_when_profile_changed_event_arrives_given_donor() {
        PostalAddress newAddress = new PostalAddress("Krátká 3", "Praha", "110 00");

        synchronizer.onProfileChanged(new DonorProfileChanged(DONOR_ID, "Jana Malá", newAddress, LocaleCode.CS));

        verify(donorRecordService).changeProfile(new ChangeDonorRecordProfileCommand(DONOR_ID, "Jana Malá", newAddress, LocaleCode.CS));
    }

    @Test
    @DisplayName("Given the three listeners, when their annotations are read, then the copy is written before the commit and pairing runs after it, all without a surrounding transaction too")
    void should_listen_in_the_designed_phases_when_annotations_read_given_synchronizer() throws NoSuchMethodException {
        assertThat(listener("onRegistered", DonorRegistered.class).phase()).isEqualTo(TransactionPhase.BEFORE_COMMIT);
        assertThat(listener("pairAfterRegistration", DonorRegistered.class).phase()).isEqualTo(TransactionPhase.AFTER_COMMIT);
        assertThat(listener("onProfileChanged", DonorProfileChanged.class).phase()).isEqualTo(TransactionPhase.BEFORE_COMMIT);
        assertThat(listener("onRegistered", DonorRegistered.class).fallbackExecution()).isTrue();
        assertThat(listener("pairAfterRegistration", DonorRegistered.class).fallbackExecution()).isTrue();
        assertThat(listener("onProfileChanged", DonorProfileChanged.class).fallbackExecution()).isTrue();
    }

    @Test
    @DisplayName("Given pairing after the registration, when its transaction setting is read, then it runs in a new transaction of its own")
    void should_pair_in_new_transaction_when_annotation_read_given_service() throws NoSuchMethodException {
        Transactional pairing = PaymentPairingService.class.getMethod("pairPaymentsOf", DonorReference.class, Instant.class)
                .getAnnotation(Transactional.class);

        assertThat(pairing.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
        assertThat(DonorRecordSynchronizer.class.getDeclaredMethod("pairAfterRegistration", DonorRegistered.class).getAnnotation(Transactional.class)).isNull();
    }

    private String lostRace() {
        return "pairing after registration of donor " + DONOR_ID + " lost a race with the import; the hourly pass completes it";
    }

    private List<String> warnings() {
        return logs.list.stream()
                .filter(event -> event.getLevel() == Level.WARN)
                .map(ILoggingEvent::getFormattedMessage)
                .toList();
    }

    private static TransactionalEventListener listener(String method, Class<?> event) throws NoSuchMethodException {
        return DonorRecordSynchronizer.class.getDeclaredMethod(method, event).getAnnotation(TransactionalEventListener.class);
    }

    private static DonorRegistered registered() {
        return new DonorRegistered(DONOR_ID, DonorType.COMPANY, "Stavby Novák s.r.o.", Optional.of("45274649"), ADDRESS,
                new EmailAddress("ucetni@stavby.example.cz"), SYMBOL, LocaleCode.EN, REGISTERED_AT);
    }
}
