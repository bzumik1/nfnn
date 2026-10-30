package cz.novanadeje.app.content.domain.about;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.time.Instant;
import java.util.Optional;

public record AboutSection(Optional<AboutPhoto> photo, Instant updatedAt) {

    public AboutSection {
        if (photo == null || updatedAt == null) {
            throw new IllegalArgumentException("The About section has a photo (even when absent) and the time of its last change");
        }
    }

    public static AboutSection withoutPhoto(Instant at) {
        return new AboutSection(Optional.empty(), at);
    }

    public AboutSection show(Optional<AboutPhoto> next, Instant now) {
        return new AboutSection(next, now);
    }

    public Optional<MediaId> image() {
        return photo.map(AboutPhoto::image);
    }

    public Optional<MediaId> imageLeftBy(AboutSection next) {
        return image().filter(current -> !next.image().equals(Optional.of(current)));
    }
}
