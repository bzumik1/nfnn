package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.domain.donation.Donations.received;
import static cz.novanadeje.app.donations.domain.donation.Donations.refunded;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MonthlyReportTest {

    private static final ReportMonth SEPTEMBER = ReportMonth.of(2026, 9);
    private static final Instant SUCCEEDED_AT = Instant.parse("2026-10-01T10:00:00Z");
    private static final Instant FAILED_AT = Instant.parse("2026-10-01T11:00:00Z");
    private static final Optional<SenderAccount> UNKNOWN_ACCOUNT = Optional.of(new SenderAccount("2900255555", "0800"));
    private static final DonorCounts NO_DONORS = DonorCounts.between(0, 0);

    @Test
    @DisplayName("Given 10 donors before September and 12 by its end, when the report is compiled, then it counts 12 donors and 2 new ones")
    void should_count_all_and_new_donors_when_compiled_given_registrations_before_and_during_month() {
        MonthlyReport report = compile(DonorCounts.between(10, 12), List.of(), List.of());

        assertThat(report.donors().registered()).isEqualTo(12);
        assertThat(report.donors().newInMonth()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given more donors before the month than at its end, when the donor counts are made, then they are refused")
    void should_refuse_when_counted_given_fewer_donors_at_month_end() {
        assertThatThrownBy(() -> DonorCounts.between(5, 4)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DonorCounts.between(-1, 4)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given donations on the last of August, in September and on the first of October, when the report is compiled, then only September's count for the month")
    void should_count_only_the_months_donations_when_compiled_given_donations_around_month_boundaries() {
        MonthlyReport report = compile(NO_DONORS, List.of(
                received(LocalDate.of(2026, 8, 31), 10000),
                received(LocalDate.of(2026, 9, 1), 123450),
                received(LocalDate.of(2026, 9, 30), 30000),
                received(LocalDate.of(2026, 10, 1), 99900)), List.of());

        assertThat(report.donationsInMonth()).isEqualTo(new Tally(2, Money.czk(153450)));
    }

    @Test
    @DisplayName("Given donations last December, this year up to September and in October, when the report is compiled, then the year to date runs from 1 January to 30 September")
    void should_count_year_to_date_from_new_year_when_compiled_given_donations_across_years() {
        MonthlyReport report = compile(NO_DONORS, List.of(
                received(LocalDate.of(2025, 12, 31), 50000),
                received(LocalDate.of(2026, 1, 1), 20000),
                received(LocalDate.of(2026, 8, 14), 20000),
                received(LocalDate.of(2026, 9, 30), 30000),
                received(LocalDate.of(2026, 10, 1), 99900)), List.of());

        assertThat(report.donationsInYear()).isEqualTo(new Tally(3, Money.czk(70000)));
    }

    @Test
    @DisplayName("Given a refunded donation in September, when the report is compiled, then it counts neither for the month nor for the year")
    void should_ignore_refunded_donation_when_compiled_given_refund_in_month() {
        MonthlyReport report = compile(NO_DONORS, List.of(
                received(LocalDate.of(2026, 9, 10), 50000),
                refunded(LocalDate.of(2026, 9, 12), 70000)), List.of());

        assertThat(report.donationsInMonth()).isEqualTo(new Tally(1, Money.czk(50000)));
        assertThat(report.donationsInYear()).isEqualTo(new Tally(1, Money.czk(50000)));
    }

    @Test
    @DisplayName("Given unpaired payments booked in August, September and October, when the report is compiled, then only September's count")
    void should_count_only_the_months_unpaired_payments_when_compiled_given_payments_around_month_boundaries() {
        MonthlyReport report = compile(NO_DONORS, List.of(), List.of(
                unpaired(1001, LocalDate.of(2026, 8, 31), 7500),
                unpaired(1002, LocalDate.of(2026, 9, 1), 15000),
                unpaired(1003, LocalDate.of(2026, 9, 30), 100),
                unpaired(1004, LocalDate.of(2026, 10, 1), 20000)));

        assertThat(report.unpairedPaymentsInMonth()).isEqualTo(new Tally(2, Money.czk(15100)));
    }

    @Test
    @DisplayName("Given nothing in the month, when the report is compiled, then every tally is zero")
    void should_tally_zero_when_compiled_given_empty_month() {
        MonthlyReport report = compile(NO_DONORS, List.of(), List.of());

        assertThat(report.month()).isEqualTo(SEPTEMBER);
        assertThat(report.donationsInMonth()).isEqualTo(new Tally(0, Money.czk(0)));
        assertThat(report.donationsInYear()).isEqualTo(new Tally(0, Money.czk(0)));
        assertThat(report.unpairedPaymentsInMonth()).isEqualTo(new Tally(0, Money.czk(0)));
    }

    @Test
    @DisplayName("Given a successful bank import, when the report is compiled, then it carries the success time and no failure")
    void should_carry_last_success_when_compiled_given_successful_import() {
        BankImportState state = BankImportState.initial(SUCCEEDED_AT);
        state.succeeded(new ImportCoverage(LocalDate.of(2026, 7, 4), LocalDate.of(2026, 10, 1)), SUCCEEDED_AT);

        MonthlyReport report = MonthlyReport.compile(SEPTEMBER, NO_DONORS, List.of(), List.of(), state);

        assertThat(report.bankImport()).isEqualTo(new BankImportStatus(Optional.of(SUCCEEDED_AT), Optional.empty()));
    }

    @Test
    @DisplayName("Given a bank import that failed after a success, when the report is compiled, then it carries both the success and the failure with its time")
    void should_carry_failure_and_success_when_compiled_given_failed_import_after_success() {
        BankImportState state = BankImportState.initial(SUCCEEDED_AT);
        state.succeeded(new ImportCoverage(LocalDate.of(2026, 7, 4), LocalDate.of(2026, 10, 1)), SUCCEEDED_AT);
        state.failed(ImportFailureKind.UNAUTHORIZED, "token expired", FAILED_AT);

        MonthlyReport report = MonthlyReport.compile(SEPTEMBER, NO_DONORS, List.of(), List.of(), state);

        assertThat(report.bankImport()).isEqualTo(new BankImportStatus(Optional.of(SUCCEEDED_AT),
                Optional.of(new ImportFailure(ImportFailureKind.UNAUTHORIZED, FAILED_AT))));
    }

    @Test
    @DisplayName("Given a bank import that never ran, when the report is compiled, then it carries neither a success nor a failure")
    void should_carry_nothing_when_compiled_given_import_never_ran() {
        MonthlyReport report = MonthlyReport.compile(SEPTEMBER, NO_DONORS, List.of(), List.of(), BankImportState.initial(SUCCEEDED_AT));

        assertThat(report.bankImport()).isEqualTo(new BankImportStatus(Optional.empty(), Optional.empty()));
    }

    private static MonthlyReport compile(DonorCounts donors, List<Donation> donations,
                                         List<BankPayment> unpairedPayments) {
        return MonthlyReport.compile(SEPTEMBER, donors, donations, unpairedPayments, BankImportState.initial(SUCCEEDED_AT));
    }

    private static BankPayment unpaired(long transactionId, LocalDate bookedOn, long amountMinor) {
        return payment(transactionId, bookedOn, Money.czk(amountMinor), UNKNOWN_ACCOUNT, "1111111111");
    }
}
