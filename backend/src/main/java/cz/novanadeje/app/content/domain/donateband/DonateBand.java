package cz.novanadeje.app.content.domain.donateband;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.time.Instant;
import java.util.Optional;

public record DonateBand(Optional<DonateBandPhoto> photo, Instant updatedAt) {

    public DonateBand {
        if (photo == null || updatedAt == null) {
            throw new IllegalArgumentException("The donate band has a photo (even when absent) and the time of its last change");
        }
    }

    public static DonateBand withoutPhoto(Instant at) {
        return new DonateBand(Optional.empty(), at);
    }

    public DonateBand show(Optional<DonateBandPhoto> next, Instant now) {
        return new DonateBand(next, now);
    }

    public Optional<MediaId> image() {
        return photo.map(DonateBandPhoto::image);
    }

    public Optional<MediaId> imageLeftBy(DonateBand next) {
        return image().filter(current -> !next.image().equals(Optional.of(current)));
    }
}
