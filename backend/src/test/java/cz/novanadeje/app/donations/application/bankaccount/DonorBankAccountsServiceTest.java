package cz.novanadeje.app.donations.application.bankaccount;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountAlreadyConnected;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkNotFound;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.pairing.SymbolClaimOffer;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DonorBankAccountsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T22:30:00Z");
    private static final LocalDate PRAGUE_TODAY = LocalDate.of(2026, 10, 18);
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final SenderAccount OTHER_ACCOUNT = new SenderAccount("1234567", "0800");
    private static final DonorReference JANA = new DonorReference(UuidV7.generate(NOW));
    private static final DonorReference PETR = new DonorReference(UuidV7.generate(NOW.plusSeconds(1)));
    private static final VariableSymbol JANA_SYMBOL = new VariableSymbol("4821937560");
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");
    private static final VariableSymbol OTHER_OLD_SYMBOL = new VariableSymbol("5123456789");

    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final BankPaymentRepository payments = mock(BankPaymentRepository.class);
    private final SymbolClaimRepository claims = mock(SymbolClaimRepository.class);
    private final DonorBankAccountsService service = service(ExcludedSenderAccounts.none());

    @Test
    @DisplayName("Given links and donations paired through them, when listed, then live links come first, newest first, with their received donations counted")
    void should_list_live_links_first_with_counts_when_listed_given_links_and_donations() {
        SenderAccountLink older = active(ACCOUNT, NOW.minusSeconds(7200));
        SenderAccountLink newer = active(OTHER_ACCOUNT, NOW.minusSeconds(3600));
        SenderAccountLink ended = disconnected(new SenderAccount("19-2000145399", "0800"), NOW.minusSeconds(1));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, older, newer, ended)));
        when(donorRecords.findBySenderAccount(any())).thenReturn(List.of());
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(
                through(older, LocalDate.of(2026, 10, 12), 30000, DonationStatus.RECEIVED),
                through(older, LocalDate.of(2026, 10, 5), 20000, DonationStatus.RECEIVED),
                through(older, LocalDate.of(2026, 10, 14), 99900, DonationStatus.REFUNDED)));

        List<BankAccountView> views = service.listBankAccounts(JANA);

        assertThat(views).extracting(view -> view.link().id()).containsExactly(newer.id(), older.id(), ended.id());
        BankAccountView olderView = views.get(1);
        assertThat(olderView.donationCount()).isEqualTo(2);
        assertThat(olderView.total()).isEqualTo(Money.czk(50000));
        assertThat(olderView.lastDonationOn()).contains(LocalDate.of(2026, 10, 12));
        assertThat(views.getFirst().donationCount()).isZero();
        assertThat(views.getFirst().lastDonationOn()).isEmpty();
        assertThat(olderView.verifiedOn()).contains(LocalDate.of(2026, 10, 17));
    }

    @Test
    @DisplayName("Given an active link another donor also uses, when listed, then it is shared, and a disconnected one never is")
    void should_mark_shared_when_listed_given_account_another_donor_uses() {
        SenderAccountLink link = active(ACCOUNT, NOW);
        DonorRecord jana = record(JANA, link);
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana, record(PETR, active(ACCOUNT, NOW))));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of());

        assertThat(service.listBankAccounts(JANA)).singleElement().satisfies(view -> assertThat(view.shared()).isTrue());

        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana, record(PETR, disconnected(ACCOUNT, NOW))));
        assertThat(service.listBankAccounts(JANA)).singleElement().satisfies(view -> assertThat(view.shared()).isFalse());
    }

    @Test
    @DisplayName("Given an active link to an excluded account another donor also uses, when listed, then it is excluded from pairing and not shared, while the other account is neither")
    void should_mark_excluded_and_not_shared_when_listed_given_excluded_account() {
        SenderAccountLink excludedLink = active(ACCOUNT, NOW.minusSeconds(60));
        SenderAccountLink otherLink = active(OTHER_ACCOUNT, NOW);
        DonorRecord jana = record(JANA, excludedLink, otherLink);
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana, record(PETR, active(ACCOUNT, NOW))));
        when(donorRecords.findBySenderAccount(OTHER_ACCOUNT)).thenReturn(List.of(jana));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of());
        DonorBankAccountsService excluding = service(new ExcludedSenderAccounts(Set.of(ACCOUNT)));

        List<BankAccountView> views = excluding.listBankAccounts(JANA);

        assertThat(views).extracting(view -> view.link().id(), BankAccountView::pairingExcluded, BankAccountView::shared)
                .containsExactly(tuple(otherLink.id(), false, false), tuple(excludedLink.id(), true, false));
    }

    @Test
    @DisplayName("Given donations paired through a link by account and by a confirmed symbol, when listed, then the row counts only those paired by account")
    void should_count_only_account_pairing_when_listed_given_donation_paired_by_confirmed_symbol() {
        SenderAccountLink link = active(ACCOUNT, NOW);
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, link)));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(
                byConfirmedSymbol(link, LocalDate.of(2026, 10, 14), 50000),
                through(link, LocalDate.of(2026, 10, 12), 30000, DonationStatus.RECEIVED)));

        assertThat(service.listBankAccounts(JANA)).singleElement().satisfies(view -> {
            assertThat(view.donationCount()).isEqualTo(1);
            assertThat(view.total()).isEqualTo(Money.czk(30000));
            assertThat(view.lastDonationOn()).contains(LocalDate.of(2026, 10, 12));
        });
    }

    @Test
    @DisplayName("Given a 1 Kč verification payment from an active account that sent one old symbol before it, when listed, then the row asks about that symbol with the count and months of its pairable payments and names the verification day")
    void should_offer_old_symbol_when_listed_given_verification_payment_and_one_old_symbol() {
        DonorRecord jana = janaWithStandingOrder(active(ACCOUNT, NOW));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana));

        assertThat(service.listBankAccounts(JANA)).singleElement().satisfies(view -> {
            assertThat(view.symbolOffer()).contains(new SymbolClaimOffer(ACCOUNT, OLD_SYMBOL, 2, YearMonth.of(2026, 8), YearMonth.of(2026, 9)));
            assertThat(view.verificationPaymentOn()).contains(LocalDate.of(2026, 10, 16));
            assertThat(view.confirmedSymbols()).isEmpty();
        });
    }

    @Test
    @DisplayName("Given the standing order's account is also used by another donor, when listed, then the shared row asks nothing and the payments are not even read")
    void should_offer_nothing_when_listed_given_shared_account() {
        DonorRecord jana = janaWithStandingOrder(active(ACCOUNT, NOW));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana, record(PETR, active(ACCOUNT, NOW))));

        assertThat(service.listBankAccounts(JANA)).singleElement().satisfies(view -> {
            assertThat(view.shared()).isTrue();
            assertThat(view.symbolOffer()).isEmpty();
            assertThat(view.verificationPaymentOn()).contains(LocalDate.of(2026, 10, 16));
        });
        verify(payments, never()).findBySenderAccount(any());
    }

    @Test
    @DisplayName("Given a second active account without a verification payment, when listed, then its row asks nothing and its payments and answers are not even read")
    void should_not_read_payments_when_listed_given_active_account_without_verification_payment() {
        SenderAccountLink unverified = active(OTHER_ACCOUNT, NOW.minusSeconds(60));
        DonorRecord jana = janaWithStandingOrder(active(ACCOUNT, NOW), unverified);
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana));
        when(donorRecords.findBySenderAccount(OTHER_ACCOUNT)).thenReturn(List.of(jana));

        assertThat(service.listBankAccounts(JANA)).extracting(view -> view.link().account(), view -> view.symbolOffer().isPresent())
                .containsExactly(tuple(ACCOUNT, true), tuple(OTHER_ACCOUNT, false));
        verify(payments, never()).findBySenderAccount(OTHER_ACCOUNT);
        verify(claims, never()).findByAccount(OTHER_ACCOUNT);
    }

    @Test
    @DisplayName("Given the standing order's account is excluded from pairing, when listed, then the row asks nothing")
    void should_offer_nothing_when_listed_given_excluded_account() {
        DonorRecord jana = janaWithStandingOrder(active(ACCOUNT, NOW));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana));

        assertThat(service(new ExcludedSenderAccounts(Set.of(ACCOUNT))).listBankAccounts(JANA)).singleElement()
                .satisfies(view -> assertThat(view.symbolOffer()).isEmpty());
        verify(payments, never()).findBySenderAccount(any());
    }

    @Test
    @DisplayName("Given the account was disconnected and reconnected and awaits its payment, when listed, then neither row asks, and both name the verification day")
    void should_offer_nothing_when_listed_given_awaiting_and_disconnected_rows() {
        DonorRecord jana = janaWithStandingOrder(disconnected(ACCOUNT, NOW.minusSeconds(3600)), awaiting(ACCOUNT, NOW));
        when(donorRecords.findBySenderAccount(ACCOUNT)).thenReturn(List.of(jana));

        assertThat(service.listBankAccounts(JANA)).hasSize(2).allSatisfy(view -> {
            assertThat(view.symbolOffer()).isEmpty();
            assertThat(view.verificationPaymentOn()).contains(LocalDate.of(2026, 10, 16));
        });
        verify(payments, never()).findBySenderAccount(any());
    }

    @Test
    @DisplayName("Given confirmed and declined symbols at two accounts, one of them listed twice, when listed, then each account's confirmed symbols stand on its first row only")
    void should_list_confirmed_symbols_on_first_row_of_account_when_listed_given_answers() {
        SenderAccountLink ended = disconnected(ACCOUNT, NOW.minusSeconds(7200));
        SenderAccountLink other = active(OTHER_ACCOUNT, NOW.minusSeconds(3600));
        SenderAccountLink waiting = awaiting(ACCOUNT, NOW.minusSeconds(60));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, ended, other, waiting)));
        when(claims.findByDonor(JANA)).thenReturn(List.of(
                claim(ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED),
                claim(ACCOUNT, OTHER_OLD_SYMBOL, SymbolClaimAnswer.DECLINED),
                claim(OTHER_ACCOUNT, OTHER_OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED),
                claim(ACCOUNT, new VariableSymbol("7123456789"), SymbolClaimAnswer.CONFIRMED)));

        List<BankAccountView> views = service.listBankAccounts(JANA);

        assertThat(views).extracting(view -> view.link().id(), BankAccountView::confirmedSymbols).containsExactly(
                tuple(waiting.id(), List.of(OLD_SYMBOL, new VariableSymbol("7123456789"))),
                tuple(other.id(), List.of(OTHER_OLD_SYMBOL)),
                tuple(ended.id(), List.of()));
        assertThat(views).allSatisfy(view -> assertThat(view.verificationPaymentOn()).isEmpty());
        verifyNoInteractions(payments);
    }

    @Test
    @DisplayName("Given 1 Kč verification payments from two accounts, two of them from one, when listed, then each row names the latest verification day of its own account")
    void should_name_latest_verification_day_per_account_when_listed_given_verification_payments() {
        BankPayment first = verification(11, ACCOUNT, LocalDate.of(2026, 10, 2));
        BankPayment second = verification(12, ACCOUNT, LocalDate.of(2026, 10, 9));
        BankPayment elsewhere = verification(13, OTHER_ACCOUNT, LocalDate.of(2026, 10, 5));
        SenderAccountLink link = active(ACCOUNT, NOW.minusSeconds(60));
        SenderAccountLink otherLink = active(OTHER_ACCOUNT, NOW);
        SenderAccountLink unverified = active(new SenderAccount("19-2000145399", "0800"), NOW.minusSeconds(120));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, link, otherLink, unverified)));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(bySymbol(second), bySymbol(elsewhere), bySymbol(first)));
        when(payments.findByIds(any())).thenReturn(List.of(first, second, elsewhere));

        assertThat(service.listBankAccounts(JANA)).extracting(view -> view.link().id(), BankAccountView::verificationPaymentOn).containsExactly(
                tuple(otherLink.id(), Optional.of(LocalDate.of(2026, 10, 5))),
                tuple(link.id(), Optional.of(LocalDate.of(2026, 10, 9))),
                tuple(unverified.id(), Optional.empty()));
    }

    @Test
    @DisplayName("Given a donor without a record, when listed, then the list is empty")
    void should_list_nothing_when_listed_given_no_record() {
        assertThat(service.listBankAccounts(JANA)).isEmpty();
    }

    @Test
    @DisplayName("Given an active link, when disconnected at 23:30 UTC, then it ends on the Prague day and is saved")
    void should_end_on_prague_day_when_disconnected_given_active_link() {
        SenderAccountLink link = active(ACCOUNT, NOW.minusSeconds(3600));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, link)));

        service.disconnect(JANA, link.id());

        ArgumentCaptor<SenderAccountLink> saved = ArgumentCaptor.forClass(SenderAccountLink.class);
        verify(donorRecords).saveSenderAccountLink(eq(JANA), saved.capture());
        assertThat(saved.getValue().status()).isEqualTo(SenderAccountLinkStatus.DISCONNECTED);
        assertThat(saved.getValue().validTo()).contains(PRAGUE_TODAY);
    }

    @Test
    @DisplayName("Given a donor without a record or without that link, when disconnected or reconnected, then it is not found and nothing is saved")
    void should_not_find_when_disconnected_given_unknown_link() {
        SenderAccountLinkId unknown = SenderAccountLinkId.newId(NOW);

        assertThatThrownBy(() -> service.disconnect(JANA, unknown)).isInstanceOf(SenderAccountLinkNotFound.class);
        assertThatThrownBy(() -> service.reconnect(JANA, unknown)).isInstanceOf(SenderAccountLinkNotFound.class);
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, active(ACCOUNT, NOW))));
        assertThatThrownBy(() -> service.disconnect(JANA, unknown)).isInstanceOf(SenderAccountLinkNotFound.class);
        verify(donorRecords, never()).saveSenderAccountLink(any(), any());
    }

    @Test
    @DisplayName("Given a disconnected link, when reconnected, then a link awaiting a payment from the Prague day is saved")
    void should_save_awaiting_link_when_reconnected_given_disconnected_link() {
        SenderAccountLink link = disconnected(ACCOUNT, NOW.minusSeconds(3600));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, link)));
        when(donorRecords.saveSenderAccountLink(eq(JANA), any())).thenReturn(true);

        service.reconnect(JANA, link.id());

        ArgumentCaptor<SenderAccountLink> saved = ArgumentCaptor.forClass(SenderAccountLink.class);
        verify(donorRecords).saveSenderAccountLink(eq(JANA), saved.capture());
        assertThat(saved.getValue().status()).isEqualTo(SenderAccountLinkStatus.AWAITING_PAYMENT);
        assertThat(saved.getValue().validFrom()).contains(PRAGUE_TODAY);
    }

    @Test
    @DisplayName("Given a reconnect that loses a race with another one, when the insert is ignored, then it is a conflict")
    void should_conflict_when_reconnected_given_concurrent_reconnect() {
        SenderAccountLink link = disconnected(ACCOUNT, NOW.minusSeconds(3600));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record(JANA, link)));

        assertThatThrownBy(() -> service.reconnect(JANA, link.id())).isInstanceOf(SenderAccountAlreadyConnected.class);
    }

    private DonorBankAccountsService service(ExcludedSenderAccounts excluded) {
        return new DonorBankAccountsService(donorRecords, donations, payments, claims,
                new SymbolClaimOffers(payments, donorRecords, claims, excluded), excluded, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private DonorRecord janaWithStandingOrder(SenderAccountLink... links) {
        BankPayment august = payment(1, LocalDate.of(2026, 8, 5), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        BankPayment september = payment(2, LocalDate.of(2026, 9, 5), Money.czk(50000), Optional.of(ACCOUNT), OLD_SYMBOL.value());
        BankPayment verification = verification(3, ACCOUNT, LocalDate.of(2026, 10, 16));
        DonorRecord jana = record(JANA, links);
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(jana));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(bySymbol(verification)));
        when(payments.findByIds(any())).thenReturn(List.of(verification));
        when(payments.findBySenderAccount(ACCOUNT)).thenReturn(List.of(august, september, verification));
        when(payments.findUnpairedBySenderAccountAndMatchingVariableSymbol(ACCOUNT, OLD_SYMBOL)).thenReturn(List.of(august, september));
        return jana;
    }

    private static BankPayment verification(long transactionId, SenderAccount account, LocalDate bookedOn) {
        return payment(transactionId, bookedOn, Money.czk(100), Optional.of(account), JANA_SYMBOL.value(), "OVERENI UCTU NADACNI FOND NOVA NADEJE");
    }

    private static Donation bySymbol(BankPayment payment) {
        return Donation.fromBankPayment(DonationId.newId(NOW), JANA, payment, PairingMethod.VARIABLE_SYMBOL, NOW);
    }

    private static Donation byConfirmedSymbol(SenderAccountLink link, LocalDate receivedOn, long amountMinor) {
        return Donation.reconstitute(DonationId.newId(NOW), JANA, Optional.of(BankPaymentId.newId(NOW)), receivedOn, Money.czk(amountMinor),
                DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(PairingMethod.CONFIRMED_SYMBOL), Optional.of(link.id()),
                Optional.of(SymbolClaimId.newId(NOW)), DonationPurpose.GENERAL, NOW);
    }

    private static SymbolClaim claim(SenderAccount account, VariableSymbol symbol, SymbolClaimAnswer answer) {
        return SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), JANA, account, symbol, answer, NOW);
    }

    private static SenderAccountLink awaiting(SenderAccount account, Instant at) {
        return SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(at), account, LocalDate.of(2026, 10, 17), at);
    }

    private static SenderAccountLink active(SenderAccount account, Instant at) {
        return SenderAccountLink.reconstitute(SenderAccountLinkId.newId(at), account, SenderAccountLinkStatus.ACTIVE,
                Optional.of(BankPaymentId.newId(at)), Optional.of(at), Optional.empty(), Optional.empty(), at, Optional.empty());
    }

    private static SenderAccountLink disconnected(SenderAccount account, Instant at) {
        return SenderAccountLink.reconstitute(SenderAccountLinkId.newId(at), account, SenderAccountLinkStatus.DISCONNECTED,
                Optional.of(BankPaymentId.newId(at)), Optional.of(at), Optional.empty(), Optional.of(LocalDate.of(2026, 10, 1)), at,
                Optional.of(at));
    }

    private static DonorRecord record(DonorReference id, SenderAccountLink... links) {
        return DonorRecord.reconstitute(id, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                JANA_SYMBOL, LocaleCode.CS, List.of(links), NOW, NOW);
    }

    private static Donation through(SenderAccountLink link, LocalDate receivedOn, long amountMinor, DonationStatus status) {
        return Donation.reconstitute(DonationId.newId(NOW), JANA, Optional.of(BankPaymentId.newId(NOW)), receivedOn, Money.czk(amountMinor),
                DonationSource.BANK_TRANSFER, status, Optional.of(PairingMethod.SENDER_ACCOUNT), Optional.of(link.id()), NOW);
    }
}
