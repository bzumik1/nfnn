package cz.novanadeje.app.donations.domain.report;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

public record NextReport(ReportMonth month, LocalDate dueOn) {

    public NextReport {
        if (month == null || dueOn == null) {
            throw new IllegalArgumentException("The next report names its month and the day it is due");
        }
        if (!YearMonth.from(dueOn).equals(month.value().plusMonths(1))) {
            throw new IllegalArgumentException("A report is due in the month after the one it reports");
        }
    }

    public static NextReport after(ReportSettings settings, List<SentReport> sent, LocalDate today) {
        ReportMonth previous = ReportMonth.previousTo(today);
        boolean previousSent = sent.stream().anyMatch(report -> report.month().equals(previous));
        ReportMonth next = previousSent ? new ReportMonth(YearMonth.from(today)) : previous;
        return new NextReport(next, settings.sendDateFor(next));
    }
}
