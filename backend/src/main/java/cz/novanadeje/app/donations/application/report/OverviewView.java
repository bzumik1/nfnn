package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.YearOverview;

import java.time.Year;
import java.util.List;

public record OverviewView(YearOverview year, List<Year> availableYears) {
}
