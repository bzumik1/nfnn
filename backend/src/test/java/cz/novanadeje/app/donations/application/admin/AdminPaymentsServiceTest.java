package cz.novanadeje.app.donations.application.admin;

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
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.domain.receipt.Receipts.jana;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminPaymentsServiceTest {

    private static final Instant NOW = Instant.parse("2027-01-20T09:00:00Z");
    private static final Optional<SenderAccount> ACCOUNT = Optional.of(new SenderAccount("2900233333", "2010"));

    private final DonorRecord janaRecord = jana();
    private final BankPayment october = payment(1001, LocalDate.of(2026, 10, 5), czk(50000), ACCOUNT, "1111111111");
    private final BankPayment december = payment(1002, LocalDate.of(2026, 12, 5), czk(20000), ACCOUNT, null);
    private final BankPayment lastYear = payment(1003, LocalDate.of(2025, 3, 5), czk(10000), ACCOUNT, null);
    private final Donation octoberGift = Donation.fromBankPayment(DonationId.newId(NOW), janaRecord.id(), october, PairingMethod.MANUAL, NOW);
    private final Donation decemberGift = Donation.fromBankPayment(DonationId.newId(NOW), new DonorReference(UuidV7.generate(NOW.plusSeconds(1))),
            december, PairingMethod.VARIABLE_SYMBOL, NOW);

    private final BankPaymentRepository payments = mock(BankPaymentRepository.class);
    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final AdminPaymentsService service = new AdminPaymentsService(payments, donations, donorRecords, receipts);

    @Test
    @DisplayName("Given unpaired payments, when listed, then they come in the repository's order without donations and without years")
    void should_list_payments_without_donations_when_unpaired_listed_given_unpaired_payments() {
        when(payments.findUnpairedNewestFirst()).thenReturn(List.of(december, october));

        AdminPaymentList list = service.listUnpaired(PaymentFilter.none());

        assertThat(list.year()).isEmpty();
        assertThat(list.availableYears()).isEmpty();
        assertThat(list.items()).extracting(AdminPaymentView::payment).containsExactly(december, october);
        assertThat(list.items()).allSatisfy(item -> assertThat(item.donation()).isEmpty());
    }

    @Test
    @DisplayName("Given donations in two years, when the paired list is asked without a year, then the newest year is shown, newest payment first, with donor and receipt flag")
    void should_show_newest_year_with_donors_and_receipts_when_paired_listed_given_no_year() {
        when(donations.findReceivedYearsNewestFirst()).thenReturn(List.of(Year.of(2026), Year.of(2025)));
        when(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31))).thenReturn(List.of(octoberGift, decemberGift));
        when(payments.findByIds(anyCollection())).thenReturn(List.of(october, december));
        when(donorRecords.findByIds(anyCollection())).thenReturn(List.of(janaRecord));
        when(receipts.findDonationsWithReceipt(anyCollection())).thenReturn(Set.of(octoberGift.id()));

        AdminPaymentList list = service.listPaired(Optional.empty(), PaymentFilter.none());

        assertThat(list.year()).contains(Year.of(2026));
        assertThat(list.availableYears()).containsExactly(Year.of(2026), Year.of(2025));
        assertThat(list.items()).extracting(AdminPaymentView::payment).containsExactly(december, october);
        PairedDonationView decemberView = list.items().getFirst().donation().orElseThrow();
        assertThat(decemberView.donation()).isEqualTo(decemberGift);
        assertThat(decemberView.donor()).isEmpty();
        assertThat(decemberView.receiptIssued()).isFalse();
        PairedDonationView octoberView = list.items().getLast().donation().orElseThrow();
        assertThat(octoberView.donor()).contains(janaRecord);
        assertThat(octoberView.receiptIssued()).isTrue();
    }

    @Test
    @DisplayName("Given a requested year, when the paired list is asked, then that year's donations are shown even when it is not the newest")
    void should_show_requested_year_when_paired_listed_given_year() {
        Donation lastYearGift = Donation.fromBankPayment(DonationId.newId(NOW), janaRecord.id(), lastYear, PairingMethod.MANUAL, NOW);
        when(donations.findReceivedYearsNewestFirst()).thenReturn(List.of(Year.of(2026), Year.of(2025)));
        when(donations.findReceivedOnBetween(LocalDate.of(2025, 1, 1), LocalDate.of(2025, 12, 31))).thenReturn(List.of(lastYearGift));
        when(payments.findByIds(anyCollection())).thenReturn(List.of(lastYear));
        when(donorRecords.findByIds(anyCollection())).thenReturn(List.of(janaRecord));
        when(receipts.findDonationsWithReceipt(anyCollection())).thenReturn(Set.of());

        AdminPaymentList list = service.listPaired(Optional.of(Year.of(2025)), PaymentFilter.none());

        assertThat(list.year()).contains(Year.of(2025));
        assertThat(list.items()).singleElement().satisfies(item -> {
            assertThat(item.payment()).isEqualTo(lastYear);
            assertThat(item.donation().orElseThrow().donation()).isEqualTo(lastYearGift);
        });
    }

    @Test
    @DisplayName("Given no donation at all, when the paired list is asked, then it is empty with no year")
    void should_answer_empty_list_when_paired_listed_given_no_donations() {
        when(donations.findReceivedYearsNewestFirst()).thenReturn(List.of());

        AdminPaymentList list = service.listPaired(Optional.empty(), PaymentFilter.none());

        assertThat(list.year()).isEmpty();
        assertThat(list.availableYears()).isEmpty();
        assertThat(list.items()).isEmpty();
        verifyNoInteractions(payments, receipts);
    }


    @Test
    @DisplayName("Given unpaired payments, when listed with a text, then only payments whose symbol, account, name, message or transaction id contain it are shown, ignoring case and diacritics")
    void should_keep_matching_payments_when_unpaired_listed_given_text() {
        BankPayment named = payment(2001, LocalDate.of(2026, 10, 7), czk(30000), ACCOUNT, null, "Dar pro Nadační fond",
                Optional.of("Kmínek Pavel"));
        when(payments.findUnpairedNewestFirst()).thenReturn(List.of(december, named, october));

        assertThat(service.listUnpaired(new PaymentFilter("KMINEK", null, null, null, 0, null)).items())
                .extracting(AdminPaymentView::payment).containsExactly(named);
        assertThat(service.listUnpaired(new PaymentFilter("nadacni", null, null, null, 0, null)).items())
                .extracting(AdminPaymentView::payment).containsExactly(named);
        assertThat(service.listUnpaired(new PaymentFilter("1111111", null, null, null, 0, null)).items())
                .extracting(AdminPaymentView::payment).containsExactly(october);
        assertThat(service.listUnpaired(new PaymentFilter("2900233333/2010", null, null, null, 0, null)).items())
                .extracting(AdminPaymentView::payment).containsExactly(december, named, october);
        assertThat(service.listUnpaired(new PaymentFilter("1002", null, null, null, 0, null)).items())
                .extracting(AdminPaymentView::payment).containsExactly(december);
    }

    @Test
    @DisplayName("Given unpaired payments, when listed for a period with an offset and a limit, then the period is kept, the page cut out and the total counts the whole period")
    void should_cut_page_and_count_period_when_unpaired_listed_given_period_and_page() {
        when(payments.findUnpairedNewestFirst()).thenReturn(List.of(december, october, lastYear));

        AdminPaymentList list = service.listUnpaired(new PaymentFilter(null, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31), null, 1, 1));

        assertThat(list.total()).isEqualTo(2);
        assertThat(list.items()).extracting(AdminPaymentView::payment).containsExactly(october);
        assertThat(service.listUnpaired(new PaymentFilter(null, LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 5), null, 0, null)).items())
                .extracting(AdminPaymentView::payment).containsExactly(october);
        assertThat(service.listUnpaired(PaymentFilter.none()).total()).isEqualTo(3);
    }

    @Test
    @DisplayName("Given paired donations of two donors, when the paired list is asked for one donor or by the donor's name, then only that donor's payments are shown")
    void should_keep_one_donor_when_paired_listed_given_donor_or_name() {
        when(donations.findReceivedYearsNewestFirst()).thenReturn(List.of(Year.of(2026)));
        when(donations.findReceivedOnBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31))).thenReturn(List.of(octoberGift, decemberGift));
        when(payments.findByIds(anyCollection())).thenReturn(List.of(october, december));
        when(donorRecords.findByIds(anyCollection())).thenReturn(List.of(janaRecord));
        when(receipts.findDonationsWithReceipt(anyCollection())).thenReturn(Set.of());

        assertThat(service.listPaired(Optional.empty(), new PaymentFilter(null, null, null, janaRecord.id(), 0, null)).items())
                .extracting(AdminPaymentView::payment).containsExactly(october);
        assertThat(service.listPaired(Optional.empty(), new PaymentFilter(janaRecord.name(), null, null, null, 0, null)).items())
                .extracting(AdminPaymentView::payment).containsExactly(october);
    }

    @Test
    @DisplayName("Given a negative offset or a limit below one, when a filter is made, then it is refused")
    void should_refuse_filter_when_made_given_bad_page() {
        assertThatIllegalArgumentException().isThrownBy(() -> new PaymentFilter(null, null, null, null, -1, null));
        assertThatIllegalArgumentException().isThrownBy(() -> new PaymentFilter(null, null, null, null, 0, 0));
    }

    @Test
    @DisplayName("Given a query with surrounding spaces, when donors are searched, then the trimmed query goes to the repository with the limit")
    void should_search_trimmed_query_with_limit_when_donors_searched_given_query() {
        when(donorRecords.searchByNameOrSymbol("nov", AdminPaymentsService.DONOR_SEARCH_LIMIT)).thenReturn(List.of(janaRecord));

        assertThat(service.searchDonors("  nov ")).containsExactly(janaRecord);
    }

    @Test
    @DisplayName("Given a blank or missing query, when donors are searched, then nothing is asked and nothing is found")
    void should_find_nothing_when_donors_searched_given_blank_query() {
        assertThat(service.searchDonors("   ")).isEmpty();
        assertThat(service.searchDonors(null)).isEmpty();

        verifyNoInteractions(donorRecords);
    }
}
