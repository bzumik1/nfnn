package cz.novanadeje.app.content.domain.donateband;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;

public record DonateBandPhoto(MediaId image, Optional<String> alt) {

    public static final int MAX_ALT_LENGTH = 200;

    public DonateBandPhoto {
        if (image == null || alt == null) {
            throw new IllegalArgumentException("The photo of the donate band has an image and a description (even when absent)");
        }
        alt = alt.map(String::strip).filter(text -> !text.isEmpty());
        if (alt.isPresent() && alt.get().length() > MAX_ALT_LENGTH) {
            throw new IllegalArgumentException("The description of the donate band photo is at most " + MAX_ALT_LENGTH + " characters");
        }
    }
}
