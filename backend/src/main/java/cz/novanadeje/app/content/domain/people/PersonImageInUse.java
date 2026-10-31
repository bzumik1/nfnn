package cz.novanadeje.app.content.domain.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class PersonImageInUse extends RuleViolation {

    public static final String CODE = "content/person-image-in-use";

    public PersonImageInUse(MediaId image) {
        super(CODE, "Image " + image + " is already a portrait or a web signature of a person of the foundation and cannot serve as the other");
    }
}
