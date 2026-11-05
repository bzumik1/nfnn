package cz.novanadeje.app.operations.domain.push;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class PushEndpointRefused extends RuleViolation {

    public static final String CODE = "operations/push-endpoint-refused";

    public PushEndpointRefused() {
        super(CODE, "A push endpoint is an https address of a known push service");
    }
}
