package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class PushKeysRefused extends RuleViolation {

    public static final String CODE = "operations/push-keys-refused";

    public PushKeysRefused() {
        super(CODE, "The keys of a push subscription are a P-256 point and a 16-byte secret in base64url");
    }
}
