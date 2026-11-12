package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.DonationRowsContext;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.sharedcases.CaseRows;
import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;

@DonationRowsContext
class ReportSnapshotTest {

    private static final String ONE_UNPAIRED_PAYMENT = """
            {"now": "2026-03-01T06:00:00Z",
             "donors": [{"alias": "jana", "registeredAt": "2026-01-05T09:00:00Z", "erasedAt": null}],
             "payments": [{"alias": "p1", "bookedOn": "2026-02-05", "amountMinor": 50000, "unpairedByAdminAt": null}],
             "donations": []}
            """;
    private static final Tally ONE_PAYMENT = new Tally(1, Money.czk(50000));

    @Autowired
    private MonthlyReportService monthlyReports;
    @Autowired
    private AdminOverviewService overviews;
    @Autowired
    private MonthlyReportSender reportSender;
    @Autowired
    private DonationRepository donations;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private MutableClock clock;

    private CaseRows rows;

    @BeforeEach
    void aDonorWithOneUnpairedPaymentInFebruary() {
        rows = CaseRows.fromJson(JsonMapper.builder().build().readTree(ONE_UNPAIRED_PAYMENT));
        rows.write(jdbc, clock);
        clearInvocations(reportSender);
    }

    @AfterEach
    void emptyTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given an unpaired payment of the month, when it is paired and committed between the report's read of the gifts and of the unpaired payments, then the report counts it once, as the snapshot of its first read shows it")
    void should_count_the_payment_once_when_it_is_paired_between_the_reports_reads_given_an_unpaired_payment() {
        pairTheFebruaryPaymentAfterTheGiftsAreRead();

        monthlyReports.sendReportFor(new ReportMonth(YearMonth.of(2026, 2)));

        ArgumentCaptor<MonthlyReport> report = ArgumentCaptor.forClass(MonthlyReport.class);
        verify(reportSender).send(report.capture(), any());
        assertThat(jdbc.sql("select count(*) from donation").query(Long.class).single()).as("the gift committed meanwhile").isOne();
        assertThat(report.getValue().unpairedInMonth().plus(report.getValue().pairedInMonth())).isEqualTo(ONE_PAYMENT);
    }

    @Test
    @DisplayName("Given an unpaired payment of the year, when it is paired and committed between the overview's read of the gifts and of the unpaired payments, then the overview counts it once, as the snapshot of its first read shows it")
    void should_count_the_payment_once_when_it_is_paired_between_the_overviews_reads_given_an_unpaired_payment() {
        pairTheFebruaryPaymentAfterTheGiftsAreRead();

        OverviewView overview = overviews.overview(Optional.of(Year.of(2026)));

        assertThat(jdbc.sql("select count(*) from donation").query(Long.class).single()).as("the gift committed meanwhile").isOne();
        assertThat(overview.year().unpaired().plus(overview.year().paired())).isEqualTo(ONE_PAYMENT);
    }

    private void pairTheFebruaryPaymentAfterTheGiftsAreRead() {
        UUID payment = jdbc.sql("select id from bank_payment").query(UUID.class).single();
        doAnswer(call -> {
            Object gifts = call.callRealMethod();
            Thread meanwhile = Thread.ofPlatform().start(() -> pair(payment));
            meanwhile.join();
            return gifts;
        }).when(donations).findReceivedOnBetween(any(), any());
    }

    private void pair(UUID payment) {
        jdbc.sql("insert into donation (id, donor_id, bank_payment_id, received_on, amount_minor, currency, source, status, paired_by, recorded_at, "
                        + "sender_account_id, purpose, symbol_claim_id) values (:id, :donor, :payment, :received, 50000, 'CZK', 'BANK_TRANSFER', 'RECEIVED', "
                        + "'MANUAL', :recorded, null, 'GENERAL', null)")
                .param("id", UUID.randomUUID())
                .param("donor", rows.donorId("jana"))
                .param("payment", payment)
                .param("received", Date.valueOf(LocalDate.of(2026, 2, 5)))
                .param("recorded", Timestamp.from(Instant.parse("2026-03-01T06:00:00Z")))
                .update();
    }
}
