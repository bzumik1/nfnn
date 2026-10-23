package cz.novanadeje.app.content.domain.media;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class UnsupportedImage extends RuleViolation {

    public static final String CODE = "content/unsupported-image";

    public UnsupportedImage(String reason) {
        super(CODE, "The uploaded file cannot be used as an image: " + reason);
    }
}
