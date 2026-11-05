package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.sync.AdminDonationsSyncSnapshot;
import cz.novanadeje.app.donations.domain.report.YearOverview;
import cz.novanadeje.app.donations.interfaces.rest.AdminOverviewResponse.Month;
import cz.novanadeje.app.donations.interfaces.rest.AdminOverviewResponse.TallyResponse;

import java.util.List;

record AdminDonationsSyncSummaryResponse(List<YearResponse> byYear) {

    static AdminDonationsSyncSummaryResponse from(AdminDonationsSyncSnapshot snapshot) {
        return new AdminDonationsSyncSummaryResponse(snapshot.years().stream().map(YearResponse::from).toList());
    }

    record YearResponse(int year, long donorsRegistered, long newDonors, long givingDonors, TallyResponse received, TallyResponse paired,
                        TallyResponse unpaired, List<Month> months) {

        static YearResponse from(YearOverview year) {
            return new YearResponse(year.year().getValue(), year.donorsRegistered(), year.newDonors(), year.givingDonors(),
                    TallyResponse.from(year.received()), TallyResponse.from(year.paired()), TallyResponse.from(year.unpaired()),
                    year.months().stream().map(Month::from).toList());
        }
    }
}
