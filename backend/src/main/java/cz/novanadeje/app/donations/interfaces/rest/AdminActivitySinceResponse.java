package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.report.ActivitySince;
import cz.novanadeje.app.donations.interfaces.rest.AdminOverviewResponse.TallyResponse;

import java.time.Instant;

public record AdminActivitySinceResponse(Instant from, TallyResponse payments, TallyResponse paired, TallyResponse unpaired, long newDonors) {

    static AdminActivitySinceResponse from(ActivitySince activity) {
        return new AdminActivitySinceResponse(activity.from(), TallyResponse.from(activity.payments()), TallyResponse.from(activity.paired()),
                TallyResponse.from(activity.unpaired()), activity.newDonors());
    }
}
