package cz.novanadeje.app.content.application.about;

import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;

public record AboutCommand(Optional<MediaId> photo, Optional<String> alt, Optional<String> caption) {

    public AboutCommand {
        if (photo == null || alt == null || caption == null) {
            throw new IllegalArgumentException("An About command carries the photo, its description and its caption even when absent");
        }
    }

    Optional<AboutPhoto> toPhoto() {
        return photo.map(image -> new AboutPhoto(image, alt, caption));
    }
}
