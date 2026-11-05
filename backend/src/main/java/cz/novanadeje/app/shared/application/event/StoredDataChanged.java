package cz.novanadeje.app.shared.application.event;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public record StoredDataChanged(LiveFeed feed, Optional<UUID> donor) {

    public StoredDataChanged {
        Objects.requireNonNull(feed, "feed");
        Objects.requireNonNull(donor, "donor");
        if ((feed.audience() == LiveFeed.Audience.DONOR) != donor.isPresent()) {
            throw new IllegalArgumentException("Feed " + feed + " needs a donor exactly when it belongs to one");
        }
    }

    public static StoredDataChanged ofDonor(LiveFeed feed, UUID donor) {
        return new StoredDataChanged(feed, Optional.of(donor));
    }

    public static StoredDataChanged of(LiveFeed feed) {
        return new StoredDataChanged(feed, Optional.empty());
    }
}
