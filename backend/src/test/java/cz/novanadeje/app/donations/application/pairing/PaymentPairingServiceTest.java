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
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
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
import java.time.Year;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");

    @Mock
    private BankPaymentRepository payments;
    @Mock
    private DonorRecordRepository donorRecords;
    @Mock
    private DonationRepository donations;
    @Mock
    private SymbolClaimRepository claims;
    @Mock
    private PairingLock lock;

    private PaymentPairingService service;
    private ListAppender<ILoggingEvent> logs;
    private Logger logger;

    private final DonorRecord jana = donor("Jana Nováková", JANA_SYMBOL);
    private final DonorRecord petr = donor("Petr Svoboda", PETR_SYMBOL);

    @BeforeEach
    void setUp() {
        service = new PaymentPairingService(payments, donorRecords, donations, claims, lock, ExcludedSenderAccounts.none());
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
        DonorRecord storedJana = withAccount(jana);
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(storedJana));
        when(donorRecords.saveSenderAccountLink(any(), any())).thenReturn(true);

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 1, 0, 1, 0));
        List<Donation> saved = savedDonations(2);
        assertThat(saved.get(0).bankPayment()).contains(newer.id());
        assertThat(saved.get(0).pairedBy()).contains(PairingMethod.VARIABLE_SYMBOL);
        assertThat(saved.get(0).donor()).isEqualTo(jana.id());
        assertThat(saved.get(1).bankPayment()).contains(older.id());
        assertThat(saved.get(1).pairedBy()).contains(PairingMethod.SENDER_ACCOUNT);
        assertThat(saved.get(1).donor()).isEqualTo(jana.id());
        assertThat(saved.get(1).pairedThrough()).contains(storedJana.senderAccountLinks().getFirst().id());
        assertThat(saved.get(0).pairedThrough()).isEmpty();
        assertThat(saved).allSatisfy(donation -> assertThat(donation.recordedAt()).isEqualTo(NOW));
        ArgumentCaptor<SenderAccountLink> learned = ArgumentCaptor.forClass(SenderAccountLink.class);
        InOrder order = inOrder(donorRecords);
        order.verify(donorRecords).findBySenderAccount(ACCOUNT);
        order.verify(donorRecords).saveSenderAccountLink(eq(jana.id()), learned.capture());
        order.verify(donorRecords).findBySenderAccount(ACCOUNT);
        assertThat(learned.getValue().account()).isEqualTo(ACCOUNT);
        assertThat(learned.getValue().provedBy()).contains(newer.id());
        assertThat(learned.getValue().validFrom()).isEmpty();
        verify(donorRecords, never()).save(any());
    }

    @Test
    @DisplayName("Given a payment with a symbol nobody has from a learned account, when unpaired payments are paired, then nothing is paired or learned")
    void should_pair_nothing_when_unpaired_paired_given_unknown_symbol_from_learned_account() {
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.of(ACCOUNT), "1111111111")));
        when(donorRecords.findByVariableSymbol(new VariableSymbol("1111111111"))).thenReturn(Optional.empty());

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 0, 1));
        verify(donorRecords, never()).findBySenderAccount(any());
        verify(donorRecords, never()).saveSenderAccountLink(any(), any());
        verifyNoInteractions(donations);
    }

    @Test
    @DisplayName("Given two payments without a symbol from an account two donors learned, when unpaired payments are paired, then nothing is paired and one warning names the first payment but not the account")
    void should_pair_nothing_and_warn_once_when_unpaired_paired_given_ambiguous_account() {
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.of(ACCOUNT), null), payment(1002, Optional.of(ACCOUNT), null)));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana), withAccount(petr)));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 0, 2));
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
        when(donorRecords.saveSenderAccountLink(any(), any())).thenReturn(true);

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(2, 0, 0, 1, 0));
        verify(donorRecords, times(1)).findByVariableSymbol(JANA_SYMBOL);
        verify(donorRecords, times(1)).saveSenderAccountLink(any(), any());
        savedDonations(2);
    }

    @Test
    @DisplayName("Given payments without a symbol and without a Czech sender, when unpaired payments are paired, then no owner is looked up and they stay unpaired")
    void should_leave_unpaired_when_unpaired_paired_given_no_identification() {
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.empty(), null)));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 0, 1));
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
        when(donorRecords.saveSenderAccountLink(any(), any())).thenReturn(true);
        when(payments.findUnpairedWithoutSymbolBySenderAccount(ACCOUNT)).thenReturn(List.of(byAccount));

        PairingOutcome outcome = service.pairPaymentsOf(jana, NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 1, 0, 1, 0));
        List<Donation> saved = savedDonations(2);
        assertThat(saved).extracting(donation -> donation.bankPayment().orElseThrow()).containsExactly(bySymbol.id(), byAccount.id());
        assertThat(saved).extracting(donation -> donation.pairedBy().orElseThrow())
                .containsExactly(PairingMethod.VARIABLE_SYMBOL, PairingMethod.SENDER_ACCOUNT);
        verify(donorRecords).saveSenderAccountLink(eq(jana.id()), any());
        verify(payments, never()).findUnpairedOrderedByBooking();
    }

    @Test
    @DisplayName("Given an account the donor shares with another donor, when the donor's payments are paired, then payments without a symbol from it stay unpaired")
    void should_not_pair_by_account_when_donor_payments_paired_given_shared_account() {
        BankPayment bySymbol = payment(1002, Optional.of(ACCOUNT), JANA_SYMBOL.value());
        when(payments.findUnpairedByMatchingVariableSymbol(JANA_SYMBOL)).thenReturn(List.of(bySymbol));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana), withAccount(petr)));
        when(donorRecords.saveSenderAccountLink(any(), any())).thenReturn(true);
        when(payments.findUnpairedWithoutSymbolBySenderAccount(ACCOUNT)).thenReturn(List.of(payment(1003, Optional.of(ACCOUNT), null)));

        PairingOutcome outcome = service.pairPaymentsOf(jana, NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 0, 0, 1, 1));
        savedDonations(1);
    }

    @Test
    @DisplayName("Given a donor's symbol payment from a foreign account, when the donor's payments are paired, then it is paired and no account is searched")
    void should_pair_without_account_pass_when_donor_payments_paired_given_foreign_sender() {
        when(payments.findUnpairedByMatchingVariableSymbol(JANA_SYMBOL)).thenReturn(List.of(payment(1001, Optional.empty(), JANA_SYMBOL.value())));

        PairingOutcome outcome = service.pairPaymentsOf(jana, NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 0, 0, 0, 0));
        verify(donorRecords, never()).findBySenderAccount(any());
        verify(donorRecords, never()).saveSenderAccountLink(any(), any());
    }

    @Test
    @DisplayName("Given a payment paired by the import between lookup and save, when the donor's payments are paired, then the integrity violation propagates")
    void should_propagate_when_donor_payments_paired_given_payment_paired_meanwhile() {
        BankPayment bySymbol = payment(1001, Optional.of(ACCOUNT), JANA_SYMBOL.value());
        when(payments.findUnpairedByMatchingVariableSymbol(JANA_SYMBOL)).thenReturn(List.of(bySymbol));
        doThrow(new DataIntegrityViolationException("uq_donation_bank_payment")).when(donations).save(any());

        assertThatThrownBy(() -> service.pairPaymentsOf(jana, NOW)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("Given an account another donor disconnected on a day, when a donor proves it with a symbol payment, then the new link starts the day after")
    void should_start_link_after_release_when_unpaired_paired_given_account_released_by_another_donor() {
        LocalDate released = LocalDate.of(2026, 9, 30);
        BankPayment proof = payment(1001, Optional.of(ACCOUNT), PETR_SYMBOL.value());
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(proof));
        when(donorRecords.findByVariableSymbol(PETR_SYMBOL)).thenReturn(Optional.of(petr));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withLink(jana, SenderAccountLinkStatus.DISCONNECTED, Optional.of(released))));
        when(donorRecords.saveSenderAccountLink(any(), any())).thenReturn(true);

        service.pairUnpaired(NOW);

        ArgumentCaptor<SenderAccountLink> learned = ArgumentCaptor.forClass(SenderAccountLink.class);
        verify(donorRecords).saveSenderAccountLink(eq(petr.id()), learned.capture());
        assertThat(learned.getValue().validFrom()).contains(released.plusDays(1));
    }

    @Test
    @DisplayName("Given a payment without a symbol from an excluded account, when unpaired payments are paired, then it stays unpaired and no owner is looked up for it")
    void should_leave_unpaired_when_unpaired_paired_given_excluded_account() {
        PaymentPairingService excluding = new PaymentPairingService(payments, donorRecords, donations, claims, lock,
                new ExcludedSenderAccounts(Set.of(ACCOUNT)));
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.of(ACCOUNT), null)));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana)));

        PairingOutcome outcome = excluding.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 0, 1));
        verifyNoInteractions(donations);
    }

    @Test
    @DisplayName("Given unpaired payments, when they are paired for the import, for a registration or for a confirmed claim, then the pairing lock is taken before anything is read")
    void should_take_lock_before_any_read_when_paired_given_each_entry_point() {
        SymbolClaim claim = confirmed(jana, OLD_SYMBOL);
        InOrder order = inOrder(lock, payments, donorRecords, claims, donations);

        service.pairUnpaired(NOW);
        order.verify(lock).acquire();
        order.verify(payments).findUnpairedOrderedByBooking();

        service.pairPaymentsOf(jana, NOW);
        order.verify(lock).acquire();
        order.verify(payments).findUnpairedByMatchingVariableSymbol(JANA_SYMBOL);

        service.pairConfirmedSymbol(claim, NOW);
        order.verify(lock).acquire();
        order.verify(donorRecords).findByVariableSymbol(OLD_SYMBOL);
        order.verify(payments).findUnpairedBySenderAccountAndMatchingVariableSymbol(ACCOUNT, OLD_SYMBOL);
    }

    @Test
    @DisplayName("Given a payment with a symbol nobody has that the account's sole owner confirmed, when unpaired payments are paired, then it is paired by the confirmed symbol through the owner's link and nothing is learned")
    void should_pair_by_confirmed_symbol_and_learn_nothing_when_unpaired_paired_given_confirmed_claim() {
        BankPayment old = payment(1001, Optional.of(ACCOUNT), OLD_SYMBOL.value());
        DonorRecord storedJana = withAccount(jana);
        SymbolClaim claim = confirmed(jana, OLD_SYMBOL);
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(old));
        when(donorRecords.findByVariableSymbol(OLD_SYMBOL)).thenReturn(Optional.empty());
        when(claims.findConfirmed()).thenReturn(List.of(claim));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(storedJana));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 1, 0, 0));
        assertThat(savedDonations(1)).singleElement().satisfies(donation -> {
            assertThat(donation.bankPayment()).contains(old.id());
            assertThat(donation.donor()).isEqualTo(jana.id());
            assertThat(donation.pairedBy()).contains(PairingMethod.CONFIRMED_SYMBOL);
            assertThat(donation.pairedThrough()).contains(storedJana.senderAccountLinks().getFirst().id());
            assertThat(donation.confirmedClaim()).contains(claim.id());
        });
        verify(donorRecords, never()).saveSenderAccountLink(any(), any());
        verify(claims, times(1)).findConfirmed();
    }

    @Test
    @DisplayName("Given a payment with a symbol nobody has and an earlier payment with the donor's symbol that proves the account, when unpaired payments are paired, then the confirmed-symbol pass runs after the account is learned")
    void should_pair_by_confirmed_symbol_after_learning_when_unpaired_paired_given_link_proved_in_same_run() {
        BankPayment old = payment(1001, LocalDate.of(2026, 10, 10), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        BankPayment proof = payment(1002, LocalDate.of(2026, 10, 16), Money.czk(100), Optional.of(ACCOUNT), JANA_SYMBOL.value());
        DonorRecord storedJana = withAccount(jana);
        SymbolClaim claim = confirmed(jana, OLD_SYMBOL);
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(old, proof));
        when(donorRecords.findByVariableSymbol(OLD_SYMBOL)).thenReturn(Optional.empty());
        when(donorRecords.findByVariableSymbol(JANA_SYMBOL)).thenReturn(Optional.of(jana));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(), List.of(storedJana));
        when(donorRecords.saveSenderAccountLink(any(), any())).thenReturn(true);
        when(claims.findConfirmed()).thenReturn(List.of(claim));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 0, 1, 1, 0));
        assertThat(savedDonations(2)).extracting(donation -> donation.pairedBy().orElseThrow())
                .containsExactly(PairingMethod.VARIABLE_SYMBOL, PairingMethod.CONFIRMED_SYMBOL);
        InOrder order = inOrder(donorRecords, claims);
        order.verify(donorRecords).saveSenderAccountLink(eq(jana.id()), any());
        order.verify(claims).findConfirmed();
        order.verify(donorRecords).findBySenderAccount(ACCOUNT);
    }

    @Test
    @DisplayName("Given payments with a confirmed symbol from an account another donor proves in the same run, when unpaired payments are paired, then they stay unpaired and one warning names the first payment and the claim but neither the account nor the symbol")
    void should_leave_unpaired_and_warn_once_when_unpaired_paired_given_link_learned_by_another_donor_in_same_run() {
        BankPayment first = payment(1001, LocalDate.of(2026, 10, 10), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        BankPayment second = payment(1002, LocalDate.of(2026, 10, 11), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        BankPayment petrs = payment(1003, LocalDate.of(2026, 10, 12), Money.czk(30000), Optional.of(ACCOUNT), PETR_SYMBOL.value());
        SymbolClaim claim = confirmed(jana, OLD_SYMBOL);
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(first, second, petrs));
        when(donorRecords.findByVariableSymbol(OLD_SYMBOL)).thenReturn(Optional.empty());
        when(donorRecords.findByVariableSymbol(PETR_SYMBOL)).thenReturn(Optional.of(petr));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana)), List.of(withAccount(jana), withAccount(petr)));
        when(donorRecords.saveSenderAccountLink(any(), any())).thenReturn(true);
        when(claims.findConfirmed()).thenReturn(List.of(claim));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(1, 0, 0, 1, 2));
        assertThat(savedDonations(1)).singleElement().satisfies(donation -> assertThat(donation.donor()).isEqualTo(petr.id()));
        assertThat(warnings()).singleElement().satisfies(message -> assertThat(message)
                .contains("1001", claim.id().toString())
                .doesNotContain(ACCOUNT.accountNumber(), OLD_SYMBOL.value()));
    }

    @Test
    @DisplayName("Given payments with a symbol nobody has and no claim confirming it, when unpaired payments are paired, then no owner is looked up and they stay unpaired")
    void should_look_up_no_owner_when_unpaired_paired_given_no_confirming_claim() {
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.of(ACCOUNT), OLD_SYMBOL.value())));
        when(donorRecords.findByVariableSymbol(OLD_SYMBOL)).thenReturn(Optional.empty());
        when(claims.findConfirmed()).thenReturn(List.of(confirmed(jana, new VariableSymbol("6123456788")),
                SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), jana.id(), ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.DECLINED, NOW)));

        PairingOutcome outcome = service.pairUnpaired(NOW);

        assertThat(outcome).isEqualTo(new PairingOutcome(0, 0, 0, 0, 1));
        verify(donorRecords, never()).findBySenderAccount(any());
        verifyNoInteractions(donations);
    }

    @Test
    @DisplayName("Given only payments the symbol and account passes settle, when unpaired payments are paired, then the confirmed claims are not read")
    void should_not_read_claims_when_unpaired_paired_given_no_payment_with_unknown_symbol() {
        when(payments.findUnpairedOrderedByBooking()).thenReturn(List.of(payment(1001, Optional.of(ACCOUNT), JANA_SYMBOL.value())));
        when(donorRecords.findByVariableSymbol(JANA_SYMBOL)).thenReturn(Optional.of(jana));

        service.pairUnpaired(NOW);

        verifyNoInteractions(claims);
    }

    @Test
    @DisplayName("Given a confirmed claim, when its payments are paired, then only the unpaired payments with its symbol from its account the claimant alone covers are paired and returned with their years")
    void should_pair_and_return_claim_payments_when_confirmed_symbol_paired_given_claim() {
        DonorRecord storedJana = withLink(jana, SenderAccountLinkStatus.ACTIVE, Optional.empty());
        BankPayment lastYear = payment(1001, LocalDate.of(2025, 12, 5), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        BankPayment thisYear = payment(1002, LocalDate.of(2026, 1, 5), Money.czk(50000), Optional.of(ACCOUNT), "0" + OLD_SYMBOL.value());
        BankPayment alsoThisYear = payment(1003, LocalDate.of(2026, 2, 5), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        SymbolClaim claim = confirmed(jana, OLD_SYMBOL);
        when(donorRecords.findByVariableSymbol(OLD_SYMBOL)).thenReturn(Optional.empty());
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(storedJana));
        when(payments.findUnpairedBySenderAccountAndMatchingVariableSymbol(ACCOUNT, OLD_SYMBOL)).thenReturn(List.of(lastYear, thisYear, alsoThisYear));

        ConfirmedSymbolPairing pairing = service.pairConfirmedSymbol(claim, NOW);

        List<Donation> saved = savedDonations(3);
        assertThat(pairing.paired()).containsExactlyElementsOf(saved);
        assertThat(pairing.count()).isEqualTo(3);
        assertThat(pairing.years()).containsExactly(Year.of(2025), Year.of(2026));
        assertThat(saved).allSatisfy(donation -> {
            assertThat(donation.pairedBy()).contains(PairingMethod.CONFIRMED_SYMBOL);
            assertThat(donation.confirmedClaim()).contains(claim.id());
            assertThat(donation.pairedThrough()).contains(storedJana.senderAccountLinks().getFirst().id());
        });
        verify(payments, never()).findUnpairedOrderedByBooking();
        verify(donorRecords, never()).saveSenderAccountLink(any(), any());
    }

    @Test
    @DisplayName("Given a claim payment already paired meanwhile and one on a day another donor's link also covers, when the claim's payments are paired, then neither is paired or returned")
    void should_skip_paired_and_ambiguous_when_confirmed_symbol_paired_given_race_and_shared_day() {
        BankPayment pairedMeanwhile = payment(1001, LocalDate.of(2026, 10, 5), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        BankPayment shared = payment(1002, LocalDate.of(2026, 10, 15), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        DonorRecord storedJana = withAccount(jana);
        DonorRecord petrFrom = DonorRecord.reconstitute(petr.id(), DonorType.PERSON, petr.name(), null, petr.address(), petr.variableSymbol(),
                petr.preferredLocale(), List.of(SenderAccountLink.reconstitute(SenderAccountLinkId.newId(NOW), ACCOUNT, SenderAccountLinkStatus.ACTIVE,
                        Optional.of(BankPaymentId.newId(NOW)), Optional.of(NOW), Optional.of(LocalDate.of(2026, 10, 10)), Optional.empty(), NOW,
                        Optional.empty())), petr.registeredAt(), NOW, null);
        when(donorRecords.findByVariableSymbol(OLD_SYMBOL)).thenReturn(Optional.empty());
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(storedJana, petrFrom));
        when(payments.findUnpairedBySenderAccountAndMatchingVariableSymbol(ACCOUNT, OLD_SYMBOL)).thenReturn(List.of(pairedMeanwhile, shared));
        when(donations.existsForBankPayment(pairedMeanwhile.id())).thenReturn(true);

        ConfirmedSymbolPairing pairing = service.pairConfirmedSymbol(confirmed(jana, OLD_SYMBOL), NOW);

        assertThat(pairing.paired()).isEmpty();
        assertThat(pairing.count()).isZero();
        assertThat(pairing.years()).isEmpty();
        verify(donations, never()).save(any());
    }

    @Test
    @DisplayName("Given a confirmed symbol that a donor registered in between, when the claim's payments are paired, then they go to that donor by symbol and none is returned")
    void should_pair_by_symbol_when_confirmed_symbol_paired_given_symbol_registered_in_between() {
        DonorRecord holder = donor("Eva Malá", OLD_SYMBOL);
        BankPayment payment = payment(1001, Optional.of(ACCOUNT), OLD_SYMBOL.value());
        when(donorRecords.findByVariableSymbol(OLD_SYMBOL)).thenReturn(Optional.of(holder));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(withAccount(jana)));
        when(payments.findUnpairedBySenderAccountAndMatchingVariableSymbol(ACCOUNT, OLD_SYMBOL)).thenReturn(List.of(payment));
        when(donorRecords.saveSenderAccountLink(any(), any())).thenReturn(true);

        ConfirmedSymbolPairing pairing = service.pairConfirmedSymbol(confirmed(jana, OLD_SYMBOL), NOW);

        assertThat(pairing.paired()).isEmpty();
        assertThat(savedDonations(1)).singleElement().satisfies(donation -> {
            assertThat(donation.donor()).isEqualTo(holder.id());
            assertThat(donation.pairedBy()).contains(PairingMethod.VARIABLE_SYMBOL);
        });
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
        return withLink(record, SenderAccountLinkStatus.ACTIVE, Optional.empty());
    }

    private static DonorRecord withLink(DonorRecord record, SenderAccountLinkStatus status, Optional<LocalDate> validTo) {
        SenderAccountLink link = SenderAccountLink.reconstitute(SenderAccountLinkId.newId(NOW), ACCOUNT, status, Optional.of(BankPaymentId.newId(NOW)),
                Optional.of(NOW), Optional.empty(), validTo, NOW, validTo.map(day -> NOW));
        return DonorRecord.reconstitute(record.id(), DonorType.PERSON, record.name(), null, record.address(), record.variableSymbol(),
                record.preferredLocale(), List.of(link), record.registeredAt(), NOW, null);
    }

    private static SymbolClaim confirmed(DonorRecord donor, VariableSymbol symbol) {
        return SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), donor.id(), ACCOUNT, symbol, SymbolClaimAnswer.CONFIRMED, NOW);
    }
}
