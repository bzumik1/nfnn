package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.shared.domain.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReportContentTest {

    private static final ReportMonth SEPTEMBER = ReportMonth.of(2026, 9);
    private static final Tally PAIRED = new Tally(2, Money.czk(30000));
    private static final Tally UNPAIRED = new Tally(1, Money.czk(15000));
    private static final Tally YEAR = new Tally(7, Money.czk(90000));
    private static final BankImportStatus BANK = new BankImportStatus(Optional.of(Instant.parse("2026-09-30T20:00:00Z")),
            Optional.of(new ImportFailure(ImportFailureKind.TRANSPORT, Instant.parse("2026-09-30T21:00:00Z"))));
    private static final MonthlyReport REPORT = new MonthlyReport(SEPTEMBER, DonorCounts.between(10, 12), PAIRED, UNPAIRED, YEAR, BANK);

    @Test
    @DisplayName("Given every section chosen, when the content of a report is taken, then it holds the donors, the donations, the unpaired payments and the bank")
    void should_hold_every_section_when_taken_given_every_section_chosen() {
        ReportContent content = ReportContent.of(REPORT, ReportSections.all());

        assertThat(content.donors()).contains(new DonorCounts(12, 2));
        assertThat(content.donations()).contains(new DonationTallies(new Tally(3, Money.czk(45000)), PAIRED, YEAR));
        assertThat(content.unpairedPayments()).contains(UNPAIRED);
        assertThat(content.bankImport()).contains(BANK);
    }

    @Test
    @DisplayName("Given only the donations and the bank chosen, when the content of a report is taken, then the donors and the unpaired payments are left out")
    void should_leave_out_unchosen_sections_when_taken_given_two_sections_chosen() {
        ReportContent content = ReportContent.of(REPORT, new ReportSections(false, true, false, true));

        assertThat(content.donors()).isEmpty();
        assertThat(content.donations()).isPresent();
        assertThat(content.unpairedPayments()).isEmpty();
        assertThat(content.bankImport()).contains(BANK);
    }

    @Test
    @DisplayName("Given a report compiled today for a month whose sending was not kept, when it is recomputed, then it holds every section but the bank")
    void should_leave_out_bank_when_recomputed_given_compiled_report() {
        ReportContent content = ReportContent.recomputedFrom(REPORT);

        assertThat(content.donors()).isPresent();
        assertThat(content.donations()).isPresent();
        assertThat(content.unpairedPayments()).contains(UNPAIRED);
        assertThat(content.bankImport()).isEmpty();
    }

    @Test
    @DisplayName("Given no section at all, when a content is made, then it is refused")
    void should_refuse_when_made_given_no_section() {
        assertThatThrownBy(() -> new ReportContent(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a delivery to no recipient or to more than the report may have, when it is made, then it is refused")
    void should_refuse_when_delivery_made_given_recipient_count_outside_limits() {
        ReportContent content = ReportContent.of(REPORT, ReportSections.all());
        Instant sentAt = Instant.parse("2026-10-01T05:00:00Z");

        assertThatThrownBy(() -> new ReportDelivery(SEPTEMBER, sentAt, false, 0, content)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ReportDelivery(SEPTEMBER, sentAt, false, ReportRecipients.MAX_RECIPIENTS + 1, content))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(new ReportDelivery(SEPTEMBER, sentAt, true, ReportRecipients.MAX_RECIPIENTS, content).byHand()).isTrue();
    }
}
