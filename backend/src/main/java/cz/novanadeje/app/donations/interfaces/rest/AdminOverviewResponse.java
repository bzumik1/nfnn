package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.OverviewView;
import cz.novanadeje.app.donations.domain.report.MonthOverview;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.donations.domain.report.YearOverview;

import java.time.Year;
import java.util.List;

public record AdminOverviewResponse(int year, List<Integer> availableYears, long donorsRegistered, long newDonors, TallyResponse received,
                                    TallyResponse paired, TallyResponse unpaired, List<Month> months) {

    public record TallyResponse(int count, long totalMinor, String currency) {

        static TallyResponse from(Tally tally) {
            return new TallyResponse(tally.count(), tally.total().amountMinor(), tally.total().currency().name());
        }
    }

    public record Month(String month, TallyResponse received, long newDonors, TallyResponse paired, TallyResponse unpaired) {

        static Month from(MonthOverview overview) {
            return new Month(overview.month().toString(), TallyResponse.from(overview.received()), overview.newDonors(),
                    TallyResponse.from(overview.paired()), TallyResponse.from(overview.unpaired()));
        }
    }

    static AdminOverviewResponse from(OverviewView view) {
        YearOverview year = view.year();
        return new AdminOverviewResponse(year.year().getValue(), view.availableYears().stream().map(Year::getValue).toList(),
                year.donorsRegistered(), year.newDonors(), TallyResponse.from(year.received()), TallyResponse.from(year.paired()),
                TallyResponse.from(year.unpaired()), year.months().stream().map(Month::from).toList());
    }
}
