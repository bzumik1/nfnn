package cz.novanadeje.app.donations.infrastructure.events;

import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;

public final class DonationLiveFeeds {

    public static final LiveFeed DONATIONS = new LiveFeed("donations", LiveFeed.Audience.DONOR);
    public static final LiveFeed BANK_ACCOUNTS = new LiveFeed("bank-accounts", LiveFeed.Audience.DONOR);
    public static final LiveFeed BANK_IMPORT = new LiveFeed("bank-import", LiveFeed.Audience.EVERYONE);
    public static final LiveFeed PAYMENTS = new LiveFeed("payments", LiveFeed.Audience.ADMINISTRATION);

    private DonationLiveFeeds() {
    }
}
