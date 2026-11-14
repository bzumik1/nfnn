package cz.novanadeje.app.donations.infrastructure.events;

import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DonationLiveFeedsTest {

    @Test
    @DisplayName("Given donations' live feeds, when their names and audiences are read, then they are the wire names and audiences the app and the contract know")
    void should_name_the_wire_feeds_with_their_audiences_when_read_given_donations_feeds() {
        assertThat(DonationLiveFeeds.DONATIONS).isEqualTo(new LiveFeed("donations", LiveFeed.Audience.DONOR));
        assertThat(DonationLiveFeeds.BANK_ACCOUNTS).isEqualTo(new LiveFeed("bank-accounts", LiveFeed.Audience.DONOR));
        assertThat(DonationLiveFeeds.BANK_IMPORT).isEqualTo(new LiveFeed("bank-import", LiveFeed.Audience.EVERYONE));
        assertThat(DonationLiveFeeds.PAYMENTS).isEqualTo(new LiveFeed("payments", LiveFeed.Audience.ADMINISTRATION));
    }
}
