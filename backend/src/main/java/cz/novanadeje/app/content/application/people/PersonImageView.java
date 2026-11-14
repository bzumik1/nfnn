package cz.novanadeje.app.content.application.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaSize;

import java.util.Map;
import java.util.Optional;

public record PersonImageView(MediaId id, int width, int height) {

    public static Optional<PersonImageView> of(Optional<MediaId> image, MediaImageRepository media) {
        return image.flatMap(id -> media.findSize(id).map(size -> new PersonImageView(id, size.width(), size.height())));
    }

    public static Optional<PersonImageView> of(Optional<MediaId> image, Map<MediaId, MediaSize> sizes) {
        return image.flatMap(id -> Optional.ofNullable(sizes.get(id)).map(size -> new PersonImageView(id, size.width(), size.height())));
    }
}
