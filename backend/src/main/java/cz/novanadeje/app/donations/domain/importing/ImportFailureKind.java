package cz.novanadeje.app.donations.domain.importing;

public enum ImportFailureKind {
    RATE_LIMITED,
    HISTORY_LOCKED,
    UNAUTHORIZED,
    TRANSPORT,
    INVALID_RESPONSE,
    UNEXPECTED
}
