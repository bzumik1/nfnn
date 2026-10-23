package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.application.pairing.ConfirmedSymbolPairing;
import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkNotFound;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAlreadyAnswered;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.donor.SymbolOfferNotAvailable;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.PAYER_NAME;
import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.SNAPSHOT_CONTENT;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(OutputCaptureExtension.class)
class SymbolClaimServiceTest {

    private static final Instant NOW = Instant.parse("2027-01-20T09:00:00Z");
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final VariableSymbol JANA_SYMBOL = new VariableSymbol("4821937560");
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");
    private static final VariableSymbol OTHER_OLD_SYMBOL = new VariableSymbol("5123456789");
    private static final DonorReference JANA = new DonorReference(UuidV7.generate(NOW));
    private static final DonorReference PETR = new DonorReference(UuidV7.generate(NOW.plusSeconds(1)));
    private static final FirstReceiptYear FROM_2026 = new FirstReceiptYear(Year.of(2026));

    private final BankPayment december = gift(1, LocalDate.of(2025, 12, 5), OLD_SYMBOL.value());
    private final BankPayment september = gift(2, LocalDate.of(2026, 9, 5), OLD_SYMBOL.value());
    private final BankPayment verification = payment(3, LocalDate.of(2027, 1, 14), czk(100), Optional.of(ACCOUNT), JANA_SYMBOL.value(),
            "OVERENI UCTU NADACNI FOND NOVA NADEJE");
    private final SenderAccountLink link = SenderAccountLink.reconstitute(SenderAccountLinkId.newId(NOW), ACCOUNT, SenderAccountLinkStatus.ACTIVE,
            Optional.of(verification.id()), Optional.of(NOW), Optional.empty(), Optional.empty(), NOW, Optional.empty());
    private final DonorRecord jana = DonorRecord.reconstitute(JANA, DonorType.PERSON, "Jana Nováková", null,
            new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), JANA_SYMBOL, LocaleCode.CS, List.of(link), NOW, NOW, null);
    private final Donation verificationDonation = Donation.fromBankPayment(DonationId.newId(NOW), JANA, verification,
            PairingMethod.VARIABLE_SYMBOL, NOW);

    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final BankPaymentRepository payments = mock(BankPaymentRepository.class);
    private final SymbolClaimRepository claims = mock(SymbolClaimRepository.class);
    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final PaymentPairingService pairing = mock(PaymentPairingService.class);
    private final PairingLock lock = mock(PairingLock.class);
    private final SymbolClaimService service = service(FROM_2026);

    @BeforeEach
    void janaVerifiedTheAccountOfHerStandingOrder() {
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(verificationDonation));
        when(payments.findBySenderAccount(ACCOUNT)).thenReturn(List.of(december, september, verification));
        when(payments.findUnpairedBySenderAccountAndMatchingVariableSymbol(ACCOUNT, OLD_SYMBOL)).thenReturn(List.of(december, september));
        when(claims.saveIfAbsent(any())).thenReturn(true);
        when(pairing.pairConfirmedSymbol(any(), eq(NOW))).thenReturn(new ConfirmedSymbolPairing(List.of()));
    }

    @Test
    @DisplayName("Given the offered symbol, when confirmed, then the lock is taken first, the confirmed claim is stored and its payments are paired")
    void should_store_confirmed_claim_and_pair_under_lock_when_confirmed_given_offered_symbol() {
        when(pairing.pairConfirmedSymbol(any(), eq(NOW))).thenReturn(new ConfirmedSymbolPairing(List.of(confirmed(december), confirmed(september))));

        SymbolClaimConfirmation confirmation = service.confirm(JANA, link.id(), OLD_SYMBOL);

        ArgumentCaptor<SymbolClaim> stored = ArgumentCaptor.forClass(SymbolClaim.class);
        InOrder order = inOrder(lock, donorRecords, claims, pairing);
        order.verify(lock).acquire();
        order.verify(donorRecords).findById(JANA);
        order.verify(claims).saveIfAbsent(stored.capture());
        order.verify(pairing).pairConfirmedSymbol(stored.getValue(), NOW);
        assertThat(stored.getValue().donor()).isEqualTo(JANA);
        assertThat(stored.getValue().account()).isEqualTo(ACCOUNT);
        assertThat(stored.getValue().symbol()).isEqualTo(OLD_SYMBOL);
        assertThat(stored.getValue().answer()).isEqualTo(SymbolClaimAnswer.CONFIRMED);
        assertThat(stored.getValue().answeredAt()).isEqualTo(NOW);
        assertThat(confirmation.pairedCount()).isEqualTo(2);
        assertThat(confirmation.changedYearlyReceipts()).isEmpty();
    }

    @Test
    @DisplayName("Given active yearly receipts for 2025 and 2026 and receipts from 2026, when a confirmation pairs payments of both years, then only 2026 is reported as changed")
    void should_report_only_admitted_years_with_active_receipt_when_confirmed_given_receipts_of_paired_years() {
        when(pairing.pairConfirmedSymbol(any(), eq(NOW))).thenReturn(new ConfirmedSymbolPairing(List.of(confirmed(december), confirmed(september))));
        when(receipts.findActiveForYear(JANA, Year.of(2025))).thenReturn(Optional.of(yearlyReceipt(Year.of(2025))));
        when(receipts.findActiveForYear(JANA, Year.of(2026))).thenReturn(Optional.of(yearlyReceipt(Year.of(2026))));

        assertThat(service.confirm(JANA, link.id(), OLD_SYMBOL).changedYearlyReceipts()).containsExactly(Year.of(2026));
    }

    @Test
    @DisplayName("Given receipts from 2025 and active yearly receipts for 2025 and 2026, when a confirmation pairs payments of both years, then both years are reported in ascending order")
    void should_report_years_ascending_when_confirmed_given_receipts_from_2025() {
        when(pairing.pairConfirmedSymbol(any(), eq(NOW))).thenReturn(new ConfirmedSymbolPairing(List.of(confirmed(september), confirmed(december))));
        when(receipts.findActiveForYear(JANA, Year.of(2025))).thenReturn(Optional.of(yearlyReceipt(Year.of(2025))));
        when(receipts.findActiveForYear(JANA, Year.of(2026))).thenReturn(Optional.of(yearlyReceipt(Year.of(2026))));

        assertThat(service(new FirstReceiptYear(Year.of(2025))).confirm(JANA, link.id(), OLD_SYMBOL).changedYearlyReceipts())
                .containsExactly(Year.of(2025), Year.of(2026));
    }

    @Test
    @DisplayName("Given the offered symbol, when declined, then the declined claim is stored and nothing is paired")
    void should_store_declined_claim_without_pairing_when_declined_given_offered_symbol() {
        service.decline(JANA, link.id(), OLD_SYMBOL);

        ArgumentCaptor<SymbolClaim> stored = ArgumentCaptor.forClass(SymbolClaim.class);
        InOrder order = inOrder(lock, donorRecords, claims);
        order.verify(lock).acquire();
        order.verify(donorRecords).findById(JANA);
        order.verify(claims).saveIfAbsent(stored.capture());
        assertThat(stored.getValue().answer()).isEqualTo(SymbolClaimAnswer.DECLINED);
        assertThat(stored.getValue().symbol()).isEqualTo(OLD_SYMBOL);
        verifyNoInteractions(pairing, receipts);
    }

    @Test
    @DisplayName("Given a donor without a record, or a link that is not the donor's, when answered, then the bank account is not found and nothing is stored")
    void should_not_find_bank_account_when_answered_given_unknown_or_foreign_link() {
        SenderAccountLinkId foreign = SenderAccountLinkId.newId(NOW);

        assertThatThrownBy(() -> service.confirm(JANA, foreign, OLD_SYMBOL)).isInstanceOf(SenderAccountLinkNotFound.class);
        assertThatThrownBy(() -> service.decline(JANA, foreign, OLD_SYMBOL)).isInstanceOf(SenderAccountLinkNotFound.class);
        assertThatThrownBy(() -> service.confirm(PETR, link.id(), OLD_SYMBOL)).isInstanceOf(SenderAccountLinkNotFound.class);
        verify(claims, never()).saveIfAbsent(any());
        verifyNoInteractions(pairing);
    }

    @Test
    @DisplayName("Given the donor already answered the symbol at the account, when answered again, then it is already answered and nothing is stored")
    void should_refuse_as_already_answered_when_answered_given_stored_answer() {
        when(claims.findByDonor(JANA)).thenReturn(List.of(claim(JANA, OLD_SYMBOL, SymbolClaimAnswer.DECLINED)));

        assertThatThrownBy(() -> service.confirm(JANA, link.id(), OLD_SYMBOL))
                .isInstanceOf(SymbolClaimAlreadyAnswered.class)
                .hasMessageNotContaining(OLD_SYMBOL.value());
        assertThatThrownBy(() -> service.decline(JANA, link.id(), OLD_SYMBOL)).isInstanceOf(SymbolClaimAlreadyAnswered.class);
        verify(claims, never()).saveIfAbsent(any());
        verifyNoInteractions(pairing);
    }

    @Test
    @DisplayName("Given an answer stored at the same moment by another request, when the insert is ignored, then it is already answered and nothing is paired")
    void should_refuse_as_already_answered_when_confirmed_given_concurrent_answer() {
        when(claims.saveIfAbsent(any())).thenReturn(false);

        assertThatThrownBy(() -> service.confirm(JANA, link.id(), OLD_SYMBOL)).isInstanceOf(SymbolClaimAlreadyAnswered.class);
        verifyNoInteractions(pairing);
    }

    @Test
    @DisplayName("Given a symbol the account was not asked about, when answered, then the offer is not available and nothing is stored")
    void should_refuse_offer_when_answered_given_other_symbol() {
        assertThatThrownBy(() -> service.confirm(JANA, link.id(), OTHER_OLD_SYMBOL))
                .isInstanceOf(SymbolOfferNotAvailable.class)
                .hasMessageNotContaining(OTHER_OLD_SYMBOL.value());
        assertThatThrownBy(() -> service.decline(JANA, link.id(), OTHER_OLD_SYMBOL)).isInstanceOf(SymbolOfferNotAvailable.class);
        verify(claims, never()).saveIfAbsent(any());
        verifyNoInteractions(pairing);
    }

    @Test
    @DisplayName("Given a second symbol from the account before the verification, when the earlier offered symbol is confirmed, then the offer is gone")
    void should_refuse_offer_when_confirmed_given_second_symbol_arrived() {
        when(payments.findBySenderAccount(ACCOUNT)).thenReturn(List.of(gift(4, LocalDate.of(2025, 6, 5), OTHER_OLD_SYMBOL.value()), december,
                september, verification));

        assertThatThrownBy(() -> service.confirm(JANA, link.id(), OLD_SYMBOL)).isInstanceOf(SymbolOfferNotAvailable.class);
        verify(claims, never()).saveIfAbsent(any());
    }

    @Test
    @DisplayName("Given no verification payment among the donor's donations, when confirmed, then the offer is not available")
    void should_refuse_offer_when_confirmed_given_no_verification_payment() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(Donation.fromBankPayment(DonationId.newId(NOW), JANA, verification,
                PairingMethod.SENDER_ACCOUNT, NOW)));

        assertThatThrownBy(() -> service.confirm(JANA, link.id(), OLD_SYMBOL)).isInstanceOf(SymbolOfferNotAvailable.class);
    }

    @Test
    @DisplayName("Given the only other symbol belongs to a registered donor, when confirmed, then the offer is not available")
    void should_refuse_offer_when_confirmed_given_symbol_of_registered_donor() {
        when(donorRecords.findByVariableSymbol(OLD_SYMBOL)).thenReturn(Optional.of(DonorRecord.reconstitute(PETR, DonorType.PERSON, "Petr Svoboda",
                null, new PostalAddress("Krátká 3", "Teplice", "415 01"), OLD_SYMBOL, LocaleCode.CS, List.of(), NOW, NOW, null)));

        assertThatThrownBy(() -> service.confirm(JANA, link.id(), OLD_SYMBOL)).isInstanceOf(SymbolOfferNotAvailable.class);
        verify(claims, never()).saveIfAbsent(any());
    }

    @Test
    @DisplayName("Given a confirmation and a decline, when they are logged, then no symbol, account digits or name appear")
    void should_log_ids_only_when_answered_given_symbol_account_and_name(CapturedOutput output) {
        when(pairing.pairConfirmedSymbol(any(), eq(NOW))).thenReturn(new ConfirmedSymbolPairing(List.of(confirmed(december))));

        service.confirm(JANA, link.id(), OLD_SYMBOL);
        when(claims.findByDonor(JANA)).thenReturn(List.of());
        service.decline(JANA, link.id(), OLD_SYMBOL);

        assertThat(output.getAll())
                .contains(JANA.toString(), link.id().toString())
                .doesNotContain(OLD_SYMBOL.value(), ACCOUNT.accountNumber(), ACCOUNT.display(), PAYER_NAME, jana.name());
    }

    private SymbolClaimService service(FirstReceiptYear firstYear) {
        return new SymbolClaimService(donorRecords, donations, claims, receipts,
                new SymbolClaimOffers(payments, donorRecords, claims, ExcludedSenderAccounts.none()), pairing, lock, firstYear,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static BankPayment gift(long transactionId, LocalDate bookedOn, String variableSymbol) {
        return payment(transactionId, bookedOn, czk(50000), Optional.of(ACCOUNT), variableSymbol);
    }

    private Donation confirmed(BankPayment payment) {
        return Donation.pairedByConfirmedSymbol(DonationId.newId(NOW), JANA, payment, link.id(), SymbolClaimId.newId(NOW), NOW);
    }

    private static SymbolClaim claim(DonorReference donor, VariableSymbol symbol, SymbolClaimAnswer answer) {
        return SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), donor, ACCOUNT, symbol, answer, NOW);
    }

    private static DonationReceipt yearlyReceipt(Year year) {
        return DonationReceipt.issueForYear(DonationReceiptId.newId(NOW), JANA, year, ReceiptNumber.of(Year.of(2027), 1), LocalDate.of(2027, 1, 15),
                NOW, LocaleCode.CS, new ReceiptFingerprint("0123456789abcdef".repeat(4)), SNAPSHOT_CONTENT, Optional.empty());
    }
}
