package cz.novanadeje.app.content.domain;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class SlugNotDerivable extends RuleViolation {

    public static final String CODE = "content/slug-not-derivable";

    public SlugNotDerivable() {
        super(CODE, "No slug can be made from the text");
    }
}
