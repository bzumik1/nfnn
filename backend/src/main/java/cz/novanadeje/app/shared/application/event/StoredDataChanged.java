package cz.novanadeje.app.shared.application.event;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

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

    public record LiveFeed(String name, Audience audience) {

        public static final int MAXIMUM_NAME_LENGTH = 40;
        private static final Pattern NAME_SHAPE = Pattern.compile("[a-z]+(-[a-z]+)*");

        public LiveFeed {
            Objects.requireNonNull(name, "name");
            Objects.requireNonNull(audience, "audience");
            if (name.length() > MAXIMUM_NAME_LENGTH) {
                throw new IllegalArgumentException("Live feed name must be at most " + MAXIMUM_NAME_LENGTH + " characters");
            }
            if (!NAME_SHAPE.matcher(name).matches()) {
                throw new IllegalArgumentException("Live feed name must be lower-case words joined by hyphens");
            }
        }

        public enum Audience {
            DONOR,
            EVERYONE,
            ADMINISTRATION
        }
    }
}
