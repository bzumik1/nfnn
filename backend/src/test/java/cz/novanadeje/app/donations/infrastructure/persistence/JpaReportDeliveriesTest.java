package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.report.BankImportStatus;
import cz.novanadeje.app.donations.domain.report.DonationTallies;
import cz.novanadeje.app.donations.domain.report.DonorCounts;
import cz.novanadeje.app.donations.domain.report.ImportFailure;
import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportContent;
import cz.novanadeje.app.donations.domain.report.ReportDeliveries;
import cz.novanadeje.app.donations.domain.report.ReportDelivery;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.Optional;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@PersistenceTest
class JpaReportDeliveriesTest {

    private static final ReportMonth SEPTEMBER = ReportMonth.of(2026, 9);
    private static final ReportContent EVERY_SECTION = new ReportContent(
            Optional.of(new DonorCounts(12, 2)),
            Optional.of(new DonationTallies(new Tally(3, Money.czk(45000)), new Tally(2, Money.czk(30000)), new Tally(7, Money.czk(90000)))),
            Optional.of(new Tally(1, Money.czk(15000))),
            Optional.of(new BankImportStatus(Optional.of(Instant.parse("2026-09-30T20:00:00Z")),
                    Optional.of(new ImportFailure(ImportFailureKind.HISTORY_LOCKED, Instant.parse("2026-09-30T21:00:00Z"))))));
    private static final ReportContent BANK_NEVER_RAN = new ReportContent(Optional.empty(), Optional.empty(), Optional.empty(),
            Optional.of(new BankImportStatus(Optional.empty(), Optional.empty())));

    @Autowired
    private ReportDeliveries deliveries;
    @Autowired
    private MonthlyReportLog reportLog;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given September recorded, when a sending with every section is kept, then it reads back the same")
    void should_read_back_every_section_when_kept_given_every_section() {
        reportLog.recordSending(SEPTEMBER, NOW);
        ReportDelivery delivery = new ReportDelivery(SEPTEMBER, NOW, false, 3, EVERY_SECTION);

        deliveries.record(delivery);

        assertThat(deliveries.ofMonthNewestFirst(SEPTEMBER)).containsExactly(delivery);
    }

    @Test
    @DisplayName("Given September recorded, when a sending with only a bank that never ran is kept, then it reads back with the bank section and nothing else")
    void should_read_back_bank_section_when_kept_given_bank_never_ran() {
        reportLog.recordSending(SEPTEMBER, NOW);
        ReportDelivery delivery = new ReportDelivery(SEPTEMBER, NOW, true, 1, BANK_NEVER_RAN);

        deliveries.record(delivery);

        assertThat(deliveries.ofMonthNewestFirst(SEPTEMBER)).containsExactly(delivery);
    }

    @Test
    @DisplayName("Given September and October each sent, when September's sendings are read, then only September's come, newest first")
    void should_list_month_newest_first_when_read_given_two_months_sent() {
        reportLog.recordSending(SEPTEMBER, NOW);
        reportLog.recordSending(ReportMonth.of(2026, 10), NOW);
        ReportDelivery morning = new ReportDelivery(SEPTEMBER, NOW, false, 1, EVERY_SECTION);
        ReportDelivery byHand = new ReportDelivery(SEPTEMBER, NOW.plusSeconds(3600), true, 1, BANK_NEVER_RAN);
        deliveries.record(morning);
        deliveries.record(byHand);
        deliveries.record(new ReportDelivery(ReportMonth.of(2026, 10), NOW.plusSeconds(7200), false, 1, EVERY_SECTION));

        assertThat(deliveries.ofMonthNewestFirst(SEPTEMBER)).containsExactly(byHand, morning);
    }

    @Test
    @DisplayName("Given the schema, when a sending is stored for a month never recorded, then the foreign key refuses it")
    void should_refuse_when_inserted_given_month_never_recorded() {
        assertThatThrownBy(() -> deliveries.record(new ReportDelivery(SEPTEMBER, NOW, false, 1, EVERY_SECTION)))
                .hasMessageContaining("fk_donation_report_delivery_month");
    }

    @Test
    @DisplayName("Given the schema, when a sending is stored with the donors section half filled, then the check constraint refuses it")
    void should_refuse_when_inserted_given_section_half_filled() {
        reportLog.recordSending(SEPTEMBER, NOW);

        assertThatThrownBy(() -> jdbc.sql("insert into donation_report_delivery (id, report_month, sent_at, by_hand, recipient_count,"
                        + " includes_donors, registered_donors, includes_donations, includes_unpaired_payments, includes_bank_import)"
                        + " values (gen_random_uuid(), date '2026-09-01', now(), false, 1, true, 12, false, false, false)").update())
                .hasMessageContaining("ck_donation_report_delivery_donors");
    }

    @Test
    @DisplayName("Given the schema, when a sending is stored without any section, then the check constraint refuses it")
    void should_refuse_when_inserted_given_no_section() {
        reportLog.recordSending(SEPTEMBER, NOW);

        assertThatThrownBy(() -> jdbc.sql("insert into donation_report_delivery (id, report_month, sent_at, by_hand, recipient_count,"
                        + " includes_donors, includes_donations, includes_unpaired_payments, includes_bank_import)"
                        + " values (gen_random_uuid(), date '2026-09-01', now(), false, 1, false, false, false, false)").update())
                .hasMessageContaining("ck_donation_report_delivery_section");
    }

    @Test
    @DisplayName("Given the schema, when a sending names an import failure kind the bank import does not know, then the check constraint refuses it")
    void should_refuse_when_inserted_given_unknown_failure_kind() {
        reportLog.recordSending(SEPTEMBER, NOW);

        assertThatThrownBy(() -> jdbc.sql("insert into donation_report_delivery (id, report_month, sent_at, by_hand, recipient_count,"
                        + " includes_donors, includes_donations, includes_unpaired_payments, includes_bank_import,"
                        + " bank_last_failure_at, bank_last_failure_kind)"
                        + " values (gen_random_uuid(), date '2026-09-01', now(), false, 1, false, false, false, true, now(), 'BROKEN')").update())
                .hasMessageContaining("ck_donation_report_delivery_failure_kind");
    }
}
