package cz.novanadeje.app.operations.application.settings;

public enum TestEmailOutcome {
    SENT,
    UNREACHABLE,
    TIMEOUT,
    STARTTLS_UNAVAILABLE,
    SIGN_IN_REFUSED,
    SENDER_REFUSED,
    RECIPIENT_REFUSED,
    FAILED
}
