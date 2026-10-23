package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.OverviewView;
import cz.novanadeje.app.donations.domain.report.MonthOverview;
import cz.novanadeje.app.donations.domain.report.Tally;

import java.time.Year;
import java.util.List;

public record AdminOverviewResponse(int year, List<Integer> availableYears, long donorsRegistered, long newDonors, TallyResponse donations,
                                    TallyResponse unpairedPayments, List<Month> months) {

    public record TallyResponse(int count, long totalMinor, String currency) {

        static TallyResponse from(Tally tally) {
            return new TallyResponse(tally.count(), tally.total().amountMinor(), tally.total().currency().name());
        }
    }

    public record Month(String month, TallyResponse donations, long newDonors, TallyResponse unpairedPayments) {

        static Month from(MonthOverview overview) {
            return new Month(overview.month().toString(), TallyResponse.from(overview.donations()), overview.newDonors(),
                    TallyResponse.from(overview.unpairedPayments()));
        }
    }

    static AdminOverviewResponse from(OverviewView view) {
        return new AdminOverviewResponse(view.year().year().getValue(), view.availableYears().stream().map(Year::getValue).toList(),
                view.year().donorsRegistered(), view.year().newDonors(), TallyResponse.from(view.year().donations()),
                TallyResponse.from(view.year().unpairedPayments()), view.year().months().stream().map(Month::from).toList());
    }
}
