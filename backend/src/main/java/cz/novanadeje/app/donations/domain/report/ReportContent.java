package cz.novanadeje.app.donations.domain.report;

import java.util.Optional;

public record ReportContent(Optional<DonorCounts> donors, Optional<DonationTallies> donations, Optional<Tally> unpairedPayments,
                            Optional<BankImportStatus> bankImport) {

    private static final ReportSections RECOMPUTABLE = new ReportSections(true, true, true, false);

    public ReportContent {
        if (donors == null || donations == null || unpairedPayments == null || bankImport == null) {
            throw new IllegalArgumentException("Every section of a report's content is given, even when left out");
        }
        if (donors.isEmpty() && donations.isEmpty() && unpairedPayments.isEmpty() && bankImport.isEmpty()) {
            throw new IllegalArgumentException("A report's content has at least one section");
        }
    }

    public static ReportContent of(MonthlyReport report, ReportSections sections) {
        return new ReportContent(
                sections.donors() ? Optional.of(report.donors()) : Optional.empty(),
                sections.donations()
                        ? Optional.of(new DonationTallies(report.receivedInMonth(), report.pairedInMonth(), report.receivedInYear()))
                        : Optional.empty(),
                sections.unpairedPayments() ? Optional.of(report.unpairedInMonth()) : Optional.empty(),
                sections.bankImport() ? Optional.of(report.bankImport()) : Optional.empty());
    }

    public static ReportContent recomputedFrom(MonthlyReport report) {
        return of(report, RECOMPUTABLE);
    }
}
