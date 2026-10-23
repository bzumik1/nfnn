package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class UnsupportedSignatureImage extends RuleViolation {

    public static final String CODE = "donations/unsupported-signature-image";

    public UnsupportedSignatureImage(String reason) {
        super(CODE, "The uploaded file cannot be used as a signature image: " + reason);
    }
}
