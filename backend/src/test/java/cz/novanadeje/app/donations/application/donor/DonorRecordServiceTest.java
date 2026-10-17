package cz.novanadeje.app.donations.application.donor;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorRecordServiceTest {

    private static final Instant REGISTERED_AT = Instant.parse("2026-10-17T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-18T09:15:00Z");
    private static final UUID DONOR_ID = UuidV7.generate(REGISTERED_AT);
    private static final DonorReference DONOR = new DonorReference(DONOR_ID);
    private static final VariableSymbol SYMBOL = new VariableSymbol("4821937560");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    private static final PostalAddress NEW_ADDRESS = new PostalAddress("Krátká 3", "Praha", "110 00");

    @Mock
    private DonorRecordRepository donorRecords;
    @Mock
    private PaymentPairingService pairing;

    private DonorRecordService service;
    private ListAppender<ILoggingEvent> logs;
    private Logger logger;

    @BeforeEach
    void setUp() {
        service = new DonorRecordService(donorRecords, pairing, Clock.fixed(NOW, ZoneOffset.UTC));
        logger = (Logger) LoggerFactory.getLogger(DonorRecordService.class);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(logs);
    }

    @Test
    @DisplayName("Given an unknown person, when registered, then a person record with the announced profile is saved and nothing else happens")
    void should_save_person_record_when_registered_given_unknown_person() {
        when(donorRecords.findById(DONOR)).thenReturn(Optional.empty());

        service.register(personCommand("Jana Nováková", ADDRESS, LocaleCode.CS));

        DonorRecord saved = savedRecord();
        assertThat(saved.id()).isEqualTo(DONOR);
        assertThat(saved.type()).isEqualTo(DonorType.PERSON);
        assertThat(saved.name()).isEqualTo("Jana Nováková");
        assertThat(saved.companyIdentifier()).isEmpty();
        assertThat(saved.address()).isEqualTo(ADDRESS);
        assertThat(saved.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(saved.preferredLocale()).isEqualTo(LocaleCode.CS);
        assertThat(saved.registeredAt()).isEqualTo(REGISTERED_AT);
        assertThat(saved.senderAccounts()).isEmpty();
        verifyNoMoreInteractions(donorRecords);
        verifyNoInteractions(pairing);
    }

    @Test
    @DisplayName("Given an unknown company, when registered, then a company record carrying its identification number is saved")
    void should_save_company_record_when_registered_given_unknown_company() {
        when(donorRecords.findById(DONOR)).thenReturn(Optional.empty());

        service.register(new RegisterDonorRecordCommand(DONOR_ID, DonorType.COMPANY, "Stavby Novák s.r.o.", Optional.of("45274649"),
                ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT));

        DonorRecord saved = savedRecord();
        assertThat(saved.type()).isEqualTo(DonorType.COMPANY);
        assertThat(saved.companyIdentifier()).contains("45274649");
    }

    @Test
    @DisplayName("Given a donor already known to donations, when the registration is announced again, then the existing record takes the announced profile and keeps its symbol")
    void should_update_existing_record_when_registered_again_given_known_donor() {
        DonorRecord existing = DonorRecord.registerPerson(DONOR, "Jana Nováková", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT);
        when(donorRecords.findById(DONOR)).thenReturn(Optional.of(existing));

        service.register(personCommand("Jana Malá", NEW_ADDRESS, LocaleCode.EN));

        DonorRecord saved = savedRecord();
        assertThat(saved).isSameAs(existing);
        assertThat(saved.name()).isEqualTo("Jana Malá");
        assertThat(saved.address()).isEqualTo(NEW_ADDRESS);
        assertThat(saved.preferredLocale()).isEqualTo(LocaleCode.EN);
        assertThat(saved.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(saved.registeredAt()).isEqualTo(REGISTERED_AT);
        assertThat(saved.updatedAt()).isEqualTo(NOW);
        verifyNoInteractions(pairing);
    }

    @Test
    @DisplayName("Given a known donor, when the profile changes, then name, address and locale are saved with the clock's time")
    void should_save_new_profile_when_profile_changed_given_known_donor() {
        when(donorRecords.findById(DONOR)).thenReturn(Optional.of(
                DonorRecord.registerPerson(DONOR, "Jana Nováková", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT)));

        service.changeProfile(new ChangeDonorRecordProfileCommand(DONOR_ID, "Jana Malá", NEW_ADDRESS, LocaleCode.EN));

        DonorRecord saved = savedRecord();
        assertThat(saved.name()).isEqualTo("Jana Malá");
        assertThat(saved.address()).isEqualTo(NEW_ADDRESS);
        assertThat(saved.preferredLocale()).isEqualTo(LocaleCode.EN);
        assertThat(saved.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(saved.updatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a donor unknown to donations, when the profile changes, then nothing is saved and a warning names the donor")
    void should_warn_and_save_nothing_when_profile_changed_given_unknown_donor() {
        when(donorRecords.findById(DONOR)).thenReturn(Optional.empty());

        service.changeProfile(new ChangeDonorRecordProfileCommand(DONOR_ID, "Jana Malá", NEW_ADDRESS, LocaleCode.EN));

        verify(donorRecords, never()).save(any());
        assertThat(warnings()).anySatisfy(message -> assertThat(message).contains(DONOR_ID.toString()));
    }

    @Test
    @DisplayName("Given a known donor, when payments are paired after the registration, then the loaded record is paired at the clock's time and nothing is written")
    void should_pair_loaded_record_when_pairing_after_registration_given_known_donor() {
        DonorRecord record = DonorRecord.registerPerson(DONOR, "Jana Nováková", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT);
        when(donorRecords.findById(DONOR)).thenReturn(Optional.of(record));
        when(pairing.pairPaymentsOf(record, NOW)).thenReturn(new PairingOutcome(1, 1, 1, 0));

        service.pairPaymentsOf(DONOR_ID);

        verify(pairing).pairPaymentsOf(record, NOW);
        verify(donorRecords).findById(DONOR);
        verifyNoMoreInteractions(donorRecords);
        assertThat(warnings()).isEmpty();
    }

    @Test
    @DisplayName("Given a donor unknown to donations, when payments are paired after the registration, then a warning names the donor and nothing is paired")
    void should_warn_when_pairing_after_registration_given_unknown_donor() {
        when(donorRecords.findById(DONOR)).thenReturn(Optional.empty());

        service.pairPaymentsOf(DONOR_ID);

        verifyNoMoreInteractions(donorRecords);
        verifyNoInteractions(pairing);
        assertThat(warnings()).anySatisfy(message -> assertThat(message).contains(DONOR_ID.toString()));
    }

    @Test
    @DisplayName("Given pairing that loses a race with the import, when payments are paired after the registration, then the integrity violation is logged and swallowed")
    void should_swallow_and_warn_when_pairing_after_registration_given_lost_race() {
        DonorRecord record = DonorRecord.registerPerson(DONOR, "Jana Nováková", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT);
        when(donorRecords.findById(DONOR)).thenReturn(Optional.of(record));
        when(pairing.pairPaymentsOf(record, NOW)).thenThrow(new DataIntegrityViolationException("uq_donation_bank_payment"));

        service.pairPaymentsOf(DONOR_ID);

        assertThat(warnings()).singleElement().isEqualTo("pairing after registration of donor " + DONOR_ID
                + " lost a race with the import; the hourly pass completes it");
    }

    private RegisterDonorRecordCommand personCommand(String name, PostalAddress address, LocaleCode locale) {
        return new RegisterDonorRecordCommand(DONOR_ID, DonorType.PERSON, name, Optional.empty(), address, SYMBOL, locale, REGISTERED_AT);
    }

    private DonorRecord savedRecord() {
        ArgumentCaptor<DonorRecord> saved = ArgumentCaptor.forClass(DonorRecord.class);
        verify(donorRecords).save(saved.capture());
        return saved.getValue();
    }

    private List<String> warnings() {
        return logs.list.stream()
                .filter(event -> event.getLevel() == Level.WARN)
                .map(ILoggingEvent::getFormattedMessage)
                .toList();
    }
}
