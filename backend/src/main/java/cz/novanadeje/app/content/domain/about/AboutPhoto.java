package cz.novanadeje.app.content.domain.about;

import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;

public record AboutPhoto(MediaId image, Optional<String> alt, Optional<String> caption) {

    public static final int MAX_ALT_LENGTH = 200;
    public static final int MAX_CAPTION_LENGTH = 200;

    public AboutPhoto {
        if (image == null || alt == null || caption == null) {
            throw new IllegalArgumentException("The About photo has an image, a description and a caption (each text even when absent)");
        }
        alt = text(alt, "description", MAX_ALT_LENGTH);
        caption = text(caption, "caption", MAX_CAPTION_LENGTH);
    }

    private static Optional<String> text(Optional<String> value, String name, int maxLength) {
        Optional<String> stripped = value.map(String::strip).filter(text -> !text.isEmpty());
        if (stripped.isPresent() && stripped.get().length() > maxLength) {
            throw new IllegalArgumentException("The " + name + " of the About photo is at most " + maxLength + " characters");
        }
        return stripped;
    }
}
