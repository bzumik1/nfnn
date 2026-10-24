package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.application.settings.TestEmailOutcome;
import cz.novanadeje.app.operations.application.settings.TestEmailResult;

record TestEmailResponse(TestEmailOutcome outcome, boolean sent, String recipient) {

    static TestEmailResponse from(TestEmailResult result) {
        return new TestEmailResponse(result.outcome(), result.outcome() == TestEmailOutcome.SENT, result.recipient());
    }
}
