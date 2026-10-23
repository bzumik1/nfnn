package cz.novanadeje.app.donations.application.overview;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationList;
import cz.novanadeje.app.donations.domain.donation.DonationPurpose;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.DonationSummary;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donation.YearTotal;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkStatus;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.domain.donation.Donations.JANA;
import static cz.novanadeje.app.donations.domain.donation.Donations.NOW;
import static cz.novanadeje.app.donations.domain.donation.Donations.received;
import static cz.novanadeje.app.donations.domain.donation.Donations.refunded;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DonorDonationsServiceTest {

    private static final Donation JANUARY_2026 = received(LocalDate.of(2026, 1, 10), 100000);
    private static final Donation DECEMBER_2025 = received(LocalDate.of(2025, 12, 20), 125000);

    private static final Donation REFUNDED_2026 = refunded(LocalDate.of(2026, 2, 1), 30000);
    private static final ReceiptNumber FIRST_RECEIPT = new ReceiptNumber("2026-000001");
    private static final FirstReceiptYear FROM_2026 = new FirstReceiptYear(Year.of(2026));

    private final DonationRepository donations = mock(DonationRepository.class);
    private final DonationReceiptRepository receipts = mock(DonationReceiptRepository.class);
    private final DonorRecordRepository donorRecords = mock(DonorRecordRepository.class);
    private final SymbolClaimRepository claims = mock(SymbolClaimRepository.class);
    private final DonorDonationsService service = new DonorDonationsService(donations, receipts, donorRecords, claims,
            Clock.fixed(Instant.parse("2026-10-17T11:00:00Z"), ZoneOffset.UTC), FROM_2026);

    @Test
    @DisplayName("Given a donor with donations, when listed without a year, then every donation comes in the repository's order with the total")
    void should_list_every_donation_when_listed_given_no_year() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationList list = service.listDonations(JANA, Optional.empty()).list();

        assertThat(list.items()).containsExactly(JANUARY_2026, DECEMBER_2025);
        assertThat(list.total()).isEqualTo(Money.czk(225000));
        assertThat(list.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a donor with donations in two years, when listed for one year, then only that year's donations and total come")
    void should_list_only_that_year_when_listed_given_year() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationList list = service.listDonations(JANA, Optional.of(Year.of(2025))).list();

        assertThat(list.items()).containsExactly(DECEMBER_2025);
        assertThat(list.total()).isEqualTo(Money.czk(125000));
        assertThat(list.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a donor with donations, when summarized, then the summary covers every received donation")
    void should_summarize_donations_when_summarized_given_donor_with_donations() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));

        DonationSummary summary = service.summarizeDonations(JANA).summary();

        assertThat(summary.total()).isEqualTo(Money.czk(225000));
        assertThat(summary.count()).isEqualTo(2);
        assertThat(summary.lastReceivedOn()).contains(LocalDate.of(2026, 1, 10));
        assertThat(summary.byYear()).containsExactly(
                new YearTotal(Year.of(2026), 1, Money.czk(100000)),
                new YearTotal(Year.of(2025), 1, Money.czk(125000)));
    }

    @Test
    @DisplayName("Given a donor donations knows nothing about, when listed and summarized, then both are empty instead of failing")
    void should_be_empty_when_listed_and_summarized_given_unknown_donor() {
        DonorReference stranger = new DonorReference(UuidV7.generate(NOW));
        when(donations.findByDonorNewestFirst(stranger)).thenReturn(List.of());

        DonationOverview overview = service.listDonations(stranger, Optional.empty());
        DonationList list = overview.list();
        DonationSummary summary = service.summarizeDonations(stranger).summary();

        assertThat(list.items()).isEmpty();
        assertThat(list.total()).isEqualTo(Money.czk(0));
        assertThat(summary.count()).isZero();
        assertThat(summary.lastReceivedOn()).isEmpty();
        assertThat(summary.byYear()).isEmpty();
        assertThat(overview.singleReceipts()).isEmpty();
    }

    @Test
    @DisplayName("Given active single receipts of the donor, when listed, then each received donation carries its receipt number and the others none")
    void should_carry_receipt_numbers_when_listed_given_active_single_receipts() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(JANUARY_2026, DECEMBER_2025));
        when(receipts.findActiveSingleNumbersFor(JANA)).thenReturn(Map.of(DECEMBER_2025.id(), FIRST_RECEIPT));

        DonationOverview overview = service.listDonations(JANA, Optional.empty());

        assertThat(overview.receiptNumberOf(DECEMBER_2025)).contains(FIRST_RECEIPT);
        assertThat(overview.receiptNumberOf(JANUARY_2026)).isEmpty();
    }

    @Test
    @DisplayName("Given a refunded donation that once got a receipt, when listed, then it carries no receipt number")
    void should_carry_no_receipt_number_when_listed_given_refunded_donation_with_receipt() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(REFUNDED_2026));
        when(receipts.findActiveSingleNumbersFor(JANA)).thenReturn(Map.of(REFUNDED_2026.id(), FIRST_RECEIPT));

        assertThat(service.listDonations(JANA, Optional.empty()).receiptNumberOf(REFUNDED_2026)).isEmpty();
    }

    @Test
    @DisplayName("Given receipts from 2026, when listed, then a received donation from 2026 has a receipt available and one from 2025 or a refunded one has none")
    void should_make_receipt_available_from_first_receipt_year_when_listed_given_donations_around_it() {
        Donation newYearsEve = received(LocalDate.of(2025, 12, 31), 20000);
        Donation newYearsDay = received(LocalDate.of(2026, 1, 1), 20000);
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(REFUNDED_2026, JANUARY_2026, newYearsDay, newYearsEve, DECEMBER_2025));

        DonationOverview overview = service.listDonations(JANA, Optional.empty());

        assertThat(overview.receiptAvailable(JANUARY_2026)).isTrue();
        assertThat(overview.receiptAvailable(newYearsDay)).isTrue();
        assertThat(overview.receiptAvailable(newYearsEve)).isFalse();
        assertThat(overview.receiptAvailable(DECEMBER_2025)).isFalse();
        assertThat(overview.receiptAvailable(REFUNDED_2026)).isFalse();
    }

    @Test
    @DisplayName("Given receipts from 2025, when listed, then a received donation from 2025 has a receipt available")
    void should_make_receipt_available_when_listed_given_earlier_first_receipt_year() {
        DonorDonationsService from2025 = new DonorDonationsService(donations, receipts, donorRecords, claims,
                Clock.fixed(Instant.parse("2026-10-17T11:00:00Z"), ZoneOffset.UTC), new FirstReceiptYear(Year.of(2025)));
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(DECEMBER_2025));

        assertThat(from2025.listDonations(JANA, Optional.empty()).receiptAvailable(DECEMBER_2025)).isTrue();
    }

    @Test
    @DisplayName("Given receipts from 2026, when summarized, then the summary makes receipts available from 2026")
    void should_name_first_receipt_year_when_summarized_given_receipts_from_2026() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(DECEMBER_2025));

        assertThat(service.summarizeDonations(JANA).firstReceiptYear()).isEqualTo(Year.of(2026));
    }

    @Test
    @DisplayName("Given today is in 2026 in Prague, when summarized, then yearly receipts are available through 2025")
    void should_name_last_completed_year_when_summarized_given_clock_in_2026() {
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of());

        assertThat(service.summarizeDonations(JANA).lastCompletedYear()).isEqualTo(Year.of(2025));
    }

    @Test
    @DisplayName("Given 23:30 UTC on New Year's Eve, when summarized, then the closing year already counts as completed in Prague")
    void should_count_closing_year_as_completed_when_summarized_given_prague_new_year() {
        DonorDonationsService atNewYear = new DonorDonationsService(donations, receipts, donorRecords, claims,
                Clock.fixed(Instant.parse("2026-12-31T23:30:00Z"), ZoneOffset.UTC), FROM_2026);
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of());

        assertThat(atNewYear.summarizeDonations(JANA).lastCompletedYear()).isEqualTo(Year.of(2026));
    }

    @Test
    @DisplayName("Given a donation paired through one of the donor's account links, when listed, then the overview names that account and no other donation gets one")
    void should_name_sender_account_when_listed_given_donation_paired_through_link() {
        SenderAccount account = new SenderAccount("2900233333", "2010");
        SenderAccountLink link = SenderAccountLink.reconstitute(SenderAccountLinkId.newId(NOW), account, SenderAccountLinkStatus.ACTIVE,
                Optional.of(BankPaymentId.newId(NOW)), Optional.of(NOW), Optional.empty(), Optional.empty(), NOW, Optional.empty());
        DonorRecord record = DonorRecord.reconstitute(JANA, DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol("4821937560"), LocaleCode.CS, List.of(link), NOW, NOW, null);
        Donation byAccount = Donation.reconstitute(DonationId.newId(NOW), JANA, Optional.of(BankPaymentId.newId(NOW)), LocalDate.of(2026, 3, 1),
                Money.czk(30000), DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(PairingMethod.SENDER_ACCOUNT),
                Optional.of(link.id()), NOW);
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(byAccount, JANUARY_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(record));

        DonationOverview overview = service.listDonations(JANA, Optional.empty());

        assertThat(overview.senderAccountOf(byAccount)).contains(account);
        assertThat(overview.senderAccountOf(JANUARY_2026)).isEmpty();
    }

    @Test
    @DisplayName("Given a donation paired by a symbol the donor confirmed at one of her accounts, when listed, then the overview names that symbol and the account, and no other donation gets a symbol")
    void should_name_confirmed_symbol_when_listed_given_donation_paired_by_confirmed_symbol() {
        SenderAccount account = new SenderAccount("2900233333", "2010");
        VariableSymbol oldSymbol = new VariableSymbol("6123456789");
        SenderAccountLink link = SenderAccountLink.reconstitute(SenderAccountLinkId.newId(NOW), account, SenderAccountLinkStatus.ACTIVE,
                Optional.of(BankPaymentId.newId(NOW)), Optional.of(NOW), Optional.empty(), Optional.empty(), NOW, Optional.empty());
        SymbolClaim confirmed = SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), JANA, account, oldSymbol, SymbolClaimAnswer.CONFIRMED, NOW);
        SymbolClaim declined = SymbolClaim.reconstitute(SymbolClaimId.newId(NOW), JANA, account, new VariableSymbol("5123456789"),
                SymbolClaimAnswer.DECLINED, NOW);
        Donation byClaim = Donation.reconstitute(DonationId.newId(NOW), JANA, Optional.of(BankPaymentId.newId(NOW)), LocalDate.of(2026, 3, 1),
                Money.czk(50000), DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(PairingMethod.CONFIRMED_SYMBOL),
                Optional.of(link.id()), Optional.of(confirmed.id()), DonationPurpose.GENERAL, NOW);
        Donation byAccount = Donation.reconstitute(DonationId.newId(NOW), JANA, Optional.of(BankPaymentId.newId(NOW)), LocalDate.of(2026, 2, 1),
                Money.czk(30000), DonationSource.BANK_TRANSFER, DonationStatus.RECEIVED, Optional.of(PairingMethod.SENDER_ACCOUNT),
                Optional.of(link.id()), NOW);
        when(donations.findByDonorNewestFirst(JANA)).thenReturn(List.of(byClaim, byAccount, JANUARY_2026));
        when(donorRecords.findById(JANA)).thenReturn(Optional.of(DonorRecord.reconstitute(JANA, DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol("4821937560"), LocaleCode.CS, List.of(link), NOW,
                NOW, null)));
        when(claims.findByDonor(JANA)).thenReturn(List.of(declined, confirmed));

        DonationOverview overview = service.listDonations(JANA, Optional.empty());

        assertThat(overview.confirmedSymbolOf(byClaim)).contains(oldSymbol);
        assertThat(overview.senderAccountOf(byClaim)).contains(account);
        assertThat(overview.confirmedSymbolOf(byAccount)).isEmpty();
        assertThat(overview.confirmedSymbolOf(JANUARY_2026)).isEmpty();
    }
}
