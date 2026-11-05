package cz.novanadeje.app.content.domain.media;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class FocalPointOnPersonImage extends RuleViolation {

    public static final String CODE = "content/focal-point-on-person-image";

    public FocalPointOnPersonImage(MediaId image) {
        super(CODE, "Image " + image + " is a portrait or a web signature of a person of the foundation, which takes no focal point");
    }
}
