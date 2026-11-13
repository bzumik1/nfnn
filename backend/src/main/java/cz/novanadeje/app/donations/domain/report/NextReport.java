package cz.novanadeje.app.donations.domain.report;

import java.time.LocalDate;

public record NextReport(ReportMonth month, LocalDate dueOn) {
}
