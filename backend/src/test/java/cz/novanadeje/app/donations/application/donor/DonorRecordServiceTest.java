package cz.novanadeje.app.donations.application.donor;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.domain.ErasedPersonalData;
import cz.novanadeje.app.shared.domain.Money;
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
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
    private SymbolClaimRepository claims;
    @Mock
    private DonationRepository donations;
    @Mock
    private PaymentPairingService pairing;
    @Mock
    private PairingLock lock;

    private DonorRecordService service;
    private ListAppender<ILoggingEvent> logs;
    private Logger logger;

    @BeforeEach
    void setUp() {
        service = new DonorRecordService(donorRecords, claims, donations, pairing, lock, Clock.fixed(NOW, ZoneOffset.UTC));
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
        when(pairing.pairPaymentsOf(record, NOW)).thenReturn(new PairingOutcome(1, 1, 0, 1, 0));

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

    @Test
    @DisplayName("Given pairing that deadlocks with the import, when payments are paired after the registration, then the lock failure is logged as a lost race and swallowed")
    void should_swallow_and_warn_when_pairing_after_registration_given_deadlock_with_import() {
        DonorRecord record = DonorRecord.registerPerson(DONOR, "Jana Nováková", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT);
        when(donorRecords.findById(DONOR)).thenReturn(Optional.of(record));
        when(pairing.pairPaymentsOf(record, NOW)).thenThrow(new CannotAcquireLockException("deadlock detected"));

        service.pairPaymentsOf(DONOR_ID);

        assertThat(warnings()).singleElement().isEqualTo("pairing after registration of donor " + DONOR_ID
                + " lost a race with the import; the hourly pass completes it");
    }

    @Test
    @DisplayName("Given a known donor with a learned account, two answers about older symbols and donations paired through them, when the donor is erased, then under the pairing lock the donations keep only their pairing method, the record loses its personal data and links, the answers are deleted and the record is saved")
    void should_anonymize_record_and_delete_links_and_answers_when_erased_given_known_donor() {
        DonorRecord record = DonorRecord.registerPerson(DONOR, "Jana Nováková", ADDRESS, SYMBOL, LocaleCode.CS, REGISTERED_AT);
        when(donorRecords.findById(DONOR)).thenReturn(Optional.of(record));
        SenderAccount account = new SenderAccount("2900233333", "2010");
        SymbolClaim confirmed = SymbolClaim.answer(SymbolClaimId.newId(NOW), DONOR, account, new VariableSymbol("6123456789"),
                SymbolClaimAnswer.CONFIRMED, NOW);
        SymbolClaim declined = SymbolClaim.answer(SymbolClaimId.newId(NOW.plusSeconds(1)), DONOR, account, new VariableSymbol("7123456789"),
                SymbolClaimAnswer.DECLINED, NOW);
        when(claims.findByDonor(DONOR)).thenReturn(List.of(confirmed, declined));
        SenderAccountLinkId link = SenderAccountLinkId.newId(NOW);
        Donation bySymbol = donation(PairingMethod.VARIABLE_SYMBOL, Optional.empty(), Optional.empty());
        Donation byAccount = donation(PairingMethod.SENDER_ACCOUNT, Optional.of(link), Optional.empty());
        Donation byClaim = donation(PairingMethod.CONFIRMED_SYMBOL, Optional.of(link), Optional.of(confirmed.id()));
        when(donations.findByDonorNewestFirst(DONOR)).thenReturn(List.of(byClaim, byAccount, bySymbol));

        service.erase(DONOR_ID, NOW);

        InOrder order = inOrder(lock, donorRecords, donations, claims);
        order.verify(lock).acquire();
        order.verify(donorRecords).findById(DONOR);
        ArgumentCaptor<Donation> rewritten = ArgumentCaptor.forClass(Donation.class);
        order.verify(donations, times(2)).save(rewritten.capture());
        order.verify(donorRecords).deleteSenderAccountLinksOf(DONOR);
        order.verify(donorRecords).save(record);
        order.verify(claims).delete(confirmed.id());
        order.verify(claims).delete(declined.id());
        assertThat(rewritten.getAllValues()).extracting(Donation::id).containsExactly(byClaim.id(), byAccount.id());
        assertThat(rewritten.getAllValues()).allSatisfy(donation -> {
            assertThat(donation.pairedThrough()).isEmpty();
            assertThat(donation.confirmedClaim()).isEmpty();
        });
        assertThat(rewritten.getAllValues()).extracting(Donation::pairedBy)
                .containsExactly(Optional.of(PairingMethod.CONFIRMED_SYMBOL), Optional.of(PairingMethod.SENDER_ACCOUNT));
        assertThat(record.isErased()).isTrue();
        assertThat(record.erasedAt()).contains(NOW);
        assertThat(record.name()).isEqualTo(ErasedPersonalData.NAME);
        assertThat(record.address()).isEqualTo(ErasedPersonalData.ADDRESS);
        assertThat(record.variableSymbol()).isEqualTo(SYMBOL);
        assertThat(record.senderAccountLinks()).isEmpty();
        verifyNoInteractions(pairing);
        assertThat(warnings()).isEmpty();
    }

    @Test
    @DisplayName("Given a donor unknown to donations, when the donor is erased, then nothing is written and a warning names the donor")
    void should_warn_and_write_nothing_when_erased_given_unknown_donor() {
        when(donorRecords.findById(DONOR)).thenReturn(Optional.empty());

        service.erase(DONOR_ID, NOW);

        verify(lock).acquire();
        verify(donorRecords, never()).save(any());
        verify(donorRecords, never()).deleteSenderAccountLinksOf(any());
        verifyNoInteractions(claims, donations);
        assertThat(warnings()).singleElement().asString().contains(DONOR_ID.toString());
    }

    private static Donation donation(PairingMethod method, Optional<SenderAccountLinkId> link, Optional<SymbolClaimId> claim) {
        return Donation.reconstitute(DonationId.newId(NOW), DONOR, Optional.of(BankPaymentId.newId(NOW)), LocalDate.of(2026, 10, 10),
                Money.czk(50000), DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(method), link, claim, DonationPurpose.GENERAL,
                NOW);
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
