package cz.novanadeje.app.donations.application.pairing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.LearnedSenderAccount;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
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
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentPairingServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final VariableSymbol JANA_SYMBOL = new VariableSymbol("4821937560");
    private static final VariableSymbol PETR_SYMBOL = new VariableSymbol("7310945528");

    @Mock
    private BankPaymentRepository payments;
    @Mock
    private DonorRecordRepository donorRecords;
    @Mock
    private DonationRepository donations;

    private PaymentPairingService service;
    private ListAppender<ILoggingEvent> logs;
    private Logger logger;

    private final DonorRecord jana = donor("Jana Nováková", JANA_SYMBOL);
    private final DonorRecord petr = donor("Petr Svoboda", PETR_SYMBOL);

    @BeforeEach
    void setUp() {
        service = new PaymentPairingService(payments, donorRecords, donations);
        logger = (Logger) LoggerFactory.getLogger(PaymentPairingService.class);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(logs);
    }

    @Test
    @DisplayName("Given an older payment without a symbol and a newer one with the donor's symbol from one account, when unpaired payments are paired, then the symbol pass learns the account and the account pass pairs the older payment")
    void should_learn_then_pair_older_payment_when_unpaired_paired_given_symbol_and_symbol_less_payments() {
        BankPayment older = payment(1001, LocalDate.of(2026, 10, 10), Money.czk(20000), Optional.of(ACCOUNT), null);
        BankPayment newer = payment(1002, LocalDate.of(2026, 10, 16), Money.czk(50000), Optional.of(ACCOUNT), JANA_SYMBOL.value());
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(older, newer));
        when(donorRecords.findByVariableSymbol(JANA_SYMBOL)).thenReturn(Optional.of(jana));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana)));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 1, 1, 0));
        List<Donation> saved = savedDonations(2);
        assertThat(saved.get(0).bankPayment()).contains(newer.id());
        assertThat(saved.get(0).pairedBy()).contains(PairingMethod.VARIABLE_SYMBOL);
        assertThat(saved.get(0).donor()).isEqualTo(jana.id());
        assertThat(saved.get(1).bankPayment()).contains(older.id());
        assertThat(saved.get(1).pairedBy()).contains(PairingMethod.SENDER_ACCOUNT);
        assertThat(saved.get(1).donor()).isEqualTo(jana.id());
        assertThat(saved).allSatisfy(donation -> assertThat(donation.recordedAt()).isEqualTo(NOW));
        InOrder order = inOrder(donorRecords);
        order.verify(donorRecords).addSenderAccount(jana.id(), new LearnedSenderAccount(ACCOUNT, newer.id(), NOW));
        order.verify(donorRecords).findBySenderAccount(ACCOUNT);
        verify(donorRecords, never()).save(any());
    }

    @Test
    @DisplayName("Given a payment with a symbol nobody has from a learned account, when unpaired payments are paired, then nothing is paired or learned")
    void should_pair_nothing_when_unpaired_paired_given_unknown_symbol_from_learned_account() {
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.of(ACCOUNT), "1111111111")));
        when(donorRecords.findByVariableSymbol(new VariableSymbol("1111111111"))).thenReturn(Optional.empty());

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 1));
        verify(donorRecords, never()).findBySenderAccount(any());
        verify(donorRecords, never()).addSenderAccount(any(), any());
        verifyNoInteractions(donations);
    }

    @Test
    @DisplayName("Given two payments without a symbol from an account two donors learned, when unpaired payments are paired, then nothing is paired and one warning names the first payment but not the account")
    void should_pair_nothing_and_warn_once_when_unpaired_paired_given_ambiguous_account() {
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.of(ACCOUNT), null), payment(1002, Optional.of(ACCOUNT), null)));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana), withAccount(petr)));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 2));
        verify(donorRecords, times(1)).findBySenderAccount(ACCOUNT);
        verifyNoInteractions(donations);
        assertThat(warnings()).singleElement().satisfies(message -> assertThat(message).contains("1001").doesNotContain(ACCOUNT.accountNumber()));
    }

    @Test
    @DisplayName("Given a payment that already has a donation, when unpaired payments are paired, then no second donation is saved")
    void should_save_no_second_donation_when_unpaired_paired_given_existing_donation() {
        BankPayment paid = payment(1001, Optional.of(ACCOUNT), JANA_SYMBOL.value());
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(paid));
        when(donorRecords.findByVariableSymbol(JANA_SYMBOL)).thenReturn(Optional.of(jana));
        when(donations.existsForBankPayment(paid.id())).thenReturn(true);

        PairingOutcome outcome = service.pairUnpaired(NOW);

        verify(donations, never()).save(any());
        assertThat(outcome.pairedBySymbol()).isZero();
    }

    @Test
    @DisplayName("Given two payments with one donor's symbol from one account, when unpaired payments are paired, then the donor is looked up once and the account learned once")
    void should_look_up_donor_once_and_learn_once_when_unpaired_paired_given_two_symbol_payments() {
        BankPayment first = payment(1001, Optional.of(ACCOUNT), JANA_SYMBOL.value());
        BankPayment second = payment(1002, Optional.of(ACCOUNT), "000" + JANA_SYMBOL.value());
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(first, second));
        when(donorRecords.findByVariableSymbol(JANA_SYMBOL)).thenReturn(Optional.of(jana));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(2, 0, 1, 0));
        verify(donorRecords, times(1)).findByVariableSymbol(JANA_SYMBOL);
        verify(donorRecords, times(1)).addSenderAccount(any(), any());
        savedDonations(2);
    }

    @Test
    @DisplayName("Given payments without a symbol and without a Czech sender, when unpaired payments are paired, then no owner is looked up and they stay unpaired")
    void should_leave_unpaired_when_unpaired_paired_given_no_identification() {
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.empty(), null)));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 1));
        verify(donorRecords, never()).findBySenderAccount(any());
        verifyNoInteractions(donations);
    }

    @Test
    @DisplayName("Given a donor's symbol payment and an earlier payment without a symbol from the same account, when the donor's payments are paired, then both become the donor's donations")
    void should_pair_by_symbol_then_by_learned_account_when_donor_payments_paired() {
        BankPayment bySymbol = payment(1002, LocalDate.of(2026, 10, 12), Money.czk(50000), Optional.of(ACCOUNT), JANA_SYMBOL.value());
        BankPayment byAccount = payment(1001, LocalDate.of(2026, 10, 8), Money.czk(20000), Optional.of(ACCOUNT), null);
        when(payments.findUnpairedByMatchingVariableSymbol(JANA_SYMBOL)).thenReturn(List.of(bySymbol));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana)));
        when(payments.findUnpairedWithoutSymbolBySenderAccount(ACCOUNT)).thenReturn(List.of(byAccount));

        PairingOutcome outcome = service.pairPaymentsOf(jana, NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 1, 1, 0));
        List<Donation> saved = savedDonations(2);
        assertThat(saved).extracting(donation -> donation.bankPayment().orElseThrow()).containsExactly(bySymbol.id(), byAccount.id());
        assertThat(saved).extracting(donation -> donation.pairedBy().orElseThrow())
                .containsExactly(PairingMethod.VARIABLE_SYMBOL, PairingMethod.SENDER_ACCOUNT);
        verify(donorRecords).addSenderAccount(jana.id(), new LearnedSenderAccount(ACCOUNT, bySymbol.id(), NOW));
        verify(payments, never()).findUnpairedOrderedByBooking();
    }

    @Test
    @DisplayName("Given an account the donor shares with another donor, when the donor's payments are paired, then payments without a symbol from it stay unpaired")
    void should_not_pair_by_account_when_donor_payments_paired_given_shared_account() {
        BankPayment bySymbol = payment(1002, Optional.of(ACCOUNT), JANA_SYMBOL.value());
        when(payments.findUnpairedByMatchingVariableSymbol(JANA_SYMBOL)).thenReturn(List.of(bySymbol));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana), withAccount(petr)));

        PairingOutcome outcome = service.pairPaymentsOf(jana, NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 0, 1, 0));
        verify(payments, never()).findUnpairedWithoutSymbolBySenderAccount(any());
        savedDonations(1);
    }

    @Test
    @DisplayName("Given a donor's symbol payment from a foreign account, when the donor's payments are paired, then it is paired and no account is searched")
    void should_pair_without_account_pass_when_donor_payments_paired_given_foreign_sender() {
        when(payments.findUnpairedByMatchingVariableSymbol(JANA_SYMBOL)).thenReturn(List.of(payment(1001, Optional.empty(), JANA_SYMBOL.value())));

        PairingOutcome outcome = service.pairPaymentsOf(jana, NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 0, 0, 0));
        verify(donorRecords, never()).findBySenderAccount(any());
        verify(donorRecords, never()).addSenderAccount(any(), any());
    }

    @Test
    @DisplayName("Given a payment paired by the import between lookup and save, when the donor's payments are paired, then the integrity violation propagates")
    void should_propagate_when_donor_payments_paired_given_payment_paired_meanwhile() {
        BankPayment bySymbol = payment(1001, Optional.of(ACCOUNT), JANA_SYMBOL.value());
        when(payments.findUnpairedByMatchingVariableSymbol(JANA_SYMBOL)).thenReturn(List.of(bySymbol));
        doThrow(new DataIntegrityViolationException("uq_donation_bank_payment")).when(donations).save(any());

        assertThatThrownBy(() -> service.pairPaymentsOf(jana, NOW)).isInstanceOf(DataIntegrityViolationException.class);
    }

    private List<Donation> savedDonations(int count) {
        ArgumentCaptor<Donation> saved = ArgumentCaptor.forClass(Donation.class);
        verify(donations, times(count)).save(saved.capture());
        return saved.getAllValues();
    }

    private List<String> warnings() {
        return logs.list.stream().filter(event -> event.getLevel() == Level.WARN).map(ILoggingEvent::getFormattedMessage).toList();
    }

    private static DonorRecord donor(String name, VariableSymbol symbol) {
        return DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), name, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                symbol, LocaleCode.CS, NOW);
    }

    private static DonorRecord withAccount(DonorRecord record) {
        return DonorRecord.reconstitute(record.id(), DonorType.PERSON, record.name(), null, record.address(), record.variableSymbol(),
                record.preferredLocale(), Set.of(new LearnedSenderAccount(ACCOUNT, BankPaymentId.newId(NOW), NOW)), record.registeredAt(), NOW);
    }
}
