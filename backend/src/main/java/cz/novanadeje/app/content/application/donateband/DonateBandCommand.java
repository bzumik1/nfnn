package cz.novanadeje.app.content.application.donateband;

import cz.novanadeje.app.content.domain.donateband.DonateBandPhoto;
import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;

public record DonateBandCommand(Optional<MediaId> photo, Optional<String> alt) {

    public DonateBandCommand {
        if (photo == null || alt == null) {
            throw new IllegalArgumentException("A donate band command carries the photo and its description even when absent");
        }
    }

    Optional<DonateBandPhoto> toPhoto() {
        return photo.map(image -> new DonateBandPhoto(image, alt));
    }
}
